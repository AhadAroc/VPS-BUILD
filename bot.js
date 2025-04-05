const { Telegraf, session, Scenes } = require('telegraf');
const express = require('express'); // Add this import
const { token } = require('./config');
const database = require('./database');
const { setupActions } = require('./actions');
const { setupMiddlewares } = require('./middlewares');
const { setupCommands } = require('./commands');
const mongoose = require('mongoose');
const BOT_TOKEN = process.env.BOT_TOKEN;
const Clone = require('./models/Clone');


// Use this function to get the bot's data and update statistics
// Create a new bot instance
const bot = new Telegraf(token);
const app = express(); // Create Express app

async function getBotData() {
    const CloneModel = mongoose.model('Clone');
    let botData = await CloneModel.findOne({ botToken: BOT_TOKEN });
    
    if (!botData) {
      // If no entry found, this might be the original bot, not a clone
      // Handle this case as appropriate for your use case
      console.log('No clone data found for this bot token');
      // You might want to create a default entry here
    }
  
    return botData;
  }
// Initialize database
async function initializeApp() {
    try {
        // Setup database first
        await database.setupDatabase();
        console.log('Database initialized successfully');

        // Check if bot data exists, create if not
        const botData = await getBotData();
        if (!botData) {
            // Create new entry for this bot
            // This depends on how you've structured your Clone model
            const CloneModel = mongoose.model('Clone');
            const newBotData = new CloneModel({
                botToken: BOT_TOKEN,
                createdAt: new Date(),
                statistics: { messagesProcessed: 0, commandsExecuted: 0 }
            });
            await newBotData.save();
            console.log('Created new database entry for this bot');
        }

        // Rest of your initialization code...
    } catch (error) {
        console.error('Error initializing application:', error);
        process.exit(1);
    }
}
async function getBotData() {
    try {
        const CloneModel = mongoose.model('Clone');
        let botData = await CloneModel.findOne({ botToken: BOT_TOKEN });
        
        if (!botData) {
            console.log('No clone data found for this bot token');
            // You might want to create a default entry here
        }
    
        return botData;
    } catch (error) {
        console.error('Error fetching bot data:', error);
        return null;
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
