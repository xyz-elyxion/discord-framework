// Elyxion Discord Framework — example bot
// ------------------------------------------------------------------
// Run with:  elyxion examples/basic/bot.js
// (set DISCORD_TOKEN first, or create a .env next to this file)
'use strict';

const { loadEnv, createBot, Embed } = require('../../index');
loadEnv();

const bot = createBot({
  prefix: process.env.PREFIX || '!',
  token: process.env.DISCORD_TOKEN || ''
});

bot.command('ping', (ctx) => {
  ctx.reply('pong!');
}, { description: 'Replies with pong' });

bot.command('embed', (ctx) => {
  const embed = new Embed()
    .setTitle('Hello from Elyxion')
    .setDescription('A Discord bot running on the Elyxion runtime — no Node.js required.')
    .setColor('#8b5cf6')
    .addField('Runtime', 'Elyxion — one binary, zero dependencies', true)
    .addField('Framework', 'elyxion-discord', true)
    .setFooter('Built with elyxion-discord');
  ctx.reply({ embeds: [embed.toJSON()] });
}, { description: 'Sends an embed' });

bot.command('help', (ctx) => {
  const list = bot.commands.list()
    .map((c) => '`' + bot.prefix + c.usage + '` — ' + c.description)
    .join('\n');
  ctx.reply('**Commands**\n' + list);
}, { description: 'Lists commands' });

bot.on('ready', (user) => {
  console.log('');
  console.log('  ⚡ Elyxion Discord Framework example');
  console.log('     Logged in as ' + user.username + ' (' + user.id + ')');
  console.log('     Commands: !ping, !embed, !help');
  console.log('');
});

bot.on('error', (err) => console.error('Bot error: ' + err.message));

if (require.main === module) {
  bot.login().then(() => bot.connect());
}

module.exports = { bot };
