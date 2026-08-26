// Elyxion Discord Framework
// ---------------------------------------------------------------
// A zero-dependency Discord bot framework for the Elyxion runtime.
//
//   const { createBot, Embed } = require('elyxion-discord');
//
//   const bot = createBot({ prefix: '!', token: process.env.DISCORD_TOKEN });
//   bot.command('ping', (ctx) => ctx.reply('pong'));
//   bot.on('ready', (user) => console.log('Logged in as ' + user.username));
//   bot.login().then(() => bot.connect());
//
// The runtime has no outbound TLS client, so REST traffic goes
// through `curl` (the same approach the Elyxion package manager
// uses), and the gateway speaks the Discord WebSocket protocol
// directly over the runtime's tls/net modules.
'use strict';

const { Bot, createBot } = require('./lib/client');
const { CommandRegistry } = require('./lib/commands');
const { RestClient } = require('./lib/rest');
const { Gateway, FrameParser, encodeFrame } = require('./lib/gateway');
const { Embed } = require('./lib/embed');
const {
  resolveColor, parseMention, snowflakeToDate, isSnowflake,
  truncate, loadEnv
} = require('./lib/util');

const VERSION = '0.1.0';

module.exports = {
  version: VERSION,

  // Client
  Bot,
  createBot,

  // Commands & REST
  CommandRegistry,
  RestClient,

  // Gateway (WebSocket)
  Gateway,
  FrameParser,
  encodeFrame,

  // Embeds
  Embed,

  // Utilities
  resolveColor,
  parseMention,
  snowflakeToDate,
  isSnowflake,
  truncate,
  loadEnv
};
