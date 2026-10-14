/**
 * AURA PRINT PRO — WINDOWS NT SERVICE UNINSTALLER
 * File: agent/uninstall-service.js
 * Platform: Windows 10 / 11 (Requires Administrator Privileges)
 * Owner: Sabir Ansari
 * 
 * Uses node-windows to stop and deregister `AuraPrintProAgent` from the Windows Service Control Manager.
 */

const path = require('path');
const { Service } = require('node-windows');

const scriptPath = path.resolve(__dirname, 'print-agent.js');

console.log('================================================================');
console.log('      AURA PRINT PRO — WINDOWS NT SERVICE REMOVAL & CLEANUP      ');
console.log('================================================================');
console.log(`Target Script: ${scriptPath}`);

// Initialize the exact matching Windows Service identifier
const svc = new Service({
  name: 'AuraPrintProAgent',
  script: scriptPath
});

// Event: Service successfully removed from Windows Service Control Manager
svc.on('uninstall', () => {
  console.log('\n[SUCCESS] Windows Service "AuraPrintProAgent" uninstalled completely.');
  console.log('[INFO] The background printing daemon has been stopped and removed.');
  console.log('[INFO] To reinstall at any time, run: npm run install-service');
  console.log('================================================================');
});

// Event: Service is not found / was not registered
svc.on('alreadyuninstalled', () => {
  console.log('\n[INFO] "AuraPrintProAgent" is not currently installed on this system.');
  console.log('================================================================');
});

// Event: Error during uninstallation
svc.on('error', (err) => {
  console.error('\n[ERROR] An error occurred during service uninstallation:', err);
  console.error('[HINT] Ensure PowerShell or Command Prompt was launched as "Administrator".');
  console.log('================================================================');
});

// Trigger uninstallation
svc.uninstall();
