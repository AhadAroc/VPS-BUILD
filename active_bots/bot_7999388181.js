
const { Telegraf } = require('telegraf');
const config = require('./7999388181_config.js');
const token = config.token;

const bot = new Telegraf(token);

bot.start((ctx) => ctx.reply('Welcome to your protection bot!'));

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
            