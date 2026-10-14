/**
 * AURA PRINT PRO — WINDOWS NT SERVICE INSTALLER
 * File: agent/install-service.js
 * Platform: Windows 10 / 11 (Requires Administrator Privileges)
 * Owner: Sabir Ansari
 * 
 * Uses node-windows to register `agent/print-agent.js` as an auto-starting Windows Service.
 */

const path = require('path');
const { Service } = require('node-windows');

// Verify script path resolution
const scriptPath = path.resolve(__dirname, 'print-agent.js');

console.log('================================================================');
console.log('       AURA PRINT PRO — WINDOWS NT SERVICE INSTALLATION         ');
console.log('================================================================');
console.log(`Target Script: ${scriptPath}`);

// Initialize the Windows Service configuration
const svc = new Service({
  name: 'AuraPrintProAgent',
  description: 'AURA Print Pro Background Print Agent for Automated Counter Printing',
  script: scriptPath,
  nodeOptions: [
    '--max_old_space_size=512'
  ],
  // Auto-restart behavior on unexpected crash
  abortOnError: false,
  grow: 0.25,
  maxRestarts: 10,
  wait: 2
});

// Event: Service installation successfully completed
svc.on('install', () => {
  console.log('\n[SUCCESS] Windows Service "AuraPrintProAgent" installed successfully.');
  console.log('[INFO] Starting service now...');
  svc.start();
});

// Event: Service started
svc.on('start', () => {
  console.log('[SUCCESS] Service is running in the background.');
  console.log('[INFO] It will now start automatically whenever Windows boots.');
  console.log('================================================================');
});

// Event: Service already exists
svc.on('alreadyinstalled', () => {
  console.log('\n[WARNING] "AuraPrintProAgent" is already installed on this PC.');
  console.log('[INFO] To reinstall, run "npm run uninstall-service" first.');
  console.log('================================================================');
});

// Event: Error during installation
svc.on('error', (err) => {
  console.error('\n[ERROR] An error occurred during service installation:', err);
  console.error('[HINT] Ensure you ran this command in PowerShell/CMD as "Administrator".');
  console.log('================================================================');
});

// Trigger installation
svc.install();
