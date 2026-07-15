const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const ollama = require('./ollama');

// Set the application name for the OS
app.setName('Doc Anonymizer');

let mainWindow = null;
let activePythonProcess = null;
let cancelRequested = false;

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

  // Kick off the Ollama sidecar in the background. The renderer queries
  // `check-engine` to know when it's ready; we don't block window creation.
  ollama.ensureRunning({ packaged: app.isPackaged })
    .then(({ started, pid }) => {
      console.log(`[ollama-sidecar] ready (we_spawned=${started}${pid ? ` pid=${pid}` : ''})`);
    })
    .catch(err => {
      console.error('[ollama-sidecar] failed to start:', err.message);
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (activePythonProcess) {
    activePythonProcess.kill();
    activePythonProcess = null;
  }
  ollama.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  ollama.stop();
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

ipcMain.handle('start-anonymization', async (event, { inputPath, outputPath }) => {
  if (activePythonProcess) throw new Error('An anonymization is already running');
  const safeInput = path.resolve(inputPath);
  const safeOutput = path.resolve(outputPath);
  if (!path.isAbsolute(safeInput) || !path.isAbsolute(safeOutput)) throw new Error('Invalid paths');
  if (safeInput === safeOutput) throw new Error('Input and output folders must be different');

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    // Native completion popup with a shortcut to the results. Guarded so the
    // two success paths ('completed' on stdout and exit code 0) can't both
    // trigger it.
    let completionDialogShown = false;
    const showCompletionDialog = () => {
      if (completionDialogShown || !mainWindow) return;
      completionDialogShown = true;
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Anonymization complete',
        message: 'Anonymization complete',
        detail: 'All documents have been processed.',
        buttons: ['Open Folder', 'Close'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) shell.openPath(safeOutput);
      });
    };

    let pythonExecutable;
    let extraArgs = [];

    if (app.isPackaged) {
      const binaryName = process.platform === 'win32' ? 'engine-bin.exe' : 'engine-bin';
      pythonExecutable = path.join(process.resourcesPath, 'bin', binaryName);
      extraArgs = ['--input', safeInput, '--output', safeOutput];
    } else {
      pythonExecutable = process.platform === 'win32'
        ? path.join(__dirname, '../engine/venv/Scripts/python.exe')
        : path.join(__dirname, '../engine/venv/bin/python');
      extraArgs = ['-m', 'engine.processor', '--input', safeInput, '--output', safeOutput];
    }

    const rootPath = path.join(__dirname, '..');
    const env = {
      ...process.env,
      PYTHONPATH: rootPath,
      PYTHONUNBUFFERED: '1',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      OLLAMA_HOST: `http://${ollama.HOST}:${ollama.PORT}`,
      OLLAMA_MODEL: ollama.DEFAULT_MODEL,
    };

    const pythonProcess = spawn(pythonExecutable, extraArgs, { env });
    activePythonProcess = pythonProcess;
    cancelRequested = false;

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
            showCompletionDialog();
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
      if (cancelRequested) {
        // Renderer-initiated cancel: distinguishable from a real failure so
        // the UI can reset silently instead of showing an error banner.
        settle(reject, new Error('cancelled'));
      } else if (code === 0) {
        settle(resolve, { success: true });
        showCompletionDialog();
      } else {
        settle(reject, new Error(`Python process exited with code ${code}`));
      }
    });
  });
});

// Kill the running anonymization, if any. Already-written output files are
// left in place; the file being processed at kill time is simply not written.
ipcMain.handle('cancel-anonymization', () => {
  if (activePythonProcess) {
    cancelRequested = true;
    activePythonProcess.kill();
    return { cancelled: true };
  }
  return { cancelled: false };
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Engine status: { running: bool, modelPresent: bool, model: string }
ipcMain.handle('check-engine', async () => {
  const running = await ollama.isHealthy();
  const modelPresent = running ? await ollama.hasModel(ollama.DEFAULT_MODEL) : false;
  return { running, modelPresent, model: ollama.DEFAULT_MODEL };
});

// Trigger model download. Streams progress chunks to renderer via
// `engine-pull-progress`. Resolves when the pull completes successfully.
ipcMain.handle('pull-engine-model', async () => {
  if (!(await ollama.isHealthy())) {
    throw new Error('Ollama engine is not running');
  }
  await ollama.pullModel(ollama.DEFAULT_MODEL, (chunk) => {
    if (mainWindow) mainWindow.webContents.send('engine-pull-progress', chunk);
  });
  return { success: true, model: ollama.DEFAULT_MODEL };
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
