/**
 * AURA PRINT PRO — NATIVE WINDOWS BACKGROUND PRINT AGENT DAEMON
 * File: agent/print-agent.js
 * Platform: Windows 10 / 11 (Node.js runtime or packaged executable)
 * Owner: Sabir Ansari
 * 
 * Features:
 * 1. Automatic printer hardware discovery via Windows PowerShell (Get-CimInstance)
 * 2. Smart auto-routing: B&W documents to high-speed laser, Color/Photos to ink tank
 * 3. Continuous long-polling loop against cloud queue (/api/agent-poll?action=poll)
 * 4. Secure signed URL document download into isolated temporary spool directory
 * 5. Headless silent printing via SumatraPDF with exact hardware directives
 * 6. Automated status acknowledgment (/api/agent-poll?action=ack) with retry backoff
 * 7. Graceful temp-file garbage collection and crash recovery
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { exec, execFile } = require('child_process');

// ==============================================================================
// 1. CONFIGURATION LOADER & VALIDATION
// ==============================================================================
const CONFIG_PATH = path.resolve(__dirname, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[FATAL] Configuration file not found at: ${CONFIG_PATH}`);
    process.exit(1);
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);

    if (!config.auth || !config.auth.shopId || !config.auth.agentToken) {
      console.error('[FATAL] Missing required auth credentials (shopId, agentToken) in config.json');
      process.exit(1);
    }

    return config;
  } catch (err) {
    console.error('[FATAL] Error parsing config.json:', err.message);
    process.exit(1);
  }
}

const config = loadConfig();

// Ensure local temporary and log directories exist
if (!fs.existsSync(config.spooler.tempDirectory)) {
  fs.mkdirSync(config.spooler.tempDirectory, { recursive: true });
}

if (config.logging.logToFile && !fs.existsSync(config.logging.logDirectory)) {
  fs.mkdirSync(config.logging.logDirectory, { recursive: true });
}

// ==============================================================================
// 2. LOGGING & AUDIO UTILITIES
// ==============================================================================
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;

  if (config.logging.logToConsole) {
    if (level === 'error') console.error(formatted);
    else if (level === 'warn') console.warn(formatted);
    else console.log(formatted);
  }

  if (config.logging.logToFile) {
    const logFilePath = path.join(config.logging.logDirectory, config.logging.logFileName || 'agent.log');
    try {
      fs.appendFileSync(logFilePath, formatted + '\n', 'utf8');
    } catch {
      // Fallback silently if disk is temporarily locked
    }
  }
}

function playAudioAlert(type = 'ping') {
  if (!config.notifications || !config.notifications.soundAlertOnJobReceived) return;

  // Emit Windows standard console bell
  try {
    process.stdout.write('\x07');
  } catch {
    // Suppress console stream errors
  }
}

// ==============================================================================
// 3. HARDWARE PRINTER DISCOVERY (WINDOWS POWERSHELL)
// ==============================================================================
let discoveredPrinters = [];
let defaultSystemPrinter = '';

function detectWindowsPrinters() {
  return new Promise((resolve) => {
    // Windows PowerShell command querying installed printer devices
    const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default, PrinterStatus, WorkOffline | ConvertTo-Json -Compress"`;

    exec(psCmd, { timeout: 8000 }, (err, stdout) => {
      if (err) {
        log('warn', 'Could not query installed Windows printers via PowerShell:', err.message);
        return resolve([]);
      }

      try {
        let parsed = JSON.parse(stdout.trim());
        if (!Array.isArray(parsed)) {
          parsed = [parsed];
        }

        discoveredPrinters = parsed.map(p => ({
          name: p.Name,
          isDefault: Boolean(p.Default),
          isOffline: Boolean(p.WorkOffline)
        }));

        const def = discoveredPrinters.find(p => p.isDefault);
        defaultSystemPrinter = def ? def.name : (discoveredPrinters[0]?.name || '');

        log('info', `Discovered ${discoveredPrinters.length} installed printers on system. Default: "${defaultSystemPrinter}"`);
        resolve(discoveredPrinters);
      } catch (parseErr) {
        log('warn', 'Failed to parse PowerShell printer list output:', parseErr.message);
        resolve([]);
      }
    });
  });
}

/**
 * Resolves destination printer hardware based on order specification
 */
function resolveTargetPrinter(printDirectives) {
  const { isColor } = printDirectives;

  // 1. Explicit color printer requested for color document
  if (isColor && config.printers.colorPrinter) {
    const found = discoveredPrinters.find(p => p.name.toLowerCase() === config.printers.colorPrinter.toLowerCase());
    if (found) return found.name;
  }

  // 2. Configured default printer
  if (config.printers.defaultPrinter) {
    const found = discoveredPrinters.find(p => p.name.toLowerCase() === config.printers.defaultPrinter.toLowerCase());
    if (found) return found.name;
  }

  // 3. Fallback to Windows default system printer
  if (defaultSystemPrinter) {
    return defaultSystemPrinter;
  }

  return '';
}

// ==============================================================================
// 4. SECURE HTTP REQUEST HELPERS
// ==============================================================================
function sendHttpRequest(endpointUrl, method, payload, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(endpointUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestData = payload ? JSON.stringify(payload) : null;

    const headers = {
      'User-Agent': 'AuraPrintPro-WindowsAgent/1.0.0',
      'x-shop-id': config.auth.shopId,
      'x-agent-token': config.auth.agentToken,
      'Content-Type': 'application/json',
      ...extraHeaders
    };

    if (requestData) {
      headers['Content-Length'] = Buffer.byteLength(requestData);
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method.toUpperCase(),
      headers,
      timeout: config.server.requestTimeoutMs || 10000
    };

    const req = client.request(options, (res) => {
      let responseBody = '';

      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(responseBody);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(data.message || `HTTP ${res.statusCode}: ${responseBody}`));
          }
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ raw: responseBody });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
          }
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP Request timeout after ${config.server.requestTimeoutMs}ms`));
    });

    if (requestData) req.write(requestData);
    req.end();
  });
}

/**
 * Downloads binary document stream from secure signed URL to local temp directory
 */
function downloadFile(sourceUrl, destinationPath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(sourceUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const fileStream = fs.createWriteStream(destinationPath);

    const req = client.get(sourceUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect (common with Firebase Storage signed URLs)
        fileStream.close();
        fs.unlinkSync(destinationPath);
        return resolve(downloadFile(res.headers.location, destinationPath));
      }

      if (res.statusCode !== 200) {
        fileStream.close();
        if (fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath);
        return reject(new Error(`Failed to download file. Server responded with HTTP ${res.statusCode}`));
      }

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve(destinationPath));
      });
    });

    req.on('error', (err) => {
      fileStream.close();
      if (fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      fileStream.close();
      if (fs.existsSync(destinationPath)) fs.unlinkSync(destinationPath);
      reject(new Error('Download timeout exceeded'));
    });
  });
}

// ==============================================================================
// 5. SUMATRAPDF HEADLESS PRINT ENGINE
// ==============================================================================

/**
 * Verifies the presence of SumatraPDF on the machine.
 * If missing, falls back to common system locations or alerts the user.
 */
function resolveSumatraBinary() {
  const candidatePaths = [
    config.spooler.sumatraExecutablePath,
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
    'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
    path.join(process.env.LOCALAPPDATA || '', 'SumatraPDF', 'SumatraPDF.exe'),
    path.join(__dirname, 'bin', 'SumatraPDF.exe')
  ];

  for (const p of candidatePaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * Spools a document directly to the Windows Print Spooler using SumatraPDF CLI.
 * 
 * Flags utilized:
 * -print-to <printerName>
 * -print-settings "<copies>x,color|monochrome,duplex|simplex,<pages>"
 * -silent (suppresses GUI windows)
 */
function executePrintJob(localFilePath, targetPrinter, directives) {
  return new Promise((resolve, reject) => {
    const sumatraExe = resolveSumatraBinary();
    if (!sumatraExe) {
      return reject(new Error('SumatraPDF executable not found. Please install SumatraPDF or set path in config.json.'));
    }

    // Build print settings string
    const settingsParts = [];

    // 1. Copies (e.g., '2x')
    const copies = directives.copies || 1;
    settingsParts.push(`${copies}x`);

    // 2. Color mode
    settingsParts.push(directives.isColor ? 'color' : 'monochrome');

    // 3. Duplex / Simplex
    if (directives.isDuplex) {
      settingsParts.push('duplex'); // Long edge duplex standard
    } else {
      settingsParts.push('simplex');
    }

    // 4. Page ranges (e.g., '1-3,5')
    if (directives.pageRanges && directives.pageRanges !== 'ALL') {
      settingsParts.push(directives.pageRanges);
    }

    // 5. Paper fit
    if (config.printers.paperHandling && config.printers.paperHandling.fitToPage) {
      settingsParts.push('fit');
    }

    const printSettingsArg = settingsParts.join(',');

    const args = [
      '-print-to', targetPrinter,
      '-print-settings', printSettingsArg,
      '-silent',
      localFilePath
    ];

    log('info', `Spooling to hardware printer "${targetPrinter}" via SumatraPDF:`, args.join(' '));

    const timeoutMs = config.spooler.spoolTimeoutMs || 60000;

    execFile(sumatraExe, args, { timeout: timeoutMs }, (err) => {
      if (err) {
        log('error', `SumatraPDF execution failed for ${localFilePath}:`, err.message);
        return reject(err);
      }

      log('info', `Successfully dispatched to Windows Print Spooler: ${targetPrinter}`);
      resolve(true);
    });
  });
}

// ==============================================================================
// 6. PRINT JOB ORCHESTRATION & ACKNOWLEDGEMENT
// ==============================================================================

async function processIncomingJob(job) {
  log('info', `Processing Claimed Print Job: Order ID [${job.orderId}] | File: ${job.documentName}`);
  playAudioAlert('ping');

  const targetPrinter = resolveTargetPrinter(job.printDirectives);
  if (!targetPrinter) {
    const errMsg = 'No accessible Windows printer hardware found on this station.';
    log('error', errMsg);
    await acknowledgeJob(job.orderId, false, errMsg);
    return;
  }

  // Construct local destination path
  const sanitizedName = (job.documentName || 'document.pdf').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const tempFileName = `aura_${job.orderId}_${Date.now()}_${sanitizedName}`;
  const localTempPath = path.join(config.spooler.tempDirectory, tempFileName);

  try {
    // 1. Download document
    log('info', `Downloading document for Order [${job.orderId}]...`);
    await downloadFile(job.downloadUrl, localTempPath);

    // 2. Execute Silent Spooling
    await executePrintJob(localTempPath, targetPrinter, job.printDirectives);

    // 3. Acknowledge Success to Cloud Backend
    await acknowledgeJob(job.orderId, true);
    log('info', `Order [${job.orderId}] marked PRINTED successfully.`);

  } catch (err) {
    log('error', `Failed processing print job [${job.orderId}]:`, err.message);
    // Report Failure to Cloud
    await acknowledgeJob(job.orderId, false, err.message);
  } finally {
    // 4. Temporary Spool File Cleanup
    if (config.spooler.cleanTempAfterPrint && fs.existsSync(localTempPath)) {
      try {
        fs.unlinkSync(localTempPath);
        log('debug', `Cleaned temp spool file: ${localTempPath}`);
      } catch (cleanErr) {
        log('warn', `Could not delete temp spool file: ${cleanErr.message}`);
      }
    }
  }
}

/**
 * Notifies cloud server of print job outcome
 */
async function acknowledgeJob(orderId, isSuccess, errorReason = null) {
  const url = `${config.server.apiBaseUrl}${config.server.pollEndpoint}?action=ack`;
  const payload = {
    orderId,
    success: isSuccess,
    errorReason,
    printedAt: Date.now()
  };

  for (let attempt = 1; attempt <= (config.spooler.maxRetries || 3); attempt++) {
    try {
      await sendHttpRequest(url, 'POST', payload);
      return;
    } catch (err) {
      log('warn', `Acknowledgement attempt ${attempt} failed for Order [${orderId}]: ${err.message}`);
      if (attempt < config.spooler.maxRetries) {
        await new Promise(r => setTimeout(r, config.spooler.retryDelayMs || 2000));
      }
    }
  }

  log('error', `Failed to deliver ACK to server for Order [${orderId}] after maximum retries.`);
}

// ==============================================================================
// 7. BACKGROUND LONG-POLLING & HEARTBEAT LOOP
// ==============================================================================
let isPollingActive = false;
let isShuttingDown = false;

async function pollQueueIteration() {
  if (isPollingActive || isShuttingDown) return;
  isPollingActive = true;

  const url = `${config.server.apiBaseUrl}${config.server.pollEndpoint}?action=poll`;
  const payload = {
    agentVersion: '1.0.0',
    osPlatform: process.platform,
    printerName: defaultSystemPrinter || 'Default Spooler',
    spoolerStatus: 'IDLE'
  };

  try {
    const response = await sendHttpRequest(url, 'POST', payload);

    if (response && response.hasJob && response.job) {
      // Process Job immediately
      await processIncomingJob(response.job);
    }
  } catch (err) {
    log('warn', `Polling cycle error: ${err.message}`);
  } finally {
    isPollingActive = false;
  }
}

// ==============================================================================
// 8. DAEMON INITIALIZATION & LIFECYCLE
// ==============================================================================
async function startDaemon() {
  console.clear();
  console.log('================================================================');
  console.log('         AURA PRINT PRO — WINDOWS BACKGROUND PRINT AGENT        ');
  console.log('       Engineered for Indian CSC Centres & Xerox Hubs           ');
  console.log('================================================================');
  log('info', `Agent Service started for Shop Slug: [${config.auth.shopId}]`);
  log('info', `Connecting to cloud endpoint: ${config.server.apiBaseUrl}`);

  // 1. Detect Hardware Printers
  await detectWindowsPrinters();

  // 2. Validate SumatraPDF binary
  const sumatraPath = resolveSumatraBinary();
  if (!sumatraPath) {
    log('error', 'WARNING: SumatraPDF.exe was not detected in common system paths.');
    log('error', 'Silent background vector printing will fail until SumatraPDF is installed.');
  } else {
    log('info', `SumatraPDF Engine verified: ${sumatraPath}`);
  }

  // 3. Start Polling Loop
  const pollInterval = config.server.pollIntervalMs || 3000;
  setInterval(pollQueueIteration, pollInterval);

  // Trigger initial polling cycle immediately
  pollQueueIteration();
}

// Graceful termination handling
process.on('SIGINT', () => {
  log('info', 'Received SIGINT. Shutting down Windows Print Agent daemon gracefully...');
  isShuttingDown = true;
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM. Terminating agent background worker...');
  isShuttingDown = true;
  process.exit(0);
});

// Start Daemon
startDaemon();
