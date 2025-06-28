require('dotenv').config();
const { Telegraf, session, Scenes } = require('telegraf');
const express = require('express');
const { token } = require('./config');
const database = require('./database');
const { setupActions,updateUserActivity } = require('./actions');
const { setupMiddlewares } = require('./middlewares');
const { setupCommands, isSubscribed } = require('./commands');

const { Clone } = require('./models');

const BOT_TOKEN = process.env.BOT_TOKEN;





// Create a new bot instance
const bot = new Telegraf(token);
const app = express(); // Create Express app



async function initializeApp() {
  try {
    const db = await database.connectToMongoDB(); // await full DB init
    if (!db) throw new Error('❌ DB init failed');

    console.log('✅ DB connection established');

    const botData = await getBotData(); // optionally await this

    setupMiddlewares(bot);
    setupCommands(bot);     // no need to await unless setupCommands is async
    setupActions(bot);      // same here

    await bot.launch();
    console.log('🤖 Bot launched!');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🌐 Express server running on port ${PORT}`);
    });

  } catch (error) {
    console.error('❌ Error during bot startup:', error);
    process.exit(1);
  }
}

async function getBotData() {
try {
console.log('Attempting to fetch bot data...');
const db = await database.connectToMongoDB();

let botData = await db.collection('clones').findOne({ botToken: BOT_TOKEN });

if (!botData) {
  console.log('No clone data found for this bot token. Creating new entry...');
  botData = {
    botToken: BOT_TOKEN,
    userId: 'default_user_id',
    username: 'default_username',
    createdAt: new Date(),
    statistics: { messagesProcessed: 0, commandsExecuted: 0 }
  };
  await db.collection('clones').insertOne(botData);
  console.log('Created new database entry for this bot');
} else {
  console.log('Bot data found:', botData);
}

return botData;
} catch (error) {
console.error('Error fetching bot data:', error);
throw error;
}
}


async function updateBotStats(stat, increment = 1) {
    try {
        const db = await database.connectToMongoDB();
        await db.collection('clones').updateOne(
            { botToken: BOT_TOKEN },
            { $inc: { [`statistics.${stat}`]: increment } }
        );
    } catch (error) {
        console.error('Error updating bot statistics:', error);
    }
}


// Enable graceful stop
async function gracefulShutdown(signal) {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    try {
        if (bot && typeof bot.stop === 'function') {
            await bot.stop(signal);
            console.log('Bot stopped.');
        }
        if (database && database.client && typeof database.client.close === 'function') {
            await database.client.close();
            console.log('Database connection closed.');
        }
        console.log('Graceful shutdown completed.');
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
    } finally {
        process.exit(0);
    }
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = { bot, updateBotStats };
// Start the application// Add this to your middleware setup
bot.use(async (ctx, next) => {
    // Store bot info globally for use in other functions
    if (!global.botInfo && ctx.botInfo) {
        global.botInfo = ctx.botInfo;
    }
    
    // Update user activity on every interaction
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
initializeApp();
