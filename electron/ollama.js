// Sidecar lifecycle for the local Ollama server.
//
// Strategy:
//   1. On app ready, probe http://127.0.0.1:11434/api/tags.
//   2. If a server already responds (user already has Ollama running), reuse it.
//   3. Otherwise spawn `ollama serve` ourselves and tear it down on app quit.
//
// In dev we expect the `ollama` binary on PATH (or at common install paths).
// In packaged builds Phase 4 will place a bundled binary at
// `process.resourcesPath/bin/ollama[.exe]`.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 11434;
const BASE_URL = `http://${HOST}:${PORT}`;
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e2b';

let sidecarProcess = null;
let weSpawnedIt = false;

function bundledBinaryPath() {
  const name = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
  // Used at runtime when the app is packaged. `process.resourcesPath` is
  // available after the Electron app has launched.
  return path.join(process.resourcesPath || '', 'bin', name);
}

function findBinary({ packaged }) {
  if (packaged) {
    const bundled = bundledBinaryPath();
    if (fs.existsSync(bundled)) return bundled;
  }

  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Ollama\\ollama.exe',
       path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')]
    : ['/opt/homebrew/bin/ollama', '/usr/local/bin/ollama', '/usr/bin/ollama'];

  for (const c of candidates) {
    if (path.isAbsolute(c) && fs.existsSync(c)) return c;
  }

  // Last resort: rely on PATH lookup at spawn time.
  return process.platform === 'win32' ? 'ollama.exe' : 'ollama';
}

async function httpGetJson(urlPath, { timeoutMs = 2000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(BASE_URL + urlPath, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function isHealthy() {
  try {
    await httpGetJson('/api/tags', { timeoutMs: 1500 });
    return true;
  } catch {
    return false;
  }
}

async function hasModel(modelName = DEFAULT_MODEL) {
  try {
    const data = await httpGetJson('/api/tags');
    const names = (data.models || []).map(m => m.name);
    return names.includes(modelName);
  } catch {
    return false;
  }
}

/**
 * Stream model download progress. `onProgress` is called with the parsed JSON
 * chunks emitted by Ollama's /api/pull endpoint (newline-delimited JSON).
 * Resolves when the stream closes with status === 'success'.
 */
async function pullModel(modelName = DEFAULT_MODEL, onProgress = () => {}) {
  const res = await fetch(`${BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName, stream: true }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`pull failed: HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastStatus = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        lastStatus = msg.status || lastStatus;
        onProgress(msg);
      } catch {
        // ignore malformed chunk
      }
    }
  }
  if (lastStatus !== 'success') {
    throw new Error(`pull ended without success: ${lastStatus}`);
  }
}

/**
 * Ensure a usable Ollama server is reachable.
 *
 * If one is already running, returns { started: false }.
 * Otherwise spawns one and waits up to `timeoutMs` for /api/tags to respond.
 * Throws if the binary cannot be found or the server never becomes healthy.
 */
async function ensureRunning({ packaged = false, timeoutMs = 30000 } = {}) {
  if (await isHealthy()) {
    return { started: false };
  }

  const binary = findBinary({ packaged });
  // `ollama serve` honors OLLAMA_HOST. Force the default to keep the renderer
  // and engine in sync regardless of user env.
  const env = { ...process.env, OLLAMA_HOST: `${HOST}:${PORT}` };

  let proc;
  try {
    proc = spawn(binary, ['serve'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
  } catch (err) {
    throw new Error(`failed to spawn ollama (${binary}): ${err.message}`);
  }

  sidecarProcess = proc;
  weSpawnedIt = true;

  proc.on('error', (err) => {
    console.error('[ollama-sidecar] spawn error:', err.message);
  });
  proc.on('exit', (code, signal) => {
    if (sidecarProcess === proc) {
      sidecarProcess = null;
      weSpawnedIt = false;
    }
    console.error(`[ollama-sidecar] exited code=${code} signal=${signal}`);
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy()) {
      return { started: true, pid: proc.pid };
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Health-check never succeeded — clean up and fail.
  stop();
  throw new Error('ollama sidecar did not become healthy within timeout');
}

function stop() {
  if (sidecarProcess && weSpawnedIt) {
    try { sidecarProcess.kill('SIGTERM'); } catch { /* ignore */ }
    sidecarProcess = null;
    weSpawnedIt = false;
  }
}

module.exports = {
  DEFAULT_MODEL,
  HOST,
  PORT,
  ensureRunning,
  isHealthy,
  hasModel,
  pullModel,
  stop,
};
