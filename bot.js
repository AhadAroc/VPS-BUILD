require('dotenv').config();
const { Telegraf, session, Scenes } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const { token } = require('./config');
const database = require('./database');
const { setupActions, updateUserActivity } = require('./actions');
const { setupCommands } = require('./commands');
const { setupMiddlewares } = require('./middlewares');
const { Clone } = require('./models');

const BOT_TOKEN = process.env.BOT_TOKEN;
const DOMAIN = process.env.DOMAIN;
const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = `/webhook/${BOT_TOKEN}`;

const bot = new Telegraf(BOT_TOKEN);
const app = express();
const argv = require('process').argv;
const cliPortArg = argv.find(arg => arg.startsWith('--port='));
const CUSTOM_PORT = cliPortArg ? parseInt(cliPortArg.split('=')[1], 10) : null;

const CloneSchema = new mongoose.Schema({
  botToken: String,
  userId: String,
  username: String,
  createdAt: Date,
  statistics: {
    messagesProcessed: Number,
    commandsExecuted: Number
  }
});

async function initializeApp(customPort = null) {
  try {
    const db = await database.connectToMongoDB();
    if (!db) throw new Error('❌ DB init failed');

    console.log('✅ DB connection established');

    const botData = await getBotData();

    setupMiddlewares(bot);
    setupCommands(bot);
    setupActions(bot);

    app.use(express.json());
    app.use(bot.webhookCallback(WEBHOOK_PATH));

    await bot.telegram.setWebhook(`${DOMAIN}${WEBHOOK_PATH}`);
    console.log(`🚀 Webhook set: ${DOMAIN}${WEBHOOK_PATH}`);

    const portToUse = customPort || process.env.PORT || 3000;
    app.listen(portToUse, () => {
      console.log(`🌐 Express server listening on port ${portToUse}`);
    });

  } catch (error) {
    console.error('❌ Error during startup:', error);
    process.exit(1);
  }
}


async function getBotData() {
  try {
    console.log('Fetching bot data...');
    let botData = await Clone.findOne({ botToken: BOT_TOKEN }).exec();

    if (!botData) {
      botData = new Clone({
        botToken: BOT_TOKEN,
        userId: 'default_user_id',
        username: 'default_username',
        createdAt: new Date(),
        statistics: { messagesProcessed: 0, commandsExecuted: 0 }
      });
      await botData.save();
      console.log('✅ Created new bot record');
    } else {
      console.log('✅ Found existing bot data');
    }

    return botData;
  } catch (err) {
    console.error('❌ Failed to fetch bot data:', err);
    throw err;
  }
}

async function updateBotStats(stat, increment = 1) {
  try {
    const CloneModel = mongoose.model('Clone');
    await CloneModel.findOneAndUpdate(
      { botToken: BOT_TOKEN },
      { $inc: { [`statistics.${stat}`]: increment } }
    );
  } catch (err) {
    console.error('❌ Error updating stats:', err);
  }
}

async function gracefulShutdown(signal) {
  console.log(`Received ${signal}, cleaning up...`);
  try {
    if (bot && typeof bot.stop === 'function') await bot.stop(signal);
    if (database?.client?.close) await database.client.close();
    console.log('✅ Graceful shutdown complete.');
  } catch (err) {
    console.error('❌ Shutdown error:', err);
  } finally {
    process.exit(0);
  }
}

bot.use(async (ctx, next) => {
  if (!global.botInfo && ctx.botInfo) global.botInfo = ctx.botInfo;

  if (ctx.from) {
    await updateUserActivity(
      ctx.from.id,
      ctx.from.username,
      ctx.from.first_name,
      ctx.from.last_name
    );
  }

  return next();
});

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

initializeApp();

module.exports = { bot, updateBotStats };
