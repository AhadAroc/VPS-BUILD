require('dotenv').config();
const { Telegraf, session, Scenes } = require('telegraf');
const express = require('express');
const mongoose = require('mongoose');
const { token } = require('./config');
const database = require('./database');
const { setupActions } = require('./actions');
const { setupMiddlewares } = require('./middlewares');
const { setupCommands, isSubscribed } = require('./commands');

const { Clone } = require('./models');

const BOT_TOKEN = process.env.BOT_TOKEN;
require('dotenv').config();  // Add this at the top of bot.js if you're using a .env file




// Create a new bot instance
const bot = new Telegraf(token);
const app = express(); // Create Express app

// Define the Clone model
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



async function getBotData() {
    try {
        console.log('Attempting to fetch bot data...');
        let botData = await Clone.findOne({ botToken: BOT_TOKEN }).exec();
        
        if (!botData) {
            console.log('No clone data found for this bot token. Creating new entry...');
            botData = new Clone({
                botToken: BOT_TOKEN,
                userId: 'default_user_id',
                username: 'default_username',
                createdAt: new Date(),
                statistics: { messagesProcessed: 0, commandsExecuted: 0 }
            });
            await botData.save();
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

async function initializeApp() {
    try {
        await database.setupDatabase();
        console.log('Database initialized successfully');

        try {
            const botData = await getBotData();
            console.log('Bot data retrieved:', botData);
        } catch (error) {
            console.error('Failed to get or create bot data:', error);
            // Continue execution even if bot data retrieval fails
        }

        setupMiddlewares(bot);
        setupCommands(bot);
        setupActions(bot);

        await bot.launch();
        console.log('Bot started successfully');

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Express server is running on port ${PORT}`);
        });

    } catch (error) {
        console.error('Error initializing application:', error);
        process.exit(1);
    }
}
async function updateBotStats(stat, increment = 1) {
    try {
        const CloneModel = mongoose.model('Clone');
        await CloneModel.findOneAndUpdate(
            { botToken: BOT_TOKEN },
            { $inc: { [`statistics.${stat}`]: increment } }
        );
    } catch (error) {
        console.error('Error updating bot statistics:', error);
    }
}
// Start the application
initializeApp();

// Enable graceful stop
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    database.client.close();
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    database.client.close();
});
