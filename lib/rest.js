// Elyxion Discord Framework — REST client
// ---------------------------------------------------------------
// Talks to the Discord REST API. The Elyxion runtime has no
// outbound TLS client yet, so requests go through `curl` (present
// on macOS, Linux, and Windows 10+) — the same approach the
// Elyxion package manager uses for registry traffic.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const DEFAULT_BASE_URL = 'https://discord.com/api/v10';

function shellQuote(arg) {
  return "'" + String(arg).replace(/'/g, "'\\''") + "'";
}

class RestClient {
  constructor(options = {}) {
    this.token = options.token || null;
    this.baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout || 15000;
  }

  _headers() {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'ElyxionDiscord/0.1.0'
    };
    if (this.token) headers['Authorization'] = 'Bot ' + this.token;
    return headers;
  }

  // request(method, path, body) -> { statusCode, data, body }
  // Never throws on HTTP error codes — callers inspect statusCode.
  request(method, pathName, body) {
    const url = this.baseUrl + '/' + String(pathName).replace(/^\/+/, '');
    const timeoutSec = Math.max(1, Math.ceil(this.timeout / 1000));

    const parts = ['curl', '-sS', '--max-time', String(timeoutSec), '-X', method];
    for (const [k, v] of Object.entries(this._headers())) {
      parts.push('-H', shellQuote(k + ': ' + v));
    }

    let tmp = null;
    if (body !== undefined && body !== null) {
      tmp = path.join(os.tmpdir(), 'elyxion-discord-' + Math.random().toString(36).slice(2) + '.json');
      fs.writeFileSync(tmp, typeof body === 'string' ? body : JSON.stringify(body), 'utf-8');
      parts.push('--data-binary', '@' + tmp);
    }

    parts.push('-w', shellQuote('\n%{http_code}'));
    parts.push(shellQuote(url));

    if (tmp) {
      parts.push(IS_WIN ? '&' : ';');
      parts.push(IS_WIN ? 'del /F /Q ' + shellQuote(tmp) + ' 2>nul' : 'rm -f ' + shellQuote(tmp));
    }

    let out;
    try {
      out = execSync(parts.join(' ')).toString('utf-8');
    } catch (err) {
      throw new Error('Discord API request failed (is curl installed?): ' + (err && err.message ? err.message : 'unknown error'));
    }

    const idx = out.lastIndexOf('\n');
    const statusLine = idx === -1 ? out : out.substring(idx + 1);
    const bodyText = idx === -1 ? '' : out.substring(0, idx);
    const statusCode = parseInt(statusLine.trim(), 10) || 0;

    let data = null;
    if (bodyText) {
      try {
        data = JSON.parse(bodyText);
      } catch (_) {
        data = bodyText;
      }
    }

    return { statusCode, data, body: bodyText };
  }

  get(pathName) { return this.request('GET', pathName); }
  post(pathName, body) { return this.request('POST', pathName, body); }
  put(pathName, body) { return this.request('PUT', pathName, body); }
  patch(pathName, body) { return this.request('PATCH', pathName, body); }
  del(pathName) { return this.request('DELETE', pathName); }
}

module.exports = { RestClient, DEFAULT_BASE_URL };
