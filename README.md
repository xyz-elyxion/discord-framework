# Elyxion Discord Framework

A **zero-dependency Discord bot framework** that runs on the
[Elyxion CLI](https://github.com/xyz-elyxion/elyxion-cli) — a standalone
JavaScript runtime with no Node.js, no npm, and no `node_modules`.

- **Commands.** Prefix-based command registry with aliases, **typed argument
  parsing**, **subcommands**, **permission checks**, **cooldowns**,
  **middleware**, and **command groups**.
- **Slash commands & interactions.** Register slash commands (global or
  per-guild) via REST, handle `INTERACTION_CREATE` events, respond/defer/
  follow up, and build buttons, select menus, and modals with component
  builders.
- **Embeds.** A chainable `Embed` builder that emits the exact JSON Discord expects.
- **REST API.** A `RestClient` for `discord.com/api/v10` (uses `curl`, the same
  approach the Elyxion package manager uses, because the runtime has no
  outbound TLS client yet) with **rate-limit bucket tracking**, **automatic
  retries with backoff** on 429/5xx, and **multipart file uploads**.
- **Gateway.** A WebSocket client (`wss://gateway.discord.gg`) speaking the
  Discord gateway protocol over the runtime's `tls`/`net` modules — Identify,
  heartbeat, **session resume (op 6/7/9)**, **presence updates**, **zlib-stream
  compression**, and **automatic reconnection** with backoff.
- **Cache.** An in-memory store for guilds, channels, users, members, messages,
  and roles, kept fresh automatically by gateway events.
- **Safe by default.** No token logging, no magic globals.

## Quick start

```bash
# install the Elyxion runtime (one binary — no Node.js)
curl -fsSL https://raw.githubusercontent.com/xyz-elyxion/elyxion-cli/main/scripts/install.sh | bash

# scaffold a new bot project
elyxion discord-framework/cli.js create my-bot
cd my-bot
cp .env.example .env   # then paste your bot token
elyxion bot.js
```

The framework is also an Elyxion package:

```bash
elyx install elyxion-discord
```

## A minimal bot

```js
// bot.js
'use strict';

const { createBot, Embed } = require('elyxion-discord');

const bot = createBot({
  prefix: '!',
  token: process.env.DISCORD_TOKEN
});

bot.command('ping', (ctx) => {
  ctx.reply('pong!');
}, { description: 'Replies with pong' });

bot.slash('ping', (ctx) => {
  ctx.reply('pong!');
}, { description: 'Replies with pong' }); // auto-registered after login

bot.on('ready', (user) => console.log('Logged in as ' + user.username));

bot.login().then(() => bot.connect());
```

```bash
DISCORD_TOKEN=your-token-here elyxion bot.js
```

## Framework API

### `createBot(options)` / `new Bot(options)`

| Option | Default | Description |
| --- | --- | --- |
| `token` | `null` | Bot token (also settable via `login(token)`). |
| `prefix` | `'!'` | Command prefix. |
| `intents` | `GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES, MESSAGE_CONTENT` | Gateway intents (by name). |
| `cache` | `true` | Enable the in-memory cache, or an options object (`{ messages: false, messageLimitPerChannel: 200, ... }`). |
| `autoSync` | `true` | Auto-register slash commands with Discord after login. |

`Bot` is an `EventEmitter`:

- `bot.command(name, handler, options)` — register a prefix command.
- `bot.slash(name, handler, options)` — register a slash command.
- `bot.button(id, handler)` / `bot.select(id, handler)` / `bot.modal(id, handler)` — component & modal handlers.
- `bot.group(name, options)` — a command group (prefixes names, shares options).
- `bot.use(fn)` — global middleware `(ctx, next) => ...`.
- `bot.on('ready', (user) => {})` — after `login()` verifies the token via REST.
- `bot.on('messageCreate', (msg) => {})`, `...` — every gateway dispatch event, named by its Discord type.
- `bot.on('commandError', (err, ctx) => {})` — thrown command errors.
- `bot.on('argumentError' | 'noPermission' | 'cooldown' | 'commandDenied', (info, ctx) => {})` — command gates.
- `bot.on('interactionError', (err, interaction) => {})` — errors from interaction handlers.
- `bot.login([token])` — verify the token and resolve with the bot user.
- `bot.connect({ compress, shard })` — open the gateway connection.
- `bot.syncCommands()` — push registered slash commands to Discord.
- `bot.sendMessage(channelId, content)` / `bot.editMessage` / `bot.deleteMessage` / `bot.sendFile`.
- `bot.reply(message, content)` — reply with a mention + `message_reference`.

### Command options

```js
bot.command('give', (ctx) => {
  ctx.options.user     // typed value
  ctx.options.amount   // number
  ctx.subcommand       // 'give daily' style paths
}, {
  description: 'Give coins',
  aliases: ['g'],
  cooldown: 5000,                                  // ms per user
  permissions: ['MANAGE_MESSAGES'],                // or a single string
  permissionMessage: false,                        // disable the auto-deny reply
  guildOnly: true,                                 // or dmOnly: true
  strictArgs: true,                                // reject extra args
  middleware: [(ctx, next) => next()],             // per-command middleware
  args: [                                          // typed argument spec
    { name: 'user', type: 'user', required: true },   // user|channel|role|string|number|integer|boolean|snowflake|rest
    { name: 'amount', type: 'number', required: true },
    { name: 'reason', type: 'rest' }                  // consumes the rest
  ]
});
```

Subcommands are registered as space-separated names and the longest match wins:

```js
bot.command('admin', rootHandler);
bot.command('admin ban', banHandler);   // !admin ban <user>
```

### Slash commands

```js
bot.slash('give', (ctx) => {
  ctx.reply('Gave ' + ctx.options.amount + ' to <@' + ctx.options.user + '>');
}, {
  description: 'Give coins',
  guildId: null, // set to a guild id for guild-only commands
  options: [
    { name: 'user', type: 'user', required: true, description: 'Who' },
    { name: 'amount', type: 'integer', required: true, description: 'How many' }
  ]
});

bot.slash('admin', (ctx) => ctx.reply('root'), {
  description: 'Admin commands',
  subcommands: {
    ban: { description: 'Ban a user', options: [{ name: 'user', type: 'user', required: true, description: 'Who' }] },
    kick: { description: 'Kick a user' }
  }
});
```

Interaction handlers receive a context with the full lifecycle:

```js
bot.slash('slow', async (ctx) => {
  await ctx.defer(true);          // ack within 3s (auto-deferral also happens)
  const result = await someWork();
  await ctx.followup(result);     // after deferring
  await ctx.editReply('edited');  // edit the original reply
});
```

- `ctx.options` — flat map of option name → value.
- `ctx.reply(content)` / `ctx.defer(ephemeral)` / `ctx.followup(content)` / `ctx.editReply(content)` / `ctx.update(content)` / `ctx.modal(modal)` / `ctx.autocomplete(choices)`.
- `ctx.user`, `ctx.member`, `ctx.channelId`, `ctx.guildId`, `ctx.customId`, `ctx.values`.

Components and modals use `custom_id` routing with chainable builders:

```js
const { ActionRow, Button, SelectMenu, Modal, TextInput } = require('elyxion-discord');

bot.button('like', (ctx) => ctx.update({ content: 'Liked!' }));

bot.slash('menu', (ctx) => {
  const row = new ActionRow().addComponent(
    new Button().setLabel('Like').setCustomId('like').setStyle(1)
  ).addComponent(
    new SelectMenu().setCustomId('pick').addOption({ label: 'A', value: 'a' })
  );
  ctx.reply({ content: 'Choose:', components: [row.toJSON()] });
});

bot.modal('feedback', (ctx) => ctx.reply('Thanks!'));

bot.slash('report', (ctx) => {
  const modal = new Modal()
    .setCustomId('feedback')
    .setTitle('Feedback')
    .addComponent(new ActionRow().addComponent(
      new TextInput().setCustomId('body').setLabel('Message').setStyle(2).setRequired(true)
    ));
  ctx.modal(modal);
});
```

### Permissions

`PERMISSIONS` maps permission names to bit positions; `hasPermission(bits, name)`
reads the 64-bit bitfield without BigInt (ADMINISTRATOR implies everything).

```js
const { hasPermission, PERMISSIONS } = require('elyxion-discord');
hasPermission('1071698660929', 'MANAGE_MESSAGES'); // true
```

### Cache

`bot.cache` is kept fresh by gateway events automatically:

```js
bot.cache.getGuild(id);                  // or getChannel / getUser / getRole
bot.cache.getMember(guildId, userId);
bot.cache.getMessage(channelId, messageId);
bot.on('messageCreate', (m) => { /* bot.cache already updated */ });
```

### `RestClient`

```js
const { RestClient } = require('elyxion-discord');
const rest = new RestClient({ token: process.env.DISCORD_TOKEN });

const res = await rest.get('/users/@me');
const sent = await rest.post('/channels/123/messages', { content: 'hi' });
await rest.sendFile('123', {
  content: 'Here it is',
  file: { name: 'x.png', data: buffer, contentType: 'image/png' }
});
```

Every call returns `{ statusCode, data, body, headers }` and never throws on
HTTP error codes — inspect `statusCode`. 429 and 5xx responses are retried
with exponential backoff, and rate-limit buckets are honored before each
request. Methods: `get`, `post`, `put`, `patch`, `del`.

### `Gateway`

```js
const { Gateway } = require('elyxion-discord');
const gw = new Gateway({ token, intents: ['GUILDS', 'GUILD_MESSAGES'], compress: true });
gw.on('message', (payload) => console.log(payload.op, payload.t));
gw.on('reconnecting', (info) => console.log('reconnect in', info.delay, 'ms'));
gw.on('ready', (data) => console.log('session', data.session_id));
gw.setPresence({ status: 'online', activities: [{ name: 'Coding', type: 0 }] });
gw.connect();
```

`Gateway` emits `message`, `hello`, `connected`, `ready` (READY dispatch),
`reconnect`, `reconnecting`, `error`, and `close`. Sessions resume
automatically after disconnects (op 6), with capped exponential backoff. The
RFC 6455 frame encoder/parser (`encodeFrame`, `FrameParser`) are exported for
reuse and are fully unit-tested.

## CLI

```bash
elyxion cli.js create <name>   # scaffold a bot project (bot.js, commands/, .env.example)
elyxion cli.js run [dir]       # load ./bot.js and start the bot
```

## Runtime notes

- REST traffic goes through `curl` (macOS, Linux, Windows 10+) because the
  runtime doesn't have an outbound TLS client yet — the same trade-off the
  package manager makes.
- The gateway needs TLS to reach `gateway.discord.gg`; the framework uses the
  runtime's `tls` module (falling back to plain `net` for `ws://` URLs) and the
  `zlib` module for `compress: true` (falls back gracefully if unavailable).
- No environment is auto-loaded unless you call `loadEnv()` (a tiny,
  dependency-free `.env` reader exported from the framework).

## Tests

```bash
elyxion test/framework.test.js    # under the Elyxion runtime
node test/framework.test.js       # also runs under Node (same API surface)
```

## License

Apache-2.0.
