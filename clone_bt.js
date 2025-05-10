const { Telegraf, Markup } = require('telegraf');
const { fork } = require('child_process');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const { broadcastToGroups } = require('./commands');  // Import our helper
// Add this at the top of your file
const subscriptionCache = {};
const mongoURI = process.env.MONGODB_URI;
// Store user deployments
const userDeployments = new Map();
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
const activeGroups = new Map();
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
    activatedAt: Date,
    expiresAt: Date,
    isActive: { type: Boolean, default: false },
    // add any other fields you use
  });
  
  const Clone = mongoose.model('Clone', cloneSchema);

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
bot.on('new_chat_members', (ctx) => {
    if (ctx.message.new_chat_member.id === ctx.botInfo.id) {
        // Bot was added to a new group
        activeGroups.set(ctx.chat.id, {
            title: ctx.chat.title,
            type: ctx.chat.type
        });
    }
});
// Handle token submission
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;

   
    // Check if user already has a deployed bot
    if (userDeployments.has(userId)) {
        return ctx.reply('❌ عذراً، يمكنك تنصيب بوت واحد فقط في الوقت الحالي.');
    }

    // Validate token format
    if (!token.match(/^\d+:[A-Za-z0-9_-]{35,}$/)) {
        return ctx.reply('');
    }

    ctx.reply('⏳ جاري التحقق من التوكن...');

    try {
        // Verify the token is valid
        const response = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
        if (response.data && response.data.ok) {
            const botInfo = response.data.result;
            
            // Calculate expiry date
            const now = new Date();
            const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

            // Create a config file for this bot instance
            const configPath = path.join(BOTS_DIR, `${botInfo.id}_config.js`);
            const configContent = `
module.exports = {
    token: '${token}',
    botId: ${botInfo.id},
    botName: '${botInfo.first_name}',
    botUsername: '${botInfo.username}',
    expiryDate: '${expiryDate.toISOString()}',
    createdAt: '${now.toISOString()}',
    createdBy: ${ctx.from.id}
};
            `;
            
            fs.writeFileSync(configPath, configContent);
            
            // Create a custom bot file for this instance
            // Create a custom bot file for this instance
const botFilePath = path.join(BOTS_DIR, `bot_${botInfo.id}.js`);
const botFileContent = `
const { Telegraf, Markup } = require('telegraf');
const config = require('./${botInfo.id}_config.js');
const token = config.token;
const mongoose = require('mongoose');
const { checkAndUpdateActivation } = require('../botUtils');

const bot = new Telegraf(token);

// Import protection bot functionalities
const { setupCommands } = require('../commands');
const { setupMiddlewares } = require('../middlewares');
const { setupActions } = require('../actions');
const database = require('../database');


// Channel subscription check function
// Channel subscription check function
// Channel subscription check function
// Channel subscription check function
// Channel subscription check function
async function isSubscribedToChannel(ctx, userId, channelUsername) {
    try {
        // Make sure channelUsername doesn't include the @ symbol
        const formattedChannelUsername = channelUsername.replace('@', '');
        
        // Try to get chat member directly
        const chatMember = await ctx.telegram.getChatMember('@' + formattedChannelUsername, userId);
        
        // These statuses mean the user is in the channel
        return ['creator', 'administrator', 'member'].includes(chatMember.status);
    } catch (error) {
        console.error('Error checking channel subscription for user ' + userId + ' in channel @' + channelUsername + ':', error.description || error);
        
        // If we get "member list is inaccessible" error, we need a different approach
        if (error.description && (
            error.description.includes('member list is inaccessible') || 
            error.description.includes('Bad Request')
        )) {
            // Since we can't check directly, we'll assume the user needs to subscribe
            // This will show the subscription message to the user
            return false;
        }
        
        // For other errors, allow access to prevent blocking legitimate users
        return true;
    }
}
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
        
        // Add middleware to check channel subscription for all commands
        // Add middleware to check channel subscription for all commands
// Add middleware to check channel subscription for all commands
// Add this at the top of your file
const subscriptionCache = {};

// Modify the middleware to use the cache
// Modify the middleware to use the cache
bot.use(async (ctx, next) => {
    if (!ctx.from) {
        return next();
    }

    const userId = ctx.from.id;
    const sourceChannel = 'Lorisiv';

    // Check if the subscription status is cached
    if (subscriptionCache[userId]) {
        if (!subscriptionCache[userId].isSubscribed && !subscriptionCache[userId].messageSent) {
            subscriptionCache[userId].messageSent = true; // Mark message as sent
            return ctx.reply('⚠️ يجب عليك الاشتراك في قناة المطور أولاً للاستفادة من خدمات البوت.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📢 اشترك في القناة', url: 'https://t.me/' + sourceChannel }],
                        [{ text: '✅ تحقق من الاشتراك', callback_data: 'check_subscription' }]
                    ]
                }
            });
        }
        return next();
    }

    try {
        const isSubscribed = await isUserSubscribed(ctx, sourceChannel);

        subscriptionCache[userId] = { isSubscribed, messageSent: false };

        if (!isSubscribed) {
            subscriptionCache[userId].messageSent = true; // Mark message as sent
            return ctx.reply('⚠️ يجب عليك الاشتراك في قناة المطور أولاً للاستفادة من خدمات البوت.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📢 اشترك في القناة', url: 'https://t.me/' + sourceChannel }],
                        [{ text: '✅ تحقق من الاشتراك', callback_data: 'check_subscription' }]
                    ]
                }
            });
        }
    } catch (error) {
        console.error('Error in subscription check middleware:', error);
        // Assume subscribed on error to avoid blocking users
        subscriptionCache[userId] = { isSubscribed: true, messageSent: false };
    }

    return next();
});

// Add this error handler to handle group migration errors
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    // Check if this is a group migration error
    if (err.description && err.description.includes('group chat was upgraded to a supergroup chat')) {
        const newChatId = err.parameters.migrate_to_chat_id;
        const oldChatId = ctx.chat.id;
// Try to send a message to the new supergroup
        ctx.telegram.sendMessage(newChatId, 'تم رفعي الى ادمن, يرجى تفعيل البوت عنطريق ارسال بدء ')
            .catch(e => console.error('Error sending message to new supergroup:', e));
    }
});





        // Handle subscription check callback
        // Handle subscription check callback
// Handle subscription check callback
bot.action('check_subscription', async (ctx) => {
    const sourceChannel = 'Lorisiv'; // Change to your channel username without @
    
    try {
        await ctx.answerCbQuery('⏳ جاري التحقق من الاشتراك...');
        
        const isSubscribed = await isSubscribedToChannel(ctx, ctx.from.id, sourceChannel);
        
        if (isSubscribed) {
            await ctx.answerCbQuery('✅ شكراً للاشتراك! يمكنك الآن استخدام البوت.', { show_alert: true });
            // Try to delete the subscription message
            await ctx.deleteMessage().catch(e => console.error('Could not delete message:', e));
            
            // Send a welcome message with the "Add to Group" button
            await ctx.reply('مرحباً بك في البوت! يمكنك الآن استخدام جميع الميزات.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'أضفني إلى مجموعتك', url: 'https://t.me/' + ctx.me.username + '?startgroup=true' }],
                        [{ text: 'قناة المطور', url: 'https://t.me/Lorisiv' }]
                    ]
                }
            });
        } else {
            await ctx.answerCbQuery('❌ أنت غير مشترك في القناة بعد. يرجى الاشتراك ثم المحاولة مرة أخرى.', { show_alert: true });
        }
    } catch (error) {
        console.error('Error checking subscription in callback:', error);
        await ctx.answerCbQuery('⚠️ حدث خطأ أثناء التحقق من الاشتراك. يمكنك المحاولة مرة أخرى لاحقًا.', { show_alert: true });
    }
});
        
        bot.command('start', async (ctx) => {
            const userId = ctx.from.id;
            const cloneId = token; // Using token as cloneId
            
            const result = await checkAndUpdateActivation(cloneId, userId);
            
            let message = '';
            if (result.status === 'activated') {
                message = 'مرحبًا بك في البوت! تم تفعيل البوت لمدة 30 يومًا. ';
            } else if (result.status === 'active') {
                message = \`مرحبًا بك مجددًا! \${result.message} \\n\\n\`;
            } else {
                message = 'حدث خطأ أثناء تفعيل البوت. يرجى الاتصال بالدعم. ';
            }
            
            message += 'الرجاء إضافة البوت في المجموعة الخاصة لغرض الاستخدام.';
            
            ctx.reply(message, Markup.inlineKeyboard([
                Markup.button.url('أضفني إلى مجموعتك', \`https://t.me/\${ctx.me.username}?startgroup=true\`)
            ]));
        });
        
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
                        expiry: expiryDate.toISOString(),
                        configPath: configPath,
                        botFilePath: botFilePath,
                        createdBy: ctx.from.id
                    };

                    // Store user deployment
                    userDeployments.set(userId, botInfo.id);

                    // Create database entry
                    createCloneDbEntry(botInfo.id, token, expiryDate);

                    ctx.reply(`✅ <b>تم تنصيب بوت الحماية الخاص بك:</b>

- اسم البوت: ${botInfo.first_name}
- ايدي البوت: ${botInfo.id}
- معرف البوت: @${botInfo.username}
- توكن البوت: <code>${token}</code>

~ <b>تاريخ انتهاء الاشتراك</b>: ${expiryDate.toLocaleDateString('ar-EG')}
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
bot.command('broadcast_all', async (ctx) => {
    const isAdmin = ctx.from.id === ADMIN_ID;  // only main admin allowed
    if (!isAdmin) return ctx.reply('❌ هذا الأمر للمطور فقط.');

    ctx.reply('📢 أرسل الآن نص الرسالة أو صورة أو فيديو للبث لكل البوتات.');

    // Listen for next message (1-time listener)
    bot.on('message', async (broadcastCtx) => {
        const text = broadcastCtx.message.text;
        const photo = broadcastCtx.message.photo;
        const video = broadcastCtx.message.video;

        let mediaType = null;
        let mediaId = null;
        let caption = broadcastCtx.message.caption || text;

        if (photo) {
            mediaType = 'photo';
            mediaId = photo[photo.length - 1].file_id;
        } else if (video) {
            mediaType = 'video';
            mediaId = video.file_id;
        }

        for (const botId in activeBots) {
            const botInfo = activeBots[botId];
            const childBotToken = botInfo.token;

            // Create a temporary bot instance
            const { Telegraf } = require('telegraf');
            const childBot = new Telegraf(childBotToken);

            await broadcastToGroups(childBot, botId, null, mediaType, mediaId, caption);
        }

        await broadcastCtx.reply('✅ تم الإرسال لجميع المجموعات في جميع البوتات.');
    });
});
// Show Active Bots
// Show Active Bots - Modified to only show user's own bots
bot.action('show_active_bots', async (ctx) => {
    const userId = ctx.from.id;
    
    // Filter bots to only show those created by the current user
    const userBotIds = Object.keys(activeBots).filter(botId => 
        activeBots[botId].createdBy === userId
    );
    
    if (userBotIds.length === 0) {
        return ctx.answerCbQuery('🚫 لا يوجد أي بوتات نشطة خاصة بك.');
    }

    let message = '🤖 <b>البوتات النشطة الخاصة بك:</b>\n';
    const keyboard = [];
    
    userBotIds.forEach((botId, index) => {
        const botInfo = activeBots[botId];
        message += `${index + 1}. <b>${botInfo.name}</b> - @${botInfo.username}\n`;
        keyboard.push([
            Markup.button.callback(`حذف ${botInfo.name}`, `delete_bot_${botId}`)
        ]);
    });

    keyboard.push([Markup.button.callback('🔙 رجوع', 'back_to_main_menu')]);

    await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...Markup.inlineKeyboard(keyboard)
    });
});
bot.action('back_to_main_menu', (ctx) => {
    ctx.editMessageText('🤖 أهلا بك! ماذا تريد أن تفعل؟', Markup.inlineKeyboard([
        [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
        [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')]
    ]));
});

bot.action(/^delete_bot_(\d+)$/, async (ctx) => {
    const botId = ctx.match[1];
    const userId = ctx.from.id;
    
    if (!activeBots[botId]) {
        return ctx.answerCbQuery('❌ البوت غير موجود أو تم حذفه بالفعل.');
    }
    
    // Check if the user owns this bot
    if (activeBots[botId].createdBy !== userId && userId !== ADMIN_ID) {
        return ctx.answerCbQuery('❌ لا يمكنك حذف بوت لا تملكه.');
    }
    
    const botInfo = activeBots[botId];
    
    // Stop the bot process using PM2
    const pm2 = require('pm2');
    pm2.connect(async (connectErr) => {
        if (connectErr) {
            console.error(`Error connecting to PM2:`, connectErr);
            return ctx.answerCbQuery('❌ حدث خطأ أثناء الاتصال بمدير العمليات.');
        }
        
        pm2.delete(`bot_${botId}`, async (err) => {
            if (err) {
                console.error(`Error stopping bot ${botInfo.username}:`, err);
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
            
            // Remove from database
            const CloneModel = mongoose.model('Clone');
            await CloneModel.deleteOne({ botId: botId }).catch(error => {
                console.error(`Error removing bot ${botId} from database:`, error);
            });
            
            // CRITICAL FIX: Make sure we're properly removing from userDeployments
            // First, check if this user has this specific bot ID
            if (userDeployments.get(userId) === parseInt(botId)) {
                userDeployments.delete(userId);
                console.log(`Removed user ${userId} from userDeployments map`);
            }
            
            await ctx.answerCbQuery(`✅ تم حذف البوت ${botInfo.name} بنجاح.`);
            
            // Refresh the active bots list
            ctx.editMessageText('جاري تحديث القائمة...');
            
            // Show the main menu instead of the empty bots list
            ctx.editMessageText('🤖 أهلا بك! ماذا تريد أن تفعل؟', Markup.inlineKeyboard([
                [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
                [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')]
            ]));
            
            // Disconnect from PM2
            pm2.disconnect();
        });
    });
});
// Populate userDeployments map - Fixed version
function populateUserDeployments() {
    Object.entries(activeBots).forEach(([botId, botInfo]) => {
        if (botInfo.createdBy) {
            userDeployments.set(botInfo.createdBy, botId);
        }
    });
    console.log(`Populated userDeployments map with ${userDeployments.size} entries`);
}

// Load existing bots on startup - Updated version
function loadExistingBots() {
    if (!fs.existsSync(BOTS_DIR)) return;
    
    const configFiles = fs.readdirSync(BOTS_DIR).filter(file => file.endsWith('_config.js'));
    
    const pm2 = require('pm2');
    
    pm2.connect((connectErr) => {
        if (connectErr) {
            console.error('Error connecting to PM2:', connectErr);
            return;
        }

        configFiles.forEach(file => {
            try {
                const configPath = path.join(BOTS_DIR, file);
                const config = require(configPath);
                const botId = config.botId;
                
                const botFilePath = path.join(BOTS_DIR, `bot_${botId}.js`);
                if (!fs.existsSync(botFilePath)) {
                    console.log(`Bot file not found for ${config.botUsername}. Skipping...`);
                    return;
                }
                
                // Check if the bot is already running
                pm2.describe(`bot_${botId}`, (describeErr, processDescription) => {
                    if (describeErr) {
                        console.error(`Error checking PM2 process for bot ${config.botUsername}:`, describeErr);
                        return;
                    }

                    if (processDescription && processDescription.length > 0) {
                        console.log(`Bot ${config.botUsername} is already running. Skipping start...`);
                        // Store bot details for running bot
                        activeBots[botId] = {
                            name: config.botName,
                            username: config.botUsername,
                            token: config.token,
                            expiry: config.expiryDate,
                            configPath: configPath,
                            botFilePath: botFilePath,
                            createdBy: config.createdBy // Make sure to include createdBy
                        };
                    } else {
                        // Start the bot using PM2
                        pm2.start({
                            script: botFilePath,
                            name: `bot_${botId}`,
                            autorestart: true,
                        }, (startErr) => {
                            if (startErr) {
                                console.error(`Failed to start bot ${config.botUsername}:`, startErr);
                                return;
                            }

                            // Store bot details
                            activeBots[botId] = {
                                name: config.botName,
                                username: config.botUsername,
                                token: config.token,
                                expiry: config.expiryDate,
                                configPath: configPath,
                                botFilePath: botFilePath,
                                createdBy: config.createdBy // Make sure to include createdBy
                            };
                            
                            console.log(`Loaded and started existing bot: @${config.botUsername}`);
                        });
                    }
                });
            } catch (error) {
                console.error(`Error loading bot from config file ${file}:`, error);
            }
        });
        
        // Call populateUserDeployments after all bots are loaded
        setTimeout(populateUserDeployments, 5000);
    });
}

async function checkAndUpdateActivation(cloneId, userId) {
    const clone = await Clone.findOne({ token: cloneId });
    
    if (!clone) {
      return { status: 'not_found', message: 'Bot not found.' };
    }
  
    const now = new Date();
  
    if (!clone.activatedAt || now > clone.expiresAt) {
      // Bot needs activation or reactivation
      clone.activatedAt = now;
      clone.expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      clone.isActive = true;
      await clone.save();
      return { status: 'activated', message: 'Bot activated for 30 days.' };
    } else {
      // Bot is already active
      const daysLeft = Math.ceil((clone.expiresAt - now) / (24 * 60 * 60 * 1000));
      return { status: 'active', message: `Bot is active. ${daysLeft} days left.` };
    }
  }
  async function createCloneDbEntry(botId, botToken, expiryDate) {
    const CloneModel = mongoose.model('Clone', new mongoose.Schema({
        botId: String,
        botToken: String,
        createdAt: Date,
        expiresAt: Date,
        statistics: {
            messagesProcessed: { type: Number, default: 0 },
            commandsExecuted: { type: Number, default: 0 },
        }
    }));

    const newClone = new CloneModel({
        botId,
        botToken,
        createdAt: new Date(),
        expiresAt: expiryDate,
    });

    await newClone.save();
    console.log(`Database entry created for bot ${botId}`);
}


const { createClonedDatabase, connectToMongoDB } = require('./database');

//Commands 










async function updateActiveGroups(bot) {
    setInterval(() => updateActiveGroups(bot), 24 * 60 * 60 * 1000);
    for (const [chatId, groupInfo] of activeGroups) {
        try {
            const chat = await bot.telegram.getChat(chatId);
            activeGroups.set(chatId, {
                title: chat.title,
                type: chat.type
            });
        } catch (error) {
            console.error(`Failed to update info for group ${chatId}:`, error);
            activeGroups.delete(chatId); // Remove the group if we can't get its info
        }
    }
}
async function getGroupIdsFromDatabase(botToken) {
    try {
        // Assuming you have a Group model
        const groups = await Group.find({ associatedBotToken: botToken }).distinct('groupId');
        return groups;
    } catch (error) {
        console.error('Error fetching group IDs:', error);
        return [];
    }
}
async function cloneBot(originalBotToken, newBotToken, ownerId) {
    const cloneId = uuidv4();
    const cloneName = `clone-${cloneId}`;
    const cloneDbName = `bot_${cloneId}_db`;

    // Create a new database for this clone
    await createClonedDatabase(cloneDbName);

    // Copy the original bot file
    exec(`cp bot.js ${cloneName}.js`, async (error) => {
        if (error) {
            console.error(`Error copying bot file: ${error}`);
            return;
        }

        // Replace the bot token, database name, and owner ID in the new file
        exec(`sed -i 's/const BOT_TOKEN = .*/const BOT_TOKEN = "${newBotToken}";/' ${cloneName}.js`, (error) => {
            if (error) {
                console.error(`Error replacing token: ${error}`);
                return;
            }

            exec(`sed -i 's/const DB_NAME = .*/const DB_NAME = "${cloneDbName}";/' ${cloneName}.js`, (error) => {
                if (error) {
                    console.error(`Error replacing database name: ${error}`);
                    return;
                }

                exec(`sed -i 's/const OWNER_ID = .*/const OWNER_ID = "${ownerId}";/' ${cloneName}.js`, (error) => {
                    if (error) {
                        console.error(`Error replacing owner ID: ${error}`);
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
        });
    });

    // Create a new database entry for the clone
    await createCloneDbEntry(cloneId, newBotToken, cloneDbName, ownerId);
}

async function createCloneDbEntry(botId, botToken, dbName, ownerId) {
    const db = await connectToMongoDB(dbName);
    const CloneModel = mongoose.model('Clone', new mongoose.Schema({
        botId: String,
        botToken: String,
        dbName: String,
        ownerId: String,
        createdAt: Date,
        expiresAt: Date,
        statistics: {
            messagesProcessed: { type: Number, default: 0 },
            commandsExecuted: { type: Number, default: 0 },
        }
    }));

    const newClone = new CloneModel({
        botId,
        botToken,
        dbName,
        ownerId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    });

    await newClone.save();
    console.log(`Database entry created for bot ${botId}`);
}
async function cleanupDatabase() {
    const CloneModel = mongoose.model('Clone');
    const activeBotIds = Object.keys(activeBots);
    
    try {
        const result = await CloneModel.deleteMany({ botId: { $nin: activeBotIds } });
        console.log(`Cleaned up ${result.deletedCount} inactive bot entries from the database.`);
    } catch (error) {
        console.error('Error cleaning up database:', error);
    }
}
async function addReplyToBotDatabase(botId, triggerWord, replyContent, replyType = 'text') {
    try {
        const dbName = `bot_${botId}_db`;
        const db = await connectToMongoDB(dbName);
        
        // Create a more comprehensive schema for replies
        const ReplyModel = db.model('Reply', new mongoose.Schema({
            bot_id: String,
            trigger_word: { type: String, lowercase: true, trim: true },
            type: { type: String, default: 'text' },
            content: String,
            created_at: { type: Date, default: Date.now },
            updated_at: { type: Date, default: Date.now }
        }));

        // Create a new reply with the bot_id included
        const newReply = new ReplyModel({
            bot_id: botId,
            trigger_word: triggerWord.toLowerCase().trim(),
            type: replyType,
            content: replyContent,
            created_at: new Date(),
            updated_at: new Date()
        });

        await newReply.save();
        console.log(`Reply added for bot ${botId}: "${triggerWord}" (${replyType})`);
        
        // Create an index on bot_id and trigger_word if it doesn't exist
        await db.collection('replies').createIndex({ bot_id: 1, trigger_word: 1 });
        
        return { success: true, message: 'Reply added successfully' };
    } catch (error) {
        console.error(`Error adding reply for bot ${botId}:`, error);
        return { success: false, message: 'Error adding reply', error: error.message };
    }
}
// Load existing bots on startup
// Load existing bots on startup
function loadExistingBots() {
    if (!fs.existsSync(BOTS_DIR)) return;
    
    const configFiles = fs.readdirSync(BOTS_DIR).filter(file => file.endsWith('_config.js'));
    
    const pm2 = require('pm2');
    
    pm2.connect((connectErr) => {
        if (connectErr) {
            console.error('Error connecting to PM2:', connectErr);
            return;
        }

        configFiles.forEach(file => {
            try {
                const configPath = path.join(BOTS_DIR, file);
                const config = require(configPath);
                const botId = config.botId;
                
                const botFilePath = path.join(BOTS_DIR, `bot_${botId}.js`);
                if (!fs.existsSync(botFilePath)) {
                    console.log(`Bot file not found for ${config.botUsername}. Skipping...`);
                    return;
                }
                
                // Check if the bot is already running
                pm2.describe(`bot_${botId}`, (describeErr, processDescription) => {
                    if (describeErr) {
                        console.error(`Error checking PM2 process for bot ${config.botUsername}:`, describeErr);
                        return;
                    }

                    if (processDescription && processDescription.length > 0) {
                        console.log(`Bot ${config.botUsername} is already running. Skipping start...`);
                        // Store bot details for running bot
                        activeBots[botId] = {
                            name: config.botName,
                            username: config.botUsername,
                            token: config.token,
                            expiry: config.expiryDate,
                            configPath: configPath,
                            botFilePath: botFilePath
                        };
                    } else {
                        // Start the bot using PM2
                        pm2.start({
                            script: botFilePath,
                            name: `bot_${botId}`,
                            autorestart: true,
                        }, (startErr) => {
                            if (startErr) {
                                console.error(`Failed to start bot ${config.botUsername}:`, startErr);
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
                            
                            console.log(`Loaded and started existing bot: @${config.botUsername}`);
                        });
                    }
                });
            } catch (error) {
                console.error(`Error loading bot from config file ${file}:`, error);
            }
        });
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
    
    // Stop the bot process using PM2
    const pm2 = require('pm2');
    pm2.delete(`bot_${botId}`, (err) => {
        if (err) {
            console.error(`Error stopping bot ${botInfo.username}:`, err);
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
        
        // Remove from database
        const CloneModel = mongoose.model('Clone');
        CloneModel.deleteOne({ botId: botId }).catch(error => {
            console.error(`Error removing bot ${botId} from database:`, error);
        });
        
        ctx.editMessageText(`✅ تم حذف البوت <b>${botInfo.name}</b> (@${botInfo.username}) بنجاح.`, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_back')]])
        });
    });
});
   // Remove user deployment
const userId = Object.keys(userDeployments).find(key => userDeployments.get(key) === botId);
if (userId) {
    userDeployments.delete(parseInt(userId));
}
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
    // Clean up the database
    cleanupDatabase();
});

// Clear the cache every hour
setInterval(() => {
    for (const userId in subscriptionCache) {
        delete subscriptionCache[userId];
    }
}, 3600000); // 1 hour in milliseconds
// Start the bot
bot.launch().then(() => {
    console.log('✅ Clone Manager Bot is running...');
});

// Enable graceful stop
// Enable graceful stop
process.once('SIGINT', () => {
    // Stop all bot processes using PM2
    const pm2 = require('pm2');
    pm2.connect((err) => {
        if (err) {
            console.error('Error connecting to PM2:', err);
            bot.stop('SIGINT');
            process.exit(0);
            return;
        }
        
        // Get all running processes
        pm2.list((err, list) => {
            if (err) {
                console.error('Error getting PM2 process list:', err);
                bot.stop('SIGINT');
                process.exit(0);
                return;
            }
            
            // Filter bot processes
            const botProcesses = list.filter(proc => proc.name.startsWith('bot_'));
            
            if (botProcesses.length === 0) {
                bot.stop('SIGINT');
                process.exit(0);
                return;
            }
            
            // Stop each bot process
            let stoppedCount = 0;
            botProcesses.forEach(proc => {
                pm2.delete(proc.name, () => {
                    stoppedCount++;
                    if (stoppedCount === botProcesses.length) {
                        bot.stop('SIGINT');
                        process.exit(0);
                    }
                });
            });
        });
    });
});
process.once('SIGTERM', () => {
    // Stop all bot processes using PM2
    const pm2 = require('pm2');
    pm2.connect((err) => {
        if (err) {
            console.error('Error connecting to PM2:', err);
            bot.stop('SIGTERM');
            process.exit(0);
            return;
        }
        
        // Get all running processes
        pm2.list((err, list) => {
            if (err) {
                console.error('Error getting PM2 process list:', err);
                bot.stop('SIGTERM');
                process.exit(0);
                return;
            }
            
            // Filter bot processes
            const botProcesses = list.filter(proc => proc.name.startsWith('bot_'));
            
            if (botProcesses.length === 0) {
                bot.stop('SIGTERM');
                process.exit(0);
                return;
            }
            
            // Stop each bot process
            let stoppedCount = 0;
            botProcesses.forEach(proc => {
                pm2.delete(proc.name, () => {
                    stoppedCount++;
                    if (stoppedCount === botProcesses.length) {
                        bot.stop('SIGTERM');
                        process.exit(0);
                    }
                });
            });
        });
    });
});
