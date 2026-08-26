// Elyxion Discord Framework — tests
// ---------------------------------------------------------------
// Runs under the Elyxion runtime (`elyxion test/framework.test.js`)
// and under Node.js (`node test/framework.test.js`). Network calls
// are stubbed — everything tested here runs in-process.
'use strict';

const assert = require('assert');
const { TestRunner } = require('../../elyxion-cli/test/runner');

const fw = require('../index');
const { Embed, createBot, CommandRegistry } = fw;
const { encodeFrame, FrameParser, intentBits } = require('../lib/gateway');

const runner = new TestRunner();

// ---- util -------------------------------------------------------

runner.describe('util', () => {
  runner.it('resolveColor accepts names, hex, ints, and rgb arrays', () => {
    assert.strictEqual(fw.resolveColor('red'), 0xed4245);
    assert.strictEqual(fw.resolveColor('#8b5cf6'), 0x8b5cf6);
    assert.strictEqual(fw.resolveColor('8b5cf6'), 0x8b5cf6);
    assert.strictEqual(fw.resolveColor(0xffffff), 0xffffff);
    assert.strictEqual(fw.resolveColor([1, 2, 3]), (1 << 16) | (2 << 8) | 3);
    assert.strictEqual(fw.resolveColor('nope'), 0x000000);
  });

  runner.it('parseMention extracts a user id', () => {
    assert.strictEqual(fw.parseMention('<@123456789012345678>'), '123456789012345678');
    assert.strictEqual(fw.parseMention('<@!123456789012345678>'), '123456789012345678');
    assert.strictEqual(fw.parseMention('hello'), null);
  });

  runner.it('snowflakeToDate decodes a snowflake timestamp', () => {
    const date = fw.snowflakeToDate('1754064000000000000');
    assert(date instanceof Date);
    assert.strictEqual(date.getTime(), Math.floor(1754064000000000000 / 4194304) + 1420070400000);
    assert.strictEqual(fw.snowflakeToDate('not-an-id'), null);
  });

  runner.it('truncate shortens long strings', () => {
    assert.strictEqual(fw.truncate('hello world', 5), 'hell…');
    assert.strictEqual(fw.truncate('hi', 5), 'hi');
  });

  runner.it('loadEnv reads a .env file without clobbering existing vars', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const file = path.join(os.tmpdir(), 'elyxion-discord-env-' + Date.now() + '.env');
    fs.writeFileSync(file, 'A=1\nB="two words"\n# comment\nC=3\n');
    process.env.B = 'already-set';
    fw.loadEnv(file);
    assert.strictEqual(process.env.A, '1');
    assert.strictEqual(process.env.B, 'already-set');
    assert.strictEqual(process.env.C, '3');
    delete process.env.A; delete process.env.B; delete process.env.C;
    fs.unlinkSync(file);
  });
});

// ---- embeds -----------------------------------------------------

runner.describe('embed', () => {
  runner.it('builds a complete embed JSON payload', () => {
    const embed = new Embed()
      .setTitle('Title')
      .setDescription('Desc')
      .setColor('#8b5cf6')
      .setURL('https://example.com')
      .setAuthor('Elyxion', { url: 'https://example.com' })
      .setFooter('Footer', 'https://example.com/icon.png')
      .setThumbnail('https://example.com/t.png')
      .setImage('https://example.com/i.png')
      .setTimestamp('2026-01-01T00:00:00.000Z')
      .addField('A', '1', true)
      .addField('B', '2');

    const json = embed.toJSON();
    assert.strictEqual(json.title, 'Title');
    assert.strictEqual(json.description, 'Desc');
    assert.strictEqual(json.color, 0x8b5cf6);
    assert.strictEqual(json.url, 'https://example.com');
    assert.strictEqual(json.author.name, 'Elyxion');
    assert.strictEqual(json.footer.text, 'Footer');
    assert.strictEqual(json.thumbnail.url, 'https://example.com/t.png');
    assert.strictEqual(json.image.url, 'https://example.com/i.png');
    assert.strictEqual(json.timestamp, '2026-01-01T00:00:00.000Z');
    assert.deepStrictEqual(json.fields, [
      { name: 'A', value: '1', inline: true },
      { name: 'B', value: '2', inline: false }
    ]);
  });

  runner.it('enforces the 25-field limit', () => {
    const embed = new Embed();
    assert.throws(() => {
      for (let i = 0; i < 26; i++) embed.addField('f' + i, 'v');
    }, /25/);
  });

  runner.it('setTimestamp() without an argument uses now', () => {
    const before = Date.now();
    const ts = new Embed().setTimestamp().toJSON().timestamp;
    const after = Date.now();
    const parsed = new Date(ts).getTime();
    assert(parsed >= before - 1000 && parsed <= after + 1000);
  });
});

// ---- command parsing --------------------------------------------

runner.describe('commands', () => {
  runner.it('parses prefix, name, args, and text', () => {
    const parsed = CommandRegistry.prototype.parse || require('../lib/commands').parseCommand;
    const hit = parsed('!greet ada lovelace', '!');
    assert.strictEqual(hit.name, 'greet');
    assert.deepStrictEqual(hit.args, ['ada', 'lovelace']);
    assert.strictEqual(hit.text, 'ada lovelace');
  });

  runner.it('returns null for non-command messages', () => {
    const parsed = require('../lib/commands').parseCommand;
    assert.strictEqual(parsed('hello there', '!'), null);
    assert.strictEqual(parsed('!', '!'), null);
  });

  runner.it('find() matches commands and aliases', () => {
    const reg = new CommandRegistry();
    reg.register('ping', () => {}, { aliases: ['p'], description: 'Pong' });
    assert(reg.find('!ping', '!'));
    assert(reg.find('!p', '!'));
    assert.strictEqual(reg.find('!pong', '!'), null);
    assert.strictEqual(reg.find('!ping', '!').command.description, 'Pong');
  });
});

// ---- bot dispatch -----------------------------------------------

runner.describe('bot', () => {
  runner.it('dispatches a command and replies with a mention', async () => {
    const bot = createBot({ token: 'test', prefix: '!' });
    let sent = null;
    bot.sendMessage = async (channelId, payload) => { sent = { channelId, payload }; return { id: 'm2' }; };

    bot.command('ping', (ctx) => ctx.reply('pong'));

    bot._handleMessage({
      id: 'm1',
      channel_id: 'c1',
      content: '!ping',
      author: { id: 'u1', bot: false }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert(sent, 'expected a reply');
    assert.strictEqual(sent.channelId, 'c1');
    assert(sent.payload.content.includes('<@u1>'));
    assert(sent.payload.content.includes('pong'));
  });

  runner.it('passes args through to the handler', async () => {
    const bot = createBot({ token: 'test', prefix: '.' });
    let seen = null;
    bot.sendMessage = async () => ({});
    bot.command('echo', (ctx) => { seen = ctx; ctx.reply(ctx.text); });

    bot._handleMessage({ id: 'x', channel_id: 'c', content: '.echo hello world', author: { id: 'u', bot: false } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.strictEqual(seen.name, 'echo');
    assert.deepStrictEqual(seen.args, ['hello', 'world']);
    assert.strictEqual(seen.text, 'hello world');
  });

  runner.it('ignores bot messages and unknown commands', async () => {
    const bot = createBot({ token: 'test', prefix: '!' });
    let ran = false;
    bot.command('ping', () => { ran = true; });

    bot._handleMessage({ id: '1', channel_id: 'c', content: '!ping', author: { id: 'bot1', bot: true } });
    bot._handleMessage({ id: '2', channel_id: 'c', content: '!nope', author: { id: 'u', bot: false } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.strictEqual(ran, false);
  });

  runner.it('emits commandError when a handler throws', async () => {
    const bot = createBot({ token: 'test', prefix: '!' });
    let error = null;
    bot.on('commandError', (err) => { error = err; });
    bot.command('boom', () => { throw new Error('kaboom'); });

    bot._handleMessage({ id: '1', channel_id: 'c', content: '!boom', author: { id: 'u', bot: false } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert(error && error.message === 'kaboom');
  });

  runner.it('dispatches gateway dispatch events', () => {
    const bot = createBot({ token: 'test', prefix: '!' });
    let got = null;
    bot.on('MESSAGE_CREATE', (m) => { got = m; });
    bot._handleGatewayEvent({ op: 0, t: 'MESSAGE_CREATE', d: { id: '1' } });
    assert.strictEqual(got.id, '1');
  });
});

// ---- websocket framing ------------------------------------------

runner.describe('gateway framing', () => {
  runner.it('encodes and decodes a masked text frame round-trip', () => {
    const frame = encodeFrame('hello');
    const parsed = new FrameParser();
    const frames = parsed.push(frame);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(frames[0].opcode, 0x1);
    assert.strictEqual(String(frames[0].payload), 'hello');
  });

  runner.it('handles 126-byte and 64-bit length frames', () => {
    const big = new Array(200).join('x'); // 199 chars
    const frame = encodeFrame(big);
    const parsed = new FrameParser();
    const frames = parsed.push(frame);
    assert.strictEqual(String(frames[0].payload), big);
  });

  runner.it('parses frames split across multiple chunks', () => {
    const frame = encodeFrame('split me');
    const half = Math.floor(frame.length / 2);
    const parsed = new FrameParser();
    assert.deepStrictEqual(parsed.push(frame.slice(0, half)), []);
    const frames = parsed.push(frame.slice(half));
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(String(frames[0].payload), 'split me');
  });

  runner.it('parses two frames from one buffer', () => {
    const buf = Buffer.concat([encodeFrame('one'), encodeFrame('two')]);
    const parsed = new FrameParser();
    const frames = parsed.push(buf);
    assert.strictEqual(frames.length, 2);
    assert.strictEqual(String(frames[0].payload), 'one');
    assert.strictEqual(String(frames[1].payload), 'two');
  });

  runner.it('intentBits maps names to gateway intent bits', () => {
    const bits = intentBits(['GUILDS', 'GUILD_MESSAGES']);
    assert.strictEqual(bits, (1 << 0) | (1 << 9));
    assert.strictEqual(intentBits(['NOPE']), 0);
  });
});

// Run
runner.run().then((results) => {
  process.exit(results.failed > 0 ? 1 : 0);
});
