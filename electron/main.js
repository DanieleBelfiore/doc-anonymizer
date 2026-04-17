const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Set the application name for the OS
app.setName('Doc Anonymizer');

let mainWindow = null;

function createWindow() {
  console.log('Creating window...');
  const appPath = app.getAppPath();
  const iconPath = path.join(appPath, 'public/icon.png');
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
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

  // Enable DevTools shortcut in production for debugging
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.meta && input.alt && input.key.toLowerCase() === 'i') || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Set dock icon for macOS
  if (process.platform === 'darwin' && require('fs').existsSync(iconPath)) {
    app.dock.setIcon(iconPath);
  }

  const url = process.env.VITE_DEV_SERVER_URL;
  if (url) {
    console.log(`Loading URL: ${url}`);
    mainWindow.loadURL(url).catch(err => {
      console.error('Failed to load URL:', err);
    });
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the local index.html from the dist folder
    // We try multiple ways to find the correct path
    const possiblePaths = [
      path.join(__dirname, '..', 'dist', 'index.html'),
      path.join(app.getAppPath(), 'dist', 'index.html'),
      path.join(process.resourcesPath, 'app', 'dist', 'index.html'),
    ];

    let loaded = false;
    for (const indexPath of possiblePaths) {
      if (require('fs').existsSync(indexPath)) {
        console.log(`Found index.html at: ${indexPath}`);
        mainWindow.loadFile(indexPath).catch(err => {
          console.error(`Failed to load file at ${indexPath}:`, err);
        });
        loaded = true;
        break;
      } else {
        console.log(`Checked path (not found): ${indexPath}`);
      }
    }

    if (!loaded) {
      console.error('CRITICAL: dist/index.html not found in any of the possible paths.');
      // Diagnostic: list files in the app directory to see what's actually there
      try {
        const fs = require('fs');
        const root = app.getAppPath();
        console.log(`Contents of app root (${root}):`, fs.readdirSync(root));
        if (fs.existsSync(path.join(root, 'dist'))) {
          console.log(`Contents of dist folder:`, fs.readdirSync(path.join(root, 'dist')));
        }
      } catch (e) {
        console.error('Failed to run diagnostics:', e);
      }
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
  console.log(`Start anonymization request received with mode: ${mode}`);
  return new Promise((resolve, reject) => {
    let pythonExecutable;
    let extraArgs = [];

    if (app.isPackaged) {
      // In production, we call the compiled binary
      const binaryName = process.platform === 'win32' ? 'engine-bin.exe' : 'engine-bin';
      pythonExecutable = path.join(process.resourcesPath, 'bin', binaryName);
      // We don't use -m engine.processor in production because it's a standalone binary
      extraArgs = ['--input', inputPath, '--output', outputPath, '--mode', mode || 'strict'];
    } else {
      // In development, we use the venv python
      pythonExecutable = process.platform === 'win32' 
        ? path.join(__dirname, '../engine/venv/Scripts/python.exe')
        : path.join(__dirname, '../engine/venv/bin/python');
      extraArgs = ['-m', 'engine.processor', '--input', inputPath, '--output', outputPath, '--mode', mode || 'strict'];
    }
    
    console.log(`Using Python executable: ${pythonExecutable}`);
    
    // Set environment variables for the Python process
    const rootPath = path.join(__dirname, '..');
    const env = { 
      ...process.env, 
      PYTHONPATH: rootPath,
      PYTHONUNBUFFERED: '1',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8'
    };

    const pythonProcess = spawn(pythonExecutable, extraArgs, { env });

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`Python stdout: ${output}`);
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.status === 'progress') {
            if (mainWindow) mainWindow.webContents.send('progress-update', message);
          } else if (message.status === 'completed') {
            resolve({ success: true });
          } else if (message.status === 'error') {
            reject(new Error(message.message));
          }
        } catch (e) {
          // It's not JSON, maybe a log or print
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python process:', err);
      reject(err);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}`));
      }
    });
  });
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  if (folderPath) {
    shell.openPath(folderPath);
  }
});
