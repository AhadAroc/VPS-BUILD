const { Telegraf, session, Scenes } = require('telegraf');
const express = require('express'); // Add this import
const { token } = require('./config');
const database = require('./database');
const { setupActions } = require('./actions');
const { setupMiddlewares } = require('./middlewares');
const { setupCommands } = require('./commands');

// Create a new bot instance
const bot = new Telegraf(token);
const app = express(); // Create Express app

// Initialize database
async function initializeApp() {
    try {
        // Setup database first
        await database.setupDatabase();
        console.log('Database initialized successfully');
        
        // Setup middlewares and actions
        setupMiddlewares(bot);
        setupCommands(bot);
        
        // Pass session and Scenes to setupActions
        setupActions(bot, session, Scenes);
        
        // Get port from environment or use 3000 as default
        const PORT = process.env.PORT || 3000;
        
        // Set up the server
        app.use(express.json());
        
        // Simple route for checking if the bot is running
        app.get('/', (req, res) => {
            res.send('Bot is running!');
        });
        
        // Start the bot based on environment
        if (process.env.NODE_ENV === 'production') {
            // Set webhook path
            const webhookPath = '/webhook';
            
            // Use webhook in production (Heroku)
            app.use(bot.webhookCallback(webhookPath));
            
            // Set the webhook
            const HEROKU_URL = process.env.HEROKU_URL || 'https://apiclonetest-12345.herokuapp.com';
            bot.telegram.setWebhook(`${HEROKU_URL}${webhookPath}`);
            console.log(`Webhook set to: ${HEROKU_URL}${webhookPath}`);
        } else {
            // Use polling in development
            await bot.launch();
            console.log('Bot started with polling');
        }
        
        // Start express server
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error initializing application:', error);
        process.exit(1);
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