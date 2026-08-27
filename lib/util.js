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

// ---- Permissions ------------------------------------------------

// Discord permission bit positions (the value in member.permissions
// is a base-10 string of the 64-bit bitfield).
const PERMISSIONS = {
  CREATE_INSTANT_INVITE: 0,
  KICK_MEMBERS: 1,
  BAN_MEMBERS: 2,
  ADMINISTRATOR: 3,
  MANAGE_CHANNELS: 4,
  MANAGE_GUILD: 5,
  ADD_REACTIONS: 6,
  VIEW_AUDIT_LOG: 7,
  PRIORITY_SPEAKER: 8,
  STREAM: 9,
  VIEW_CHANNEL: 10,
  SEND_MESSAGES: 11,
  SEND_TTS_MESSAGES: 12,
  MANAGE_MESSAGES: 13,
  EMBED_LINKS: 14,
  ATTACH_FILES: 15,
  READ_MESSAGE_HISTORY: 16,
  MENTION_EVERYONE: 17,
  USE_EXTERNAL_EMOJIS: 18,
  VIEW_GUILD_INSIGHTS: 19,
  CONNECT: 20,
  SPEAK: 21,
  MUTE_MEMBERS: 22,
  DEAFEN_MEMBERS: 23,
  MOVE_MEMBERS: 24,
  USE_VAD: 25,
  CHANGE_NICKNAME: 26,
  MANAGE_NICKNAMES: 27,
  MANAGE_ROLES: 28,
  MANAGE_WEBHOOKS: 29,
  MANAGE_GUILD_EXPRESSIONS: 30,
  USE_APPLICATION_COMMANDS: 31,
  REQUEST_TO_SPEAK: 32,
  MANAGE_EVENTS: 33,
  MANAGE_THREADS: 34,
  CREATE_PUBLIC_THREADS: 35,
  CREATE_PRIVATE_THREADS: 36,
  USE_EXTERNAL_STICKERS: 37,
  SEND_MESSAGES_IN_THREADS: 38,
  USE_EMBEDDED_ACTIVITIES: 39,
  MODERATE_MEMBERS: 40,
  VIEW_CREATOR_MONETIZATION_ANALYTICS: 41,
  USE_SOUNDBOARD: 42,
  CREATE_GUILD_EXPRESSIONS: 43,
  CREATE_EVENTS: 44,
  USE_EXTERNAL_SOUNDS: 45,
  SEND_VOICE_MESSAGES: 46,
  SEND_POLLS: 49,
  USE_EXTERNAL_APPS: 50
};

// Convert a base-10 string of a 64-bit number into [low, high]
// 32-bit words without BigInt (runtime compatibility).
function decimalToWords(str) {
  let low = 0;
  let high = 0;
  const s = String(str).trim();
  if (!/^[0-9]+$/.test(s)) return [0, 0];
  for (let i = 0; i < s.length; i++) {
    const digit = s.charCodeAt(i) - 48;
    const l = (low * 10 + digit) >>> 0;
    const overflow = Math.floor((low * 10 + digit - l) / 4294967296);
    high = (high * 10 + overflow) >>> 0;
    low = l;
  }
  return [low, high];
}

// Test bit `bit` (0-63) in a permission bitfield. `bits` may be a
// base-10 string, a number, or an array of permission names.
function hasBit(bits, bit) {
  if (typeof bits === 'number') {
    return bit < 32 ? ((bits >>> bit) & 1) === 1 : false;
  }
  const words = decimalToWords(bits);
  return bit >= 32
    ? ((words[1] >>> (bit - 32)) & 1) === 1
    : ((words[0] >>> bit) & 1) === 1;
}

// Does `perms` include the named permission? ADMINISTRATOR implies
// everything. `perms` may be a bitfield (string/number) or a list.
function hasPermission(perms, name) {
  const bit = PERMISSIONS[name];
  if (bit === undefined) throw new Error('Unknown permission: ' + name);
  if (Array.isArray(perms)) return perms.indexOf(name) !== -1;
  const str = String(perms);
  if (str.indexOf(',') !== -1) {
    return str.split(',').map((s) => s.trim()).indexOf(name) !== -1;
  }
  if (hasBit(str, PERMISSIONS.ADMINISTRATOR)) return true;
  return hasBit(str, bit);
}

module.exports = {
  resolveColor,
  parseMention,
  snowflakeToDate,
  isSnowflake,
  truncate,
  loadEnv,
  PERMISSIONS,
  hasPermission,
  hasBit,
  decimalToWords
};
