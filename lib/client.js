// Elyxion Discord Framework — Bot client
// ---------------------------------------------------------------
// The main entry point. An EventEmitter that wires together the
// command registry, the REST client, and the gateway:
//
//   const bot = createBot({ prefix: '!', token: '...' });
//   bot.command('ping', (ctx) => ctx.reply('pong'));
//   bot.on('messageCreate', (msg) => {});
//   bot.login().then(() => bot.connect());
'use strict';

const { EventEmitter } = require('events');
const { CommandRegistry } = require('./commands');
const { RestClient } = require('./rest');
const { Gateway } = require('./gateway');

const DEFAULT_INTENTS = ['GUILDS', 'GUILD_MESSAGES', 'DIRECT_MESSAGES', 'MESSAGE_CONTENT'];

class Bot extends EventEmitter {
  constructor(options = {}) {
    super();
    this.token = options.token || null;
    this.prefix = options.prefix === undefined ? '!' : String(options.prefix);
    this.intents = options.intents || DEFAULT_INTENTS.slice();
    this.rest = options.rest || new RestClient({ token: this.token });
    this.commands = options.commands || new CommandRegistry();
    this.gateway = null;
    this.user = null;
    this.ready = false;
  }

  // ---- Commands -------------------------------------------------

  command(name, handler, options) {
    this.commands.register(name, handler, options);
    return this;
  }

  // ---- Connection -----------------------------------------------

  // Verify the token with the REST API and resolve with the bot user.
  async login(token) {
    if (token) this.token = token;
    if (!this.token) {
      throw new Error('No bot token. Pass one to createBot(), login(token), or set DISCORD_TOKEN.');
    }
    this.rest.token = this.token;

    const res = await this.rest.get('/users/@me');
    if (res.statusCode !== 200) {
      const detail = res.data && res.data.message ? ': ' + res.data.message : '';
      throw new Error('Login failed (HTTP ' + res.statusCode + ')' + detail);
    }
    this.user = res.data;
    this.ready = true;
    this.emit('ready', this.user);
    return this.user;
  }

  // Open the gateway connection and start receiving events.
  connect() {
    if (!this.token) throw new Error('No bot token — call login() first');
    this.gateway = new Gateway({ token: this.token, intents: this.intents });
    this.gateway.on('message', (payload) => this._handleGatewayEvent(payload));
    this.gateway.on('error', (err) => this.emit('error', err));
    this.gateway.on('close', () => this.emit('close'));
    this.gateway.connect();
    return this;
  }

  // ---- Event dispatch -------------------------------------------

  _handleGatewayEvent(payload) {
    if (payload.op === 0) {
      this.emit(payload.t, payload.d);
      if (payload.t === 'MESSAGE_CREATE') this._handleMessage(payload.d);
    }
  }

  // Parse a message; run its command handler with a context object.
  _handleMessage(message) {
    if (!message || typeof message.content !== 'string') return;
    if (message.author && message.author.bot) return;

    const hit = this.commands.find(message.content, this.prefix);
    if (!hit) return;

    const ctx = {
      bot: this,
      message,
      channelId: message.channel_id,
      guildId: message.guild_id || null,
      author: message.author,
      name: hit.name,
      args: hit.args,
      text: hit.text,
      command: hit.command,
      reply: (content) => this.reply(message, content),
      send: (content) => this.sendMessage(message.channel_id, content)
    };

    Promise.resolve()
      .then(() => hit.command.handler(ctx))
      .catch((err) => this.emit('commandError', err, ctx));
  }

  // ---- Messaging -------------------------------------------------

  async sendMessage(channelId, content) {
    const payload = typeof content === 'string' ? { content } : content;
    const res = await this.rest.post('/channels/' + channelId + '/messages', payload);
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      const detail = res.data && res.data.message ? ': ' + res.data.message : '';
      throw new Error('sendMessage failed (HTTP ' + res.statusCode + ')' + detail);
    }
    return res.data;
  }

  // Reply to a message, mentioning its author. `content` may be a
  // string or a message payload ({ content, embeds, ... }).
  reply(message, content) {
    const authorId = message && message.author && message.author.id;
    const mention = authorId ? '<@' + authorId + '> ' : '';
    if (typeof content === 'string') {
      return this.sendMessage(message.channel_id, {
        content: mention + content,
        message_reference: { message_id: message.id }
      });
    }
    const payload = Object.assign({}, content);
    payload.content = mention + (payload.content || '');
    payload.message_reference = { message_id: message.id };
    return this.sendMessage(message.channel_id, payload);
  }
}

function createBot(options) {
  return new Bot(options);
}

module.exports = { Bot, createBot, DEFAULT_INTENTS };
