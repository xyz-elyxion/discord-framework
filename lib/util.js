// Elyxion Discord Framework — shared helpers
'use strict';

// ---- Colors ----------------------------------------------------

const NAMED_COLORS = {
  default: 0x000000,
  white: 0xffffff,
  red: 0xed4245,
  green: 0x57f287,
  blue: 0x5865f2,
  blurple: 0x5865f2,
  yellow: 0xfee75c,
  orange: 0xfaa61a,
  purple: 0x8b5cf6,
  pink: 0xeb459e,
  gray: 0x95a5a6,
  grey: 0x95a5a6,
  dark: 0x2c2f33
};

// Accepts a name ('red'), hex string ('#8b5cf6' / '8b5cf6'), an
// integer, or an [r, g, b] array. Returns a 24-bit integer color.
function resolveColor(color) {
  if (color === undefined || color === null) return 0x000000;
  if (typeof color === 'number') return color >>> 0;
  if (Array.isArray(color)) {
    const [r, g, b] = color;
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }
  const str = String(color).trim();
  if (NAMED_COLORS[str.toLowerCase()] !== undefined) {
    return NAMED_COLORS[str.toLowerCase()];
  }
  const hex = str.replace(/^#/, '');
  const parsed = parseInt(hex, 16);
  return isNaN(parsed) ? 0x000000 : parsed;
}

// ---- Mentions / snowflakes -------------------------------------

// '<@123456789012345678>' -> '123456789012345678' (also handles
// role '<@&...>' and channel '<#...>' mentions).
function parseMention(text) {
  const m = String(text || '').match(/^<@!?(\d+)>$/);
  return m ? m[1] : null;
}

function isSnowflake(id) {
  return /^\d{17,20}$/.test(String(id || ''));
}

// Discord snowflakes encode a millisecond timestamp in the top 42 bits.
function snowflakeToDate(id) {
  if (!isSnowflake(id)) return null;
  const ms = Math.floor(Number(id) / 4194304) + 1420070400000;
  return new Date(ms);
}

// ---- Text helpers ----------------------------------------------

function truncate(str, max) {
  const s = String(str || '');
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

// ---- .env loader -----------------------------------------------

// Tiny dependency-free .env parser. Sets process.env for keys that
// aren't already defined. Missing file is not an error.
function loadEnv(file) {
  const fs = require('fs');
  const path = require('path');
  const target = path.resolve(file || '.env');
  let raw;
  try {
    raw = String(fs.readFileSync(target));
  } catch (_) {
    return;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1].startsWith('#')) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

module.exports = {
  resolveColor,
  parseMention,
  snowflakeToDate,
  isSnowflake,
  truncate,
  loadEnv
};
