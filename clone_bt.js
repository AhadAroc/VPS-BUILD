const { Telegraf, Markup } = require('telegraf');
const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const Heroku = require('heroku-client');
// Add this at the top of your file with other imports
const crypto = require('crypto');
// Heroku API key
const HEROKU_API_KEY = 'HRKU-f72294ab-1a52-467d-a9ef-1405ecb9345d';
const heroku = new Heroku({ token: HEROKU_API_KEY });

// ... (rest of your existing code)
// ===== Configuration =====
const BOT_TOKEN = '7901374595:AAGTDSReIu3gRhsDRXxUIR2UJR5MIK4kMCE'; // Your clone manager bot token
const ADMIN_ID = 7308214106; // Your Telegram Admin ID (Lorsiv)
const EXPIRY_DATE = '2025/03/15';
const PORT = process.env.PORT || 10000;

// Store active bot processes and their info
const activeBots = {};
const BOTS_DIR = path.join(__dirname, 'active_bots');

// Ensure the bots directory exists
if (!fs.existsSync(BOTS_DIR)) {
    fs.mkdirSync(BOTS_DIR, { recursive: true });
}

const bot = new Telegraf(BOT_TOKEN);
const app = express();

// Set up a simple route for health checks
app.get('/', (req, res) => {
    res.send('Protection Bot Manager is running!');
});

// Your existing bot code
bot.start((ctx) => {
    ctx.reply('🤖 أهلا بك! ماذا تريد أن تفعل؟', Markup.inlineKeyboard([
        [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
        [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')]
    ]));
});

// Handle "Create Bot" option
bot.action('create_bot', (ctx) => {
    ctx.reply('🆕 لإنشاء بوت جديد، أرسل **التوكن** الذي حصلت عليه من @BotFather.');
});

// Handle token submission
bot.on('text', async (ctx) => {
    const token = ctx.message.text.trim();

    // Validate token format
    if (!token.match(/^\d+:[A-Za-z0-9_-]{35,}$/)) {
        return ctx.reply('❌ التوكن غير صالح. تأكد من نسخه بشكل صحيح من @BotFather.');
    }

    ctx.reply('⏳ جاري التحقق من التوكن...');

    try {
        // Verify the token is valid
        const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
        if (response.data && response.data.ok) {
            const botInfo = response.data.result;
            
            // Create a config file for this bot instance
            const configPath = path.join(BOTS_DIR, `${botInfo.id}_config.js`);
            const configContent = `
module.exports = {
    token: '${token}',
    botId: ${botInfo.id},
    botName: '${botInfo.first_name}',
    botUsername: '${botInfo.username}',
    expiryDate: '${EXPIRY_DATE}',
    createdAt: '${new Date().toISOString()}',
    createdBy: ${ctx.from.id}
};
            `;
            
            fs.writeFileSync(configPath, configContent);
            
            // Create a custom bot file for this instance
            const botFilePath = path.join(BOTS_DIR, `bot_${botInfo.id}.js`);
            const botFileContent = `
const { Telegraf } = require('telegraf');
const database = require('../database');
const { setupActions } = require('../actions');
const { setupMiddlewares } = require('../middlewares');
const { setupCommands } = require('../commands');

// Load the bot-specific config
const config = require('./${botInfo.id}_config.js');
const token = config.token;

// Create a new bot instance
const bot = new Telegraf(token);

// Initialize database
async function initializeApp() {
    try {
        // Setup database first
        await database.setupDatabase();
        console.log('Database initialized successfully');
        
        // Setup middlewares and actions
        setupMiddlewares(bot);
        setupCommands(bot);
        setupActions(bot);
        
        // Start the bot
        await bot.launch();
        console.log(\`Bot \${config.botUsername} started successfully\`);
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
            `;
            
            fs.writeFileSync(botFilePath, botFileContent);
            
            // Deploy the bot to Heroku
            ctx.reply('⏳ جاري تنصيب البوت على Heroku...');
            const herokuUrl = await deployBotToHeroku({
                id: botInfo.id,
                name: botInfo.first_name,
                username: botInfo.username,
                token: token
            });
            
            // Start the bot process locally (you might want to remove this if running on Heroku)
            const botProcess = fork(botFilePath);

botProcess.on('message', (message) => {
    console.log(`Message from bot ${botInfo.username}:`, message);
});

botProcess.on('error', (error) => {
    console.error(`Error in bot ${botInfo.username}:`, error);
    delete activeBots[botInfo.id];
});

botProcess.on('exit', (code, signal) => {
    if (code !== 0) {
        console.error(`Bot ${botInfo.username} exited with error code ${code}`);
        // You might want to attempt to restart the bot here
    } else if (signal) {
        console.log(`Bot ${botInfo.username} was killed with signal ${signal}`);
    } else {
        console.log(`Bot ${botInfo.username} exited normally`);
    }
    delete activeBots[botInfo.id];
});
            
            // Store bot details
            activeBots[botInfo.id] = {
                name: botInfo.first_name,
                username: botInfo.username,
                token: token,
                expiry: EXPIRY_DATE,
                process: botProcess,
                configPath: configPath,
                botFilePath: botFilePath,
                herokuUrl: herokuUrl
            };
            
            // Handle bot process events
            botProcess.on('message', (message) => {
                console.log(`Message from bot ${botInfo.username}:`, message);
            });
            
            botProcess.on('error', (error) => {
                console.error(`Error in bot ${botInfo.username}:`, error);
                delete activeBots[botInfo.id];
            });
            
            botProcess.on('exit', (code) => {
                console.log(`Bot ${botInfo.username} exited with code ${code}`);
                delete activeBots[botInfo.id];
            });

            // Send confirmation message using HTML formatting
            ctx.reply(`✅ <b>تم تنصيب بوت الحماية الخاص بك:</b>

- اسم البوت: ${botInfo.first_name}
- ايدي البوت: ${botInfo.id}
- معرف البوت: @${botInfo.username}
- توكن البوت: <code>${token}</code>
- رابط Heroku: ${herokuUrl}

~ <b>تاريخ انتهاء الاشتراك</b>: ${EXPIRY_DATE}
- يمكنك دائما تجديد الاشتراك مجانا سيتم تنبيهك عن طريق البوت الخاص بك لاتقلق.`, { 
                parse_mode: 'HTML',
                disable_web_page_preview: true 
            });

            ctx.reply('هل تريد إنشاء بوت آخر؟', Markup.inlineKeyboard([
                [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
                [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')]
            ]));
        } else {
            ctx.reply('❌ التوكن غير صالح أو البوت غير متاح.');
        }
    } catch (error) {
        console.error('❌ خطأ أثناء التحقق أو التنصيب:', error);
        ctx.reply('❌ حدث خطأ أثناء التحقق من التوكن أو تنصيب البوت.');
    }
});
// Show Active Bots
bot.action('show_active_bots', (ctx) => {
    const botIds = Object.keys(activeBots);
    
    if (botIds.length === 0) {
        return ctx.reply('🚫 لا يوجد أي بوتات نشطة.');
    }

    let message = '🤖 <b>البوتات النشطة:</b>\n';
    botIds.forEach((botId, index) => {
        const botInfo = activeBots[botId];
        message += `${index + 1}. <b>${botInfo.name}</b> - <a href="https://t.me/${botInfo.username}">@${botInfo.username}</a>\n`;
    });

    ctx.reply(message, { 
        parse_mode: 'HTML',
        disable_web_page_preview: true 
    });
});
// Function to deploy bot to Heroku
async function deployBotToHeroku(botInfo) {
    try {
        // Generate a unique app name
        const uniqueId = crypto.randomBytes(4).toString('hex'); // 8 character unique ID
        const appName = `lorsiv-${uniqueId}`;

        console.log(`Attempting to create Heroku app with name: ${appName}`);

        // Create a new Heroku app
        const app = await heroku.post('/apps', {
            body: {
                name: appName,
                region: 'us'
            }
        });

        console.log(`Created Heroku app: ${app.name}`);

        // Set config vars (environment variables)
        await heroku.patch(`/apps/${app.name}/config-vars`, {
            body: {
                BOT_TOKEN: botInfo.token,
                NODE_ENV: 'production',
                BOT_USERNAME: botInfo.username // Store the bot's username for reference
            }
        });

        console.log(`Set config vars for ${app.name}`);

        // Add Node.js buildpack
        try {
            await heroku.post(`/apps/${app.name}/buildpacks`, {
                body: {
                    buildpack: 'heroku/nodejs'
                }
            });
            console.log(`Added Node.js buildpack to ${app.name}`);
        } catch (buildpackError) {
            console.error('Error adding buildpack:', buildpackError);
            // If adding buildpack fails, we'll continue with the deployment
        }

        // Create a Git remote for the app
        const remoteUrl = `https://git.heroku.com/${app.name}.git`;
        console.log(`Heroku Git remote: ${remoteUrl}`);

        // Here you would typically push your code to this remote
        // This part depends on how you've set up your project structure
        console.log(`TODO: Push bot code to ${remoteUrl}`);

        // You might want to use a Git library or spawn a child process to push the code
        // For example:
        // await exec(`git init && git add . && git commit -m "Initial commit" && git push ${remoteUrl} master`);

        console.log(`Bot deployed to Heroku: ${app.web_url}`);

        return {
            appName: app.name,
            webUrl: app.web_url,
            gitUrl: remoteUrl
        };
    } catch (error) {
        console.error('Error deploying to Heroku:', error);
        
        if (error.statusCode) {
            console.error(`Heroku API Error (Status ${error.statusCode}):`, error.body);
        }
        
        throw error;
    }
}
// Load existing bots on startup
function loadExistingBots() {
    if (!fs.existsSync(BOTS_DIR)) return;
    
    const configFiles = fs.readdirSync(BOTS_DIR).filter(file => file.endsWith('_config.js'));
    
    configFiles.forEach(file => {
        try {
            const configPath = path.join(BOTS_DIR, file);
            const config = require(configPath);
            const botId = config.botId;
            
            // Check if the bot file exists
            const botFilePath = path.join(BOTS_DIR, `bot_${botId}.js`);
            if (!fs.existsSync(botFilePath)) {
                // Create the bot file if it doesn't exist
                const botFileContent = `
const { Telegraf } = require('telegraf');
const database = require('../database');
const { setupActions } = require('../actions');
const { setupMiddlewares } = require('../middlewares');
const { setupCommands } = require('../commands');

// Load the bot-specific config
const config = require('./${botId}_config.js');
const token = config.token;

// Create a new bot instance
const bot = new Telegraf(token);

// Initialize database
async function initializeApp() {
    try {
        // Setup database first
        await database.setupDatabase();
        console.log('Database initialized successfully');
        
        // Setup middlewares and actions
        setupMiddlewares(bot);
        setupCommands(bot);
        setupActions(bot);
        
        // Start the bot
        await bot.launch();
        console.log(\`Bot \${config.botUsername} started successfully\`);
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
                `;
                
                fs.writeFileSync(botFilePath, botFileContent);
            }
            
            // Start the bot process
            const botProcess = fork(botFilePath);
            
            // Store bot details
            activeBots[botId] = {
                name: config.botName,
                username: config.botUsername,
                token: config.token,
                expiry: config.expiryDate,
                process: botProcess,
                configPath: configPath,
                botFilePath: botFilePath
            };
            
            console.log(`Loaded existing bot: @${config.botUsername}`);
            
            // Handle bot process events
            botProcess.on('error', (error) => {
                console.error(`Error in bot ${config.botUsername}:`, error);
                delete activeBots[botId];
            });
            
            botProcess.on('exit', (code) => {
                console.log(`Bot ${config.botUsername} exited with code ${code}`);
                delete activeBots[botId];
            });
        } catch (error) {
            console.error(`Error loading bot from config file ${file}:`, error);
        }
    });
}

// Add admin commands
bot.command('admin', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('⛔ هذا الأمر متاح فقط للمسؤول.');
    }
    
    ctx.reply('👑 <b>لوحة تحكم المسؤول</b>', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 إحصائيات البوتات', 'admin_stats')],
            [Markup.button.callback('🗑️ حذف بوت', 'admin_delete_bot')],
            [Markup.button.callback('🔄 إعادة تشغيل جميع البوتات', 'admin_restart_all')]
        ])
    });
});

// Admin stats
bot.action('admin_stats', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const botCount = Object.keys(activeBots).length;
    let message = `📊 <b>إحصائيات البوتات</b>\n\n`;
    message += `• عدد البوتات النشطة: <b>${botCount}</b>\n\n`;
    
    if (botCount > 0) {
        message += `<b>قائمة البوتات:</b>\n`;
        Object.entries(activeBots).forEach(([id, info], index) => {
            message += `${index + 1}. <b>${info.name}</b> (@${info.username})\n`;
            message += `   - تاريخ الانتهاء: ${info.expiry}\n`;
        });
    }
    
    ctx.editMessageText(message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]])
    });
});

// Admin delete bot selection
bot.action('admin_delete_bot', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const botIds = Object.keys(activeBots);
    if (botIds.length === 0) {
        return ctx.editMessageText('🚫 لا يوجد أي بوتات نشطة للحذف.', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]])
        });
    }
    
    const buttons = botIds.map(id => {
        const info = activeBots[id];
        return [Markup.button.callback(`${info.name} (@${info.username})`, `delete_bot_${id}`)];
    });
    
    buttons.push([Markup.button.callback('🔙 رجوع', 'admin_back')]);
    
    ctx.editMessageText('🗑️ اختر البوت الذي تريد حذفه:', {
        ...Markup.inlineKeyboard(buttons)
    });
});

// Handle bot deletion
bot.action(/^delete_bot_(\d+)$/, (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const botId = ctx.match[1];
    if (!activeBots[botId]) {
        return ctx.answerCbQuery('❌ البوت غير موجود أو تم حذفه بالفعل.');
    }
    
    const botInfo = activeBots[botId];
    
    // Kill the bot process
    if (botInfo.process) {
        botInfo.process.kill();
    }
    
    // Delete the bot files
    try {
        if (fs.existsSync(botInfo.configPath)) {
            fs.unlinkSync(botInfo.configPath);
        }
        if (fs.existsSync(botInfo.botFilePath)) {
            fs.unlinkSync(botInfo.botFilePath);
        }
    } catch (error) {
        console.error(`Error deleting bot files for ${botInfo.username}:`, error);
    }
    
    // Remove from active bots
    delete activeBots[botId];
    
    ctx.editMessageText(`✅ تم حذف البوت <b>${botInfo.name}</b> (@${botInfo.username}) بنجاح.`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]])
    });
});

// Restart all bots
bot.action('admin_restart_all', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    const botIds = Object.keys(activeBots);
    if (botIds.length === 0) {
        return ctx.editMessageText('🚫 لا يوجد أي بوتات نشطة لإعادة تشغيلها.', {
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]])
        });
    }
    
    await ctx.editMessageText('⏳ جاري إعادة تشغيل جميع البوتات...');
    
    let restartedCount = 0;
    let failedCount = 0;
    
    for (const botId of botIds) {
        try {
            const botInfo = activeBots[botId];
            
            // Kill the existing process
            if (botInfo.process) {
                botInfo.process.kill();
            }
            
            // Start a new process
            const botProcess = fork(botInfo.botFilePath);
            
            // Update the process reference
            botInfo.process = botProcess;
            
            // Handle bot process events
            botProcess.on('error', (error) => {
                console.error(`Error in bot ${botInfo.username}:`, error);
                delete activeBots[botId];
            });
            
            botProcess.on('exit', (code) => {
                console.log(`Bot ${botInfo.username} exited with code ${code}`);
                delete activeBots[botId];
            });
            
            restartedCount++;
        } catch (error) {
            console.error(`Failed to restart bot ${botId}:`, error);
            failedCount++;
        }
    }
    
    ctx.editMessageText(`✅ تمت إعادة تشغيل البوتات بنجاح.\n\n• تم إعادة تشغيل: ${restartedCount}\n• فشل: ${failedCount}`, {
        ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]])
    });
});

// Admin back button
bot.action('admin_back', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    
    ctx.editMessageText('👑 <b>لوحة تحكم المسؤول</b>', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 إحصائيات البوتات', 'admin_stats')],
            [Markup.button.callback('🗑️ حذف بوت', 'admin_delete_bot')],
            [Markup.button.callback('🔄 إعادة تشغيل جميع البوتات', 'admin_restart_all')]
        ])
    });
});

// Help command
bot.help((ctx) => {
    ctx.reply(`🤖 <b>مدير بوتات الحماية</b>

هذا البوت يساعدك على إنشاء نسخة خاصة بك من بوت الحماية.

<b>الأوامر المتاحة:</b>
• /start - بدء استخدام البوت
• /help - عرض هذه المساعدة

<b>كيفية الاستخدام:</b>
1. أنشئ بوت جديد باستخدام @BotFather
2. احصل على التوكن الخاص بالبوت
3. أرسل التوكن إلى هذا البوت
4. سيتم إنشاء بوت الحماية الخاص بك تلقائياً

للمساعدة، تواصل مع @Lorisiv`, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
    });
});

// Start Express server for health checks
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    // Load existing bots after server starts
    loadExistingBots();
});

// Start the bot
bot.launch().then(() => {
    console.log('✅ Clone Manager Bot is running...');
});

// Enable graceful stop
process.once('SIGINT', () => {
    // Stop all bot processes
    Object.values(activeBots).forEach(bot => {
        if (bot.process) {
            bot.process.kill();
        }
    });
    bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
    // Stop all bot processes
    Object.values(activeBots).forEach(bot => {
        if (bot.process) {
            bot.process.kill();
        }
    });
    bot.stop('SIGTERM');
});