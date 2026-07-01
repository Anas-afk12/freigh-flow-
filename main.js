// Electron entry point. Spawns server.js as a child process on a fixed local
// port, health-checks it, then opens a BrowserWindow pointed at the local app.
// On close it triggers a rotating SQLite backup (Improvement #10). All data
// stays local — no cloud, no external services.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 3000;
const APP_URL = `http://localhost:${PORT}`;

let serverProcess = null;
let mainWindow = null;

function startServer() {
  serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
  });
  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
  });
}

// Poll the health endpoint until the server is ready (or time out).
function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      http
        .get(`${APP_URL}/api/health`, (res) => {
          if (res.statusCode === 200) resolve();
          else retry(left);
        })
        .on('error', () => retry(left));
    };
    const retry = (left) => {
      if (left <= 0) return reject(new Error('Server did not become ready in time.'));
      setTimeout(() => attempt(left - 1), 250);
    };
    attempt(retries);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    title: 'FreightFlow PRO',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { contextIsolation: true },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(APP_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
  } catch (e) {
    console.error(e.message);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Back up the database on close, then stop the server child process.
app.on('will-quit', () => {
  try {
    const { createBackup } = require('./src/services/backupService');
    const dest = createBackup();
    if (dest) console.log(`Database backed up to ${dest}`);
  } catch (e) {
    console.error('Backup on close failed:', e.message);
  }
  if (serverProcess) serverProcess.kill();
});

app.on('window-all-closed', () => {
  // Quit on all platforms (single-user desktop app).
  app.quit();
});
