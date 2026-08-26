# Elyxion Discord Framework

A **zero-dependency Discord bot framework** that runs on the
[Elyxion CLI](https://github.com/xyz-elyxion/elyxion-cli) — a standalone
JavaScript runtime with no Node.js, no npm, and no `node_modules`.

- **Commands.** Prefix-based command registry with aliases, args, and usage/help metadata.
- **Embeds.** A chainable `Embed` builder that emits the exact JSON Discord expects.
- **REST API.** A `RestClient` for `discord.com/api/v10` (uses `curl`, the same approach the Elyxion package manager uses, because the runtime has no outbound TLS client yet).
- **Gateway.** A WebSocket client (`wss://gateway.discord.gg`) speaking the Discord gateway protocol over the runtime's `tls`/`net` modules — Identify, heartbeat, and dispatch events.
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

bot.command('embed', (ctx) => {
  const embed = new Embed()
    .setTitle('Hello from Elyxion')
    .setDescription('A Discord bot running on the Elyxion runtime.')
    .setColor('#8b5cf6')
    .addField('Runtime', 'Elyxion', true);
  ctx.reply({ embeds: [embed.toJSON()] });
});

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
| `intents` | `GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES, MESSAGE_CONTENT` | Gateway intents (by name). `MESSAGE_CONTENT` is included so prefix commands can read messages. |

`Bot` is an `EventEmitter`:

- `bot.command(name, handler, { aliases, description, usage })` — register a command.
- `bot.on('ready', (user) => {})` — after `login()` verifies the token via REST.
- `bot.on('messageCreate', (msg) => {})`, `...` — every gateway dispatch event, named by its Discord type.
- `bot.on('commandError', (err, ctx) => {})` — thrown command errors.
- `bot.login([token])` — verify the token and resolve with the bot user.
- `bot.connect()` — open the gateway connection.
- `bot.sendMessage(channelId, content)` — send a string or message payload.
- `bot.reply(message, content)` — reply with a mention + `message_reference`.

### Command context

Handlers receive a context object:

```js
bot.command('echo', (ctx) => {
  ctx.name    // 'echo'
  ctx.args    // ['hello', 'world']
  ctx.text    // 'hello world'
  ctx.message // the raw Discord message
  ctx.reply('got it')   // mention + message_reference
  ctx.bot.sendMessage('123', 'hi')
});
```

### `Embed`

```js
const { Embed } = require('elyxion-discord');
const embed = new Embed()
  .setTitle('Title')                       // 256 chars max
  .setDescription('Body')                  // 4096 chars max
  .setColor('#8b5cf6')                     // name | hex | int | [r,g,b]
  .setURL('https://example.com')
  .setAuthor('Elyxion', { url: '...', icon_url: '...' })
  .setThumbnail('https://example.com/t.png')
  .setImage('https://example.com/i.png')
  .setFooter('Footer', 'https://example.com/icon.png')
  .setTimestamp()                          // now, or a Date/string
  .addField('A', '1', true)                // max 25 fields
  .addFields({ name: 'B', value: '2' });

ctx.reply({ embeds: [embed.toJSON()] });
```

### `RestClient`

```js
const { RestClient } = require('elyxion-discord');
const rest = new RestClient({ token: process.env.DISCORD_TOKEN });

const res = await rest.get('/users/@me');
const sent = await rest.post('/channels/123/messages', { content: 'hi' });
```

Every call returns `{ statusCode, data, body }` and never throws on HTTP
error codes — inspect `statusCode`. Methods: `get`, `post`, `put`, `patch`,
`del`.

### `Gateway`

```js
const { Gateway } = require('elyxion-discord');
const gw = new Gateway({ token, intents: ['GUILDS', 'GUILD_MESSAGES'] });
gw.on('message', (payload) => console.log(payload.op, payload.t));
gw.connect();
```

`Gateway` emits `message`, `hello`, `ready`, `error`, and `close`. The
RFC 6455 frame encoder/parser (`encodeFrame`, `FrameParser`) are exported
for reuse and are fully unit-tested.

## CLI

```bash
elyxion cli.js create <name>   # scaffold a bot project (bot.js, commands/, .env.example)
elyxion cli.js run [dir]       # load ./bot.js and start the bot
```

## Runtime notes

- REST traffic goes through `curl` (macOS, Linux, Windows 10+) because the
  runtime doesn't have an outbound TLS client yet — the same trade-off the
  package manager makes.
- The gateway needs TLS to reach `gateway.discord.gg`; the framework uses
  the runtime's `tls` module (falling back to plain `net` for `ws://` URLs).
- No environment is auto-loaded unless you call `loadEnv()` (a tiny,
  dependency-free `.env` reader exported from the framework).

## Tests

```bash
elyxion test/framework.test.js    # under the Elyxion runtime
node test/framework.test.js       # also runs under Node (same API surface)
```

## License

Apache-2.0.
