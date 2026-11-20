// GymPulse Production Launcher
// Starts the native Node.js HTTP server on the configured port,
// forwards via Cloudflare Tunnel, and displays ONLY the clean public URL.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || process.argv[2] || 5000;
let serverProcess = null;
let tunnelProcess = null;
let tunnelUrlFound = false;

function cleanShutdown() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill('SIGKILL');
    } catch (_) {}
  }
  if (serverProcess) {
    try {
      serverProcess.kill('SIGKILL');
    } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanShutdown);
process.on('SIGTERM', cleanShutdown);
process.on('exit', cleanShutdown);

console.log(`Starting GymPulse application server on port ${PORT}...`);

// 1. Launch Node.js Backend Server
serverProcess = spawn('node', ['server.js', String(PORT)], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

serverProcess.stderr.on('data', (data) => {
  if (!tunnelUrlFound) {
    const msg = data.toString();
    if (msg.includes('EADDRINUSE')) {
      console.error(`\nError: Port ${PORT} is already in use. Please close existing processes or run with a different port (e.g. run.cmd 5001).`);
      cleanShutdown();
    }
  }
});

serverProcess.on('exit', (code) => {
  if (!tunnelUrlFound && code !== 0) {
    console.error(`\nServer exited with error code ${code}`);
    cleanShutdown();
  }
});

// 2. Start Cloudflare Tunnel once local server is listening
setTimeout(() => {
  console.log('Connecting Cloudflare Tunnel to forward local port...');

  tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  const urlRegex = /(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/;

  function handleTunnelOutput(chunk) {
    const text = chunk.toString();
    const match = text.match(urlRegex);
    if (match && !tunnelUrlFound) {
      tunnelUrlFound = true;
      const publicUrl = match[1];

      // Clear the console and print ONLY the clean public URL banner
      try {
        process.stdout.write('\x1Bc');
      } catch (_) {
        console.clear();
      }

      console.log('======================================================================');
      console.log('                   GYMPULSE :: LIVE APPLICATION                     ');
      console.log('======================================================================\n');
      console.log('  Public URL:');
      console.log(`  --> \x1b[32m\x1b[1m${publicUrl}\x1b[0m\n`);
      console.log(`  Local Address : http://localhost:${PORT}`);
      console.log('  Protection    : Frontend Obfuscated & DevTools Guard Enabled');
      console.log('  Status        : Ready & Connected\n');
      console.log('  (Press Ctrl+C to shut down server and tunnel)');
      console.log('======================================================================\n');
    }
  }

  tunnelProcess.stdout.on('data', handleTunnelOutput);
  tunnelProcess.stderr.on('data', handleTunnelOutput);

  tunnelProcess.on('error', (err) => {
    console.error(`\nFailed to start cloudflared tunnel: ${err.message}`);
    console.log(`Local application is running at: http://localhost:${PORT}`);
  });

  tunnelProcess.on('exit', (code) => {
    if (!tunnelUrlFound) {
      console.error(`\nCloudflared exited unexpectedly (code ${code}).`);
      console.log(`You can still access the app locally at: http://localhost:${PORT}`);
    }
  });

}, 800);
