const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow = null;
let wsProcess = null;
let staticServer = null;

const isDev = !app.isPackaged;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    const logPath = path.join(app.getPath('userData'), 'bee-chat.log');
    fs.appendFileSync(logPath, line + '\n');
  } catch (e) {}
}

function findPhp() {
  const candidates = [];
  const phpPath = process.env.PHP_PATH || process.env.PHP_HOME || '';
  if (phpPath) {
    candidates.push(path.join(phpPath, 'php.exe'));
  }
  candidates.push('php');
  candidates.push('C:\\laragon\\bin\\php\\php8.2.29\\php.exe');
  candidates.push('C:\\laragon\\bin\\php\\php8.2\\php.exe');
  candidates.push('C:\\laragon\\bin\\php\\php8.1\\php.exe');
  candidates.push('C:\\laragon\\bin\\php\\php8.0\\php.exe');
  candidates.push('C:\\laragon\\bin\\php\\php7.4\\php.exe');
  candidates.push('C:\\laragon\\bin\\php\\php7.3\\php.exe');
  const xamppPaths = [
    'C:\\xampp\\php\\php.exe',
    'D:\\xampp\\php\\php.exe',
    ...Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(67 + i)}:\\xampp\\php\\php.exe`).filter(p => p !== 'C:\\xampp\\php\\php.exe')
  ];
  candidates.push(...xamppPaths);
  return candidates;
}

function startWebSocketServer() {
  const serverScript = path.join(__dirname, '..', '..', 'socket-server', 'server.php');
  const phpDir = path.join(__dirname, '..', '..', 'socket-server');

  if (!fs.existsSync(serverScript)) {
    log(`[WS Server] Script not found: ${serverScript}`);
    return false;
  }

  const phpCmds = findPhp();

  function trySpawn(index) {
    if (index >= phpCmds.length) {
      log('[WS Server] Could not find a working PHP binary. Try setting PHP_PATH or PHP_HOME.');
      return false;
    }

    const phpBin = phpCmds[index];
    log(`[WS Server] Trying PHP: ${phpBin}`);

    try {
      const proc = spawn(phpBin, [serverScript], {
        cwd: phpDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env },
      });

      let started = false;
      const timer = setTimeout(() => {
        if (!started) {
          log(`[WS Server] PHP timed out (2s). Trying next candidate...`);
          proc.kill();
          trySpawn(index + 1);
        }
      }, 2000);

      proc.stdout.on('data', (data) => {
        const text = data.toString().trim();
        log(`[WS Server] ${text}`);
        if (!started && text.includes('WebSocket')) {
          started = true;
          clearTimeout(timer);
          log('[WS Server] WebSocket server is ready.');
        }
      });

      proc.stderr.on('data', (data) => {
        log(`[WS Server Error] ${data.toString().trim()}`);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        if (!started) {
          log(`[WS Server] Failed to start PHP binary: ${err.message}`);
          trySpawn(index + 1);
        }
      });

      proc.on('exit', (code) => {
        log(`[WS Server] exited with code ${code}`);
        wsProcess = null;
      });

      wsProcess = proc;
      return true;
    } catch (err) {
      log(`[WS Server] Spawn error: ${err.message}`);
      trySpawn(index + 1);
    }
  }

  return trySpawn(0);
}

function stopWebSocketServer() {
  if (wsProcess) {
    wsProcess.kill();
    wsProcess = null;
    log('[WS Server] Stopped.');
  }
}

function startStaticServer(buildDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(buildDir, req.url === '/' ? 'index.html' : req.url);
      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          fs.readFile(path.join(buildDir, 'index.html'), (err2, data2) => {
            if (err2) {
              res.writeHead(500);
              res.end('Internal Server Error');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data2);
          });
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      log(`[Static Server] running on http://127.0.0.1:${port}`);
      staticServer = server;
      resolve(port);
    });

    server.on('error', reject);
  });
}

function stopStaticServer() {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
}

async function createWindow() {
  const buildDir = path.join(__dirname, '..', 'build');

  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    log('[App] Build not found. Run "npm run build" first.');
    mainWindow = new BrowserWindow({ width: 600, height: 200 });
    mainWindow.loadURL('data:text/html,<h2>Build not found</h2><p>Run <code>npm run build</code> in the chat-app directory first.</p>');
    return;
  }

  const port = await startStaticServer(buildDir);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'public', 'bee.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const useDevServer = isDev && process.env.ELECTRON_DEV === 'true';

  if (useDevServer) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }

  mainWindow.webContents.on('console-message', (event, level, message) => {
    log(`[Renderer] ${message}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startWebSocketServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      startWebSocketServer();
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopWebSocketServer();
  stopStaticServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopWebSocketServer();
  stopStaticServer();
});
