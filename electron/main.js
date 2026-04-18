const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Set the application name for the OS
app.setName('Doc Anonymizer');

let mainWindow = null;
let activePythonProcess = null;

function createWindow() {
  const appPath = app.getAppPath();
  const iconPath = path.join(appPath, 'public/icon.png');

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 700,
    resizable: true,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if ((input.meta && input.alt && input.key.toLowerCase() === 'i') || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow.webContents.openDevTools();
      }
    });
  }

  // Set dock icon for macOS
  if (process.platform === 'darwin' && require('fs').existsSync(iconPath)) {
    app.dock.setIcon(iconPath);
  }

  const url = process.env.VITE_DEV_SERVER_URL;
  if (url) {
    mainWindow.loadURL(url).catch(err => {
      if (!app.isPackaged) console.error('Failed to load URL:', err);
    });
  } else {
    const possiblePaths = [
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(app.getAppPath(), 'dist', 'index.html'),
      path.join(process.resourcesPath, 'app', 'dist', 'index.html'),
    ];

    let loaded = false;
    for (const indexPath of possiblePaths) {
      if (require('fs').existsSync(indexPath)) {
        mainWindow.loadFile(indexPath).catch(err => {
          if (!app.isPackaged) console.error(`Failed to load file at ${indexPath}:`, err);
        });
        loaded = true;
        break;
      }
    }

    if (!loaded) {
      console.error('CRITICAL: dist/index.html not found.');
    }
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (activePythonProcess) {
    activePythonProcess.kill();
    activePythonProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('start-anonymization', async (event, { inputPath, outputPath, mode }) => {
  const ALLOWED_MODES = ['default', 'aggressive'];
  const safeMode = ALLOWED_MODES.includes(mode) ? mode : 'default';
  const safeInput = path.resolve(inputPath);
  const safeOutput = path.resolve(outputPath);
  if (!path.isAbsolute(safeInput) || !path.isAbsolute(safeOutput)) throw new Error('Invalid paths');
  if (safeInput === safeOutput) throw new Error('Input and output folders must be different');

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    let pythonExecutable;
    let extraArgs = [];

    if (app.isPackaged) {
      const binaryName = process.platform === 'win32' ? 'engine-bin.exe' : 'engine-bin';
      pythonExecutable = path.join(process.resourcesPath, 'bin', binaryName);
      extraArgs = ['--input', safeInput, '--output', safeOutput, '--mode', safeMode];
    } else {
      pythonExecutable = process.platform === 'win32'
        ? path.join(__dirname, '../engine/venv/Scripts/python.exe')
        : path.join(__dirname, '../engine/venv/bin/python');
      extraArgs = ['-m', 'engine.processor', '--input', safeInput, '--output', safeOutput, '--mode', safeMode];
    }

    const rootPath = path.join(__dirname, '..');
    const env = {
      ...process.env,
      PYTHONPATH: rootPath,
      PYTHONUNBUFFERED: '1',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8'
    };

    const pythonProcess = spawn(pythonExecutable, extraArgs, { env });
    activePythonProcess = pythonProcess;

    pythonProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.status === 'progress') {
            if (mainWindow) mainWindow.webContents.send('progress-update', message);
          } else if (message.status === 'warning') {
            if (mainWindow) mainWindow.webContents.send('warning-update', message);
          } else if (message.status === 'completed') {
            settle(resolve, { success: true });
          } else if (message.status === 'error') {
            settle(reject, new Error(message.message));
          }
        } catch (e) {
          // non-JSON stdout line — ignore
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('error', (err) => {
      settle(reject, err);
    });

    pythonProcess.on('close', (code) => {
      activePythonProcess = null;
      if (code === 0) {
        settle(resolve, { success: true });
      } else {
        settle(reject, new Error(`Python process exited with code ${code}`));
      }
    });
  });
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-external', async (event, url) => {
  let parsed;
  try { parsed = new URL(url); } catch { return; }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Disallowed protocol');
  }
  await shell.openExternal(url);
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  if (!folderPath || !path.isAbsolute(folderPath)) return;
  const err = await shell.openPath(folderPath);
  if (err) throw new Error(err);
});
