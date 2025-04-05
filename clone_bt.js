const { Telegraf, Markup } = require('telegraf');
const { fork } = require('child_process');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const mongoURI = process.env.MONGODB_URI;
require('dotenv').config();
//const Heroku = require('heroku-client');
const mongoose = require('mongoose');
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  ssl: true,
  tls: true,
  tlsAllowInvalidCertificates: false
});

// Add this at the top of your file with other imports
const crypto = require('crypto');
// Heroku API key
//const HEROKU_API_KEY = 'HRKU-f72294ab-1a52-467d-a9ef-1405ecb9345d';
//const heroku = new Heroku({ token: HEROKU_API_KEY });

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


const cloneSchema = new mongoose.Schema({
  token: String,
  ownerId: Number,
  createdAt: { type: Date, default: Date.now },
  // add any other fields you use
});

mongoose.model('Clone', cloneSchema);

const bot = new Telegraf(BOT_TOKEN);
const app = express();
// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/protectionbot', { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));
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
const config = require('./${botInfo.id}_config.js');
const token = config.token;

const bot = new Telegraf(token);

// Import protection bot functionalities
const { setupCommands } = require('../commands');
const { setupMiddlewares } = require('../middlewares');
const { setupActions } = require('../actions');
const database = require('../database');

// Initialize bot
async function initBot() {
    try {
        // Setup database
        await database.setupDatabase();
        
        // Setup middlewares, commands, and actions
        setupMiddlewares(bot);
        setupCommands(bot);
        setupActions(bot);
        
        // Add your custom protection bot logic here
        
        bot.start((ctx) => ctx.reply('Welcome to your personalized protection bot!'));
        
        // Launch the bot
        await bot.launch();
        console.log(\`Bot \${config.botUsername} started successfully\`);
    } catch (error) {
        console.error('Error initializing bot:', error);
    }
}

initBot();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
`;

fs.writeFileSync(botFilePath, botFileContent);
            
            // Start the bot using PM2
            const pm2 = require('pm2');
            pm2.connect((err) => {
                if (err) {
                    console.error(err);
                    return ctx.reply('❌ حدث خطأ أثناء تشغيل البوت.');
                }

                pm2.start({
                    script: botFilePath,
                    name: `bot_${botInfo.id}`,
                    autorestart: true,
                }, (err) => {
                    if (err) {
                        console.error(err);
                        return ctx.reply('❌ حدث خطأ أثناء تشغيل البوت.');
                    }

                    // Store bot details
                    activeBots[botInfo.id] = {
                        name: botInfo.first_name,
                        username: botInfo.username,
                        token: token,
                        expiry: EXPIRY_DATE,
                        configPath: configPath,
                        botFilePath: botFilePath
                    };

                    // Create database entry
                    createCloneDbEntry(botInfo.id, token);

                    ctx.reply(`✅ <b>تم تنصيب بوت الحماية الخاص بك:</b>

- اسم البوت: ${botInfo.first_name}
- ايدي البوت: ${botInfo.id}
- معرف البوت: @${botInfo.username}
- توكن البوت: <code>${token}</code>

~ <b>تاريخ انتهاء الاشتراك</b>: ${EXPIRY_DATE}
- يمكنك دائما تجديد الاشتراك مجانا سيتم تنبيهك عن طريق البوت الخاص بك لاتقلق.`, { 
                        parse_mode: 'HTML',
                        disable_web_page_preview: true 
                    });
                });
            });
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

async function createCloneDbEntry(botId, botToken) {
    const CloneModel = mongoose.model('Clone', new mongoose.Schema({
        botId: String,
        botToken: String,
        createdAt: Date,
        statistics: {
            messagesProcessed: { type: Number, default: 0 },
            commandsExecuted: { type: Number, default: 0 },
        }
    }));

    const newClone = new CloneModel({
        botId,
        botToken,
        createdAt: new Date(),
    });

    await newClone.save();
    console.log(`Database entry created for bot ${botId}`);
}
async function cloneBot(originalBotToken, newBotToken) {
    const cloneId = uuidv4();
    const cloneName = `clone-${cloneId}`;
  
    // Copy the original bot file
    exec(`cp bot.js ${cloneName}.js`, (error) => {
      if (error) {
        console.error(`Error copying bot file: ${error}`);
        return;
      }
  
      // Replace the bot token in the new file
      exec(`sed -i 's/const BOT_TOKEN = .*/const BOT_TOKEN = "${newBotToken}";/' ${cloneName}.js`, (error) => {
        if (error) {
          console.error(`Error replacing token: ${error}`);
          return;
        }
  
        // Start the new bot process with PM2
        exec(`pm2 start ${cloneName}.js --name ${cloneName}`, (error) => {
          if (error) {
            console.error(`Error starting clone: ${error}`);
            return;
          }
          console.log(`Clone ${cloneName} started successfully`);
        });
      });
    });
  
    // Create a new database entry for the clone
    await createCloneDbEntry(cloneId, newBotToken);
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
            
            const botFilePath = path.join(BOTS_DIR, `bot_${botId}.js`);
            if (!fs.existsSync(botFilePath)) {
                console.error(`Bot file not found for ${config.botUsername}`);
                return;
            }
            
            // Start the bot using PM2
            const pm2 = require('pm2');
            pm2.connect((err) => {
                if (err) {
                    console.error(err);
                    return;
                }

                pm2.start({
                    script: botFilePath,
                    name: `bot_${botId}`,
                    autorestart: true,
                }, (err) => {
                    if (err) {
                        console.error(`Failed to start bot ${config.botUsername}:`, err);
                        return;
                    }

                    // Store bot details
                    activeBots[botId] = {
                        name: config.botName,
                        username: config.botUsername,
                        token: config.token,
                        expiry: config.expiryDate,
                        configPath: configPath,
                        botFilePath: botFilePath
                    };
                    
                    console.log(`Loaded existing bot: @${config.botUsername}`);
                });
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
