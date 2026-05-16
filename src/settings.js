/**
 * Lightweight JSON-file settings store shared between main and renderer.
 * Main process owns the file; renderer reads/writes via IPC.
 *
 *   <userData>/settings.json
 *
 * Currently stored keys:
 *   lang         "en" | "ko"
 *   firstRunAt   timestamp when initial picker was completed
 */
const fs = require('fs');
const path = require('path');

let filePath = null;
let cache = {};
let loaded = false;

function init(userDataPath) {
  if (loaded) return;
  filePath = path.join(userDataPath, 'settings.json');
  try {
    if (fs.existsSync(filePath)) {
      cache = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
    }
  } catch (_) {
    cache = {};
  }
  loaded = true;
}

function get(key, fallback) {
  if (!loaded) return fallback;
  return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : fallback;
}

function set(key, value) {
  if (!loaded || !filePath) return;
  cache[key] = value;
  try {
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (_) {}
}

function all() {
  return { ...cache };
}

module.exports = { init, get, set, all };
