// Elyxion Discord Framework — Bot client
// ---------------------------------------------------------------
// The main entry point. An EventEmitter that wires together the
// command registry, slash commands, the cache, the REST client, and
// the gateway:
//
//   const bot = createBot({ prefix: '!', token: '...' });
//   bot.command('ping', (ctx) => ctx.reply('pong'));
//   bot.slash('ping', (ctx) => ctx.reply('pong'), { description: 'Ping' });
//   bot.button('like', (ctx) => ctx.update({ content: 'Liked!' }));
//   bot.use(async (ctx, next) => { await next(); });
//   bot.on('messageCreate', (msg) => {});
//   bot.login().then(() => bot.connect());
'use strict';

const { EventEmitter } = require('events');
const { CommandRegistry, CommandGroup, parseArgs } = require('./commands');
const { RestClient } = require('./rest');
const { Gateway } = require('./gateway');
const { InteractionRegistry } = require('./interactions');
const { Cache } = require('./cache');
const { hasPermission } = require('./util');

const DEFAULT_INTENTS = ['GUILDS', 'GUILD_MESSAGES', 'DIRECT_MESSAGES', 'MESSAGE_CONTENT'];

class Bot extends EventEmitter {
  constructor(options = {}) {
    super();
    this.token = options.token || null;
    this.prefix = options.prefix === undefined ? '!' : String(options.prefix);
    this.intents = options.intents || DEFAULT_INTENTS.slice();
    this.rest = options.rest || new RestClient({ token: this.token });
    this.commands = options.commands || new CommandRegistry();
    this.interactions = options.interactions || new InteractionRegistry();
    this.cache = options.cache instanceof Cache ? options.cache : new Cache(options.cache);
    this.gateway = null;
    this.user = null;
    this.ready = false;

    // Auto-register slash commands with Discord after a successful login.
    this.autoSync = options.autoSync !== false;

    this._middleware = [];
    this._cooldowns = new Map();
    this._groups = [];
  }

  // ---- Commands -------------------------------------------------

  command(name, handler, options) {
    this.commands.register(name, handler, options);
    return this;
  }

  // A named group: bot.group('admin').command('ban', handler, opts)
  // registers 'admin ban' and merges shared options.
  group(name, options) {
    const g = new CommandGroup(this.commands, name, options);
    this._groups.push(g);
    return g;
  }

  // Global middleware — runs for every matched command before its
  // handler. Call next() to continue the chain.
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new TypeError('bot.use() needs a middleware function');
    }
    this._middleware.push(middleware);
    return this;
  }

  // ---- Slash commands & components ------------------------------

  slash(name, handler, options) {
    this.interactions.slash(name, handler, options);
    return this;
  }

  button(customId, handler) {
    this.interactions.button(customId, handler);
    return this;
  }

  select(customId, handler) {
    this.interactions.select(customId, handler);
    return this;
  }

  modal(customId, handler) {
    this.interactions.modal(customId, handler);
    return this;
  }

  // Push registered slash commands to Discord (global + per-guild).
  async syncCommands() {
    if (!this.user || !this.user.id) {
      throw new Error('Cannot sync slash commands before login');
    }
    const result = await this.interactions.registerAll(this.rest, this.user.id);
    this.emit('commandsRegistered', result);
    return result;
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

    if (this.autoSync && this.interactions.commands.length) {
      this.syncCommands().catch((err) => this.emit('error', err));
    }
    return this.user;
  }

  // Open the gateway connection and start receiving events.
  connect(options) {
    if (!this.token) throw new Error('No bot token — call login() first');
    this.gateway = new Gateway({
      token: this.token,
      intents: this.intents,
      compress: !!(options && options.compress),
      shard: options && options.shard
    });
    this.gateway.on('message', (payload) => this._handleGatewayEvent(payload));
    this.gateway.on('error', (err) => this.emit('error', err));
    this.gateway.on('close', () => this.emit('close'));
    this.gateway.on('reconnecting', (info) => this.emit('reconnecting', info));
    this.gateway.connect();
    return this;
  }

  // ---- Event dispatch -------------------------------------------

  _handleGatewayEvent(payload) {
    if (payload.op === 0) {
      this.emit(payload.t, payload.d);
      this.cache.handle(payload.t, payload.d);
      if (payload.t === 'MESSAGE_CREATE') this._handleMessage(payload.d);
      if (payload.t === 'INTERACTION_CREATE') this.interactions.handle(payload.d, this);
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
      options: {},
      subcommand: hit.subcommand || null,
      command: hit.command,
      reply: (content) => this.reply(message, content),
      send: (content) => this.sendMessage(message.channel_id, content)
    };

    this._runCommand(ctx);
  }

  _runCommand(ctx) {
    Promise.resolve()
      .then(() => this._checkCommand(ctx))
      .catch((err) => this.emit('commandError', err, ctx));
  }

  // Gate a command through restrictions; runs the middleware chain
  // and handler when everything passes.
  _checkCommand(ctx) {
    const cmd = ctx.command;
    const message = ctx.message;

    if (cmd.guildOnly && !ctx.guildId) {
      this.emit('commandDenied', { ctx, reason: 'guildOnly' });
      return;
    }
    if (cmd.dmOnly && ctx.guildId) {
      this.emit('commandDenied', { ctx, reason: 'dmOnly' });
      return;
    }

    if (cmd.permissions && cmd.permissions.length) {
      const missing = this._missingPermissions(message.member, cmd.permissions);
      if (missing && missing.length) {
        this.emit('noPermission', { ctx, missing });
        if (cmd.permissionMessage !== false) {
          ctx.reply('You need the **' + missing.join(', ') + '** permission' +
            (missing.length > 1 ? 's' : '') + ' to use that.').catch(() => {});
        }
        return;
      }
    }

    if (cmd.cooldown && cmd.cooldown > 0) {
      const key = (ctx.author && ctx.author.id ? ctx.author.id : 'anon') + ':' + cmd.name;
      const now = Date.now();
      const last = this._cooldowns.get(key) || 0;
      const remaining = last + cmd.cooldown - now;
      if (remaining > 0) {
        this.emit('cooldown', { ctx, remaining });
        return;
      }
      this._cooldowns.set(key, now);
    }

    if (cmd.args && cmd.args.length) {
      const parsed = parseArgs(cmd, ctx.args);
      if (parsed.errors.length) {
        const err = new Error(parsed.errors.join('; '));
        err.errors = parsed.errors;
        this.emit('argumentError', err, ctx);
        return;
      }
      ctx.options = parsed.options;
    }

    return this._runPipeline(ctx);
  }

  _missingPermissions(member, required) {
    if (!member || member.permissions === undefined || member.permissions === null) {
      return required.slice();
    }
    const perms = member.permissions;
    if (hasPermission(perms, 'ADMINISTRATOR')) return [];
    return required.filter((p) => !hasPermission(perms, p));
  }

  _runPipeline(ctx) {
    const chain = this._middleware.concat(ctx.command.middleware || []);
    const run = (i) => {
      if (i < chain.length) {
        return Promise.resolve(chain[i](ctx, () => run(i + 1)));
      }
      return Promise.resolve(ctx.command.handler(ctx));
    };
    return run(0);
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

  async editMessage(channelId, messageId, content) {
    const payload = typeof content === 'string' ? { content } : content;
    const res = await this.rest.patch('/channels/' + channelId + '/messages/' + messageId, payload);
    if (res.statusCode !== 200 && res.statusCode !== 201) {
      const detail = res.data && res.data.message ? ': ' + res.data.message : '';
      throw new Error('editMessage failed (HTTP ' + res.statusCode + ')' + detail);
    }
    return res.data;
  }

  async deleteMessage(channelId, messageId) {
    const res = await this.rest.del('/channels/' + channelId + '/messages/' + messageId);
    if (res.statusCode !== 204 && res.statusCode !== 200) {
      const detail = res.data && res.data.message ? ': ' + res.data.message : '';
      throw new Error('deleteMessage failed (HTTP ' + res.statusCode + ')' + detail);
    }
    return res.data;
  }

  sendFile(channelId, options) {
    return this.rest.sendFile(channelId, options);
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
