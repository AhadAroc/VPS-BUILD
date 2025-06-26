require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const database = require('./database');
const { fork } = require('child_process');
const { exec } = require('child_process');
const { execSync } = require('child_process');
const { MongoClient } = require('mongodb');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
// Add this at the top of your file
const subscriptionCache = {};
const mongoURI = process.env.MONGODB_URI;
// Store user deployments
const userDeployments = new Map();
let mongooseConnection = null;
//const Heroku = require('heroku-client');
const mongoose = require('mongoose');
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  ssl: true,
  tls: true,
  tlsAllowInvalidCertificates: false,
  connectTimeoutMS: 30000, // 30 seconds timeout
  socketTimeoutMS: 45000   // 45 seconds timeout
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  // Implement a fallback or retry mechanism here
  console.log('Attempting to continue without MongoDB connection...');
});
const activeGroups = new Map();
// Add this at the top of your file with other imports
const crypto = require('crypto');
// Heroku API key
//const HEROKU_API_KEY = 'HRKU-f72294ab-1a52-467d-a9ef-1405ecb9345d';
//const heroku = new Heroku({ token: HEROKU_API_KEY });
// Add this near the top of your file with other constants
const MAX_BOTS_PER_USER = 1;  // Maximum bots per user
const MAX_TOTAL_BOTS = 10;    // Maximum total bots on the server
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
const premiumUserSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  notified: { type: Boolean, default: false }
});

const PremiumUser = mongoose.model('PremiumUser', premiumUserSchema);


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

app.get('/', (req, res) => {
    res.send('Protection Bot Manager is running!');
});
async function getMongooseConnection() {
  if (mongooseConnection && mongooseConnection.readyState === 1) {
    return mongooseConnection;
  }
  
  try {
    console.log('📡 Setting up new MongoDB connection...');
    
    // Close any existing connection first
    if (mongooseConnection) {
      console.log('♻️ Closing existing mongoose connection...');
      await mongoose.connection.close();
    }
    
    // Connect with proper options
    mongooseConnection = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      ssl: true,
      tls: true,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000
    });
    
    console.log('✅ Connected to MongoDB successfully');
    return mongooseConnection;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    throw err;
  }
}
// Your existing bot code
bot.start((ctx) => {
    ctx.reply('🤖 أهلا بك! في بوت الصانع , يرجى الضغط على التعليمات لمعرفة طريقة الصنع واشياء اخرى.', Markup.inlineKeyboard([
        [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
        [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')],
        [Markup.button.callback('ℹ️ معلومات', 'show_info')] // Add the Info button
    ]));
});
// Handle "Info" button action
bot.action('show_info', (ctx) => {
    ctx.reply('ℹ️ *معلومات حول كيفية الاستنساخ:*\n\n' +
              '1. احصل على التوكن من @BotFather.\n' +
              '2. اضغط على "إنشاء بوت جديد" وأرسل التوكن.\n' +
              '3. سيتم إنشاء البوت الخاص بك ويمكنك إدارته من خلال الخيارات المتاحة.\n' +
              '4.يمكنك انشاء بوت واحد فقط\n\n' +
              'لأي استفسارات إضافية، يرجى التواصل مع الدعم.', { parse_mode: 'Markdown' });
});
// Handle "Create Bot" option
bot.action('create_bot', (ctx) => {
    ctx.reply('🆕 لإنشاء بوت جديد، أرسل **التوكن** الذي حصلت عليه من @BotFather.', Markup.inlineKeyboard([
        [Markup.button.callback('🔙 العودة إلى البداية', 'back_to_start')]
    ]));
});
// Handle "Back to Start" button action
bot.action('back_to_start', (ctx) => {
    ctx.reply('🤖 أهلا بك! في بوت الصانع , يرجى الضغط على التعليمات لمعرفة طريقة الصنع واشياء اخرى.', Markup.inlineKeyboard([
        [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
        [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')],
        [Markup.button.callback('ℹ️ معلومات', 'show_info')]
    ]));
});
// Save groups to database when bot is added
// Handle bot added/removed from group (more reliable than just new_chat_members)
// Save groups when bot is added or removed
bot.on('my_chat_member', async (ctx) => {
    const botInfo = await ctx.telegram.getMe();
    const status = ctx.myChatMember.new_chat_member.status;
    const chatId = ctx.chat.id;
    const chatTitle = ctx.chat.title || 'Unknown';

    const db = await database.setupDatabase();

    // 🔒 LOCKED IN: Fetch this bot's info from its own 'bot_info' entry
    const botMeta = await db.collection('groups').findOne({
        type: 'bot_info',
        bot_id: botInfo.id
    });

    if (!botMeta) {
        console.warn(`⚠️ No bot_info found for bot_id ${botInfo.id}`);
        return;
    }

    // 🔁 Update all group records with bot_id === null to use this bot's info
    const fixResult = await db.collection('groups').updateMany(
        { bot_id: null },
        {
            $set: {
                bot_id: botMeta.bot_id,
                bot_name: botMeta.bot_name,
                bot_username: botMeta.bot_username,
                bot_token: botMeta.bot_token
            }
        }
    );

    if (fixResult.modifiedCount > 0) {
        console.log(`🔧 Fixed ${fixResult.modifiedCount} group(s) with missing bot_id using ${botMeta.bot_username}`);
    }

    // 🧠 Then handle the current event group save
    if (status === 'member' || status === 'administrator') {
        await db.collection('groups').updateOne(
            { group_id: chatId },
            {
                $set: {
                    group_id: chatId,
                    title: chatTitle,
                    is_active: true,
                    bot_id: botMeta.bot_id,
                    bot_username: botMeta.bot_username,
                    bot_name: botMeta.bot_name,
                    updated_at: new Date()
                },
                $setOnInsert: {
                    added_at: new Date()
                }
            },
            { upsert: true }
        );
        console.log(`✅ Group saved: '${chatTitle}' (${chatId}) by @${botMeta.bot_username}`);
    }

    if (status === 'left' || status === 'kicked') {
        await db.collection('groups').updateOne(
            { group_id: chatId },
            { $set: { is_active: false, updated_at: new Date() } }
        );
        console.log(`🚪 Bot left/kicked from '${chatTitle}' (${chatId}) — marked inactive`);
    }
});
bot.command('add', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("⛔ الأمر فقط للمالك.");

  if (!ctx.message || !ctx.message.text) {
    return ctx.reply("❌ لا يمكن قراءة الأمر. حاول مرة أخرى.");
  }

  const args = ctx.message.text.trim().split(" ");
  const identifier = args[1];
  const dateStr = args[2];

  if (!identifier || !dateStr) {
    return ctx.reply("❌ الصيغة: /add @username أو userId YYYY-MM-DD");
  }

  // Validate date
  const expiresAt = new Date(`${dateStr}T23:59:59Z`);
  if (isNaN(expiresAt.getTime())) {
    return ctx.reply("❌ التاريخ غير صالح. استخدم الصيغة: YYYY-MM-DD");
  }

  let userId;

  try {
    if (/^\d+$/.test(identifier)) {
      // Raw numeric ID
      userId = parseInt(identifier);
    } else if (identifier.startsWith("@")) {
      try {
        const user = await ctx.telegram.getChat(identifier);
        userId = user.id;
      } catch (error) {
        console.error("getChat error:", error.message);
        return ctx.reply("❌ لم أتمكن من العثور على المستخدم. هل تحدث مع البوت؟");
      }
    } else {
      return ctx.reply("❌ يرجى إدخال @username أو userId بشكل صحيح.");
    }

    // ✅ Use Mongoose model (not raw .collection())
    await PremiumUser.updateOne(
      { userId },
      { $set: { userId, expiresAt, notified: false } },
      { upsert: true }
    );

    return ctx.reply(`✅ تم منح الصلاحية المميزة للمستخدم (${userId}) حتى ${dateStr}`);
  } catch (err) {
    console.error("❌ Error in /add:", err.message);
    return ctx.reply("❌ حدث خطأ أثناء الحفظ أو المعالجة.");
  }
});


bot.command('revoke', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("⛔ الأمر فقط للمالك.");

  const args = ctx.message.text.split(" ");
  if (args.length !== 2) return ctx.reply("❌ الصيغة: /revoke @username أو userId");

  const identifier = args[1];
  let userId;

  try {
    if (/^\d+$/.test(identifier)) {
      // Raw numeric ID
      userId = parseInt(identifier);
    } else if (identifier.startsWith("@")) {
      try {
        const user = await ctx.telegram.getChat(identifier);
        userId = user.id;
      } catch (error) {
        console.error("getChat error:", error.message);
        return ctx.reply("❌ لم أتمكن من العثور على المستخدم. هل تحدث مع البوت؟");
      }
    } else {
      return ctx.reply("❌ يرجى إدخال @username أو userId بشكل صحيح.");
    }

    // Check if user has premium status
    const premiumUser = await PremiumUser.findOne({ userId });
    
    if (!premiumUser) {
      return ctx.reply(`⚠️ المستخدم (${userId}) ليس لديه اشتراك مميز.`);
    }

    // Delete the premium user record
    await PremiumUser.deleteOne({ userId });
    
    // Update all related collections to remove premium status
    const db = await database.setupDatabase();
    
    // 1. Remove from VIP users collection if they exist there
    await db.collection('vip_users').deleteMany({ user_id: userId });
    
    // 2. Remove from important_users collection if they exist there
    await db.collection('important_users').deleteMany({ user_id: userId });
    
    // 3. Update any other collections that might store premium status
    // For example, if you have a user_roles or permissions collection
    await db.collection('user_roles').updateMany(
      { user_id: userId },
      { $pull: { roles: "premium" } }
    );
    
    // 4. Clear any cached premium status
    if (subscriptionCache && subscriptionCache[userId]) {
      delete subscriptionCache[userId];
    }
    
    // Try to notify the user that their premium status has been revoked
    try {
      await ctx.telegram.sendMessage(userId, '⚠️ تم إلغاء صلاحيتك المميزة. للاستفسار راسل المطور.');
    } catch (notifyError) {
      console.log(`Could not notify user ${userId} about revocation: ${notifyError.message}`);
    }

    return ctx.reply(`✅ تم إلغاء الصلاحية المميزة للمستخدم (${userId}) بنجاح وإزالة جميع الامتيازات المرتبطة.`);
  } catch (err) {
    console.error("❌ Error in /revoke:", err.message);
    return ctx.reply("✅تم الغاء الصلاحية يرجى استخدام /premium_users للتأكد");
  }
});

// Add a command to list all premium users
bot.command('premium_users', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply("⛔ الأمر فقط للمالك.");

  try {
    const premiumUsers = await PremiumUser.find({}).sort({ expiresAt: 1 });
    
    if (premiumUsers.length === 0) {
      return ctx.reply("📊 لا يوجد مستخدمين مميزين حالياً.");
    }

    let message = "📊 *قائمة المستخدمين المميزين:*\n\n";
    
    for (const user of premiumUsers) {
      const expiryDate = new Date(user.expiresAt).toLocaleDateString('ar-EG');
      const isExpired = new Date(user.expiresAt) < new Date();
      const status = isExpired ? "🔴 منتهي" : "🟢 نشط";
      
      // Try to get user info
      let username = "غير معروف";
      try {
        const userInfo = await ctx.telegram.getChat(user.userId);
        username = userInfo.username ? `@${userInfo.username}` : userInfo.first_name || "غير معروف";
      } catch (error) {
        console.log(`Could not fetch info for user ${user.userId}: ${error.message}`);
      }
      
      message += `👤 *المستخدم:* ${username} (${user.userId})\n`;
      message += `📅 *تاريخ الانتهاء:* ${expiryDate}\n`;
      message += `⚡ *الحالة:* ${status}\n\n`;
    }
    
    message += "ℹ️ استخدم `/revoke معرف_المستخدم` لإلغاء الصلاحية المميزة.";
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error("❌ Error in /premium_users:", err.message);
    return ctx.reply("❌ حدث خطأ أثناء جلب قائمة المستخدمين المميزين.");
  }
});
bot.command('check_premium', async (ctx) => {
  const args = ctx.message.text.split(" ");
  let userId;
  
  if (args.length === 2) {
    // Check another user (admin only)
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.reply("⛔ فقط المالك يمكنه التحقق من حالة المستخدمين الآخرين.");
    }
    
    const identifier = args[1];
    if (/^\d+$/.test(identifier)) {
      userId = parseInt(identifier);
    } else if (identifier.startsWith("@")) {
      try {
        const user = await ctx.telegram.getChat(identifier);
        userId = user.id;
      } catch (error) {
        return ctx.reply("❌ لم أتمكن من العثور على المستخدم.");
      }
    } else {
      return ctx.reply("❌ يرجى إدخال @username أو userId بشكل صحيح.");
    }
  } else {
    // Check own status
    userId = ctx.from.id;
  }
  
  try {
    // Check premium status directly from database
    const premiumUser = await PremiumUser.findOne({ userId });
    
    // Check VIP status
    const db = await database.setupDatabase();
    const vipUser = await db.collection('vip_users').findOne({ user_id: userId });
    
    // Check important status
    const importantUser = await db.collection('important_users').findOne({ user_id: userId });
    
    if (!premiumUser && !vipUser && !importantUser) {
      return ctx.reply(`المستخدم (${userId}) ليس لديه أي صلاحيات مميزة.`);
    }
    
    let message = `📊 *حالة المستخدم (${userId}):*\n\n`;
    
    if (premiumUser) {
      const expiryDate = new Date(premiumUser.expiresAt).toLocaleDateString('ar-EG');
      const isExpired = new Date(premiumUser.expiresAt) < new Date();
      const status = isExpired ? "🔴 منتهي" : "🟢 نشط";
      
      message += `🌟 *اشتراك مميز:* ${status}\n`;
      message += `📅 *تاريخ الانتهاء:* ${expiryDate}\n\n`;
    }
    
    if (vipUser) {
      message += `👑 *مستخدم VIP:* نعم\n`;
    }
    
    if (importantUser) {
      message += `⭐ *مستخدم مهم:* نعم\n`;
    }
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error("❌ Error in /check_premium:", err.message);
    return ctx.reply("❌ حدث خطأ أثناء التحقق من الصلاحيات.");
  }
});
async function saveFile(fileLink, fileName) {
    try {
        const mediaDir = path.join(__dirname, 'media');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        const timestamp = Date.now();
        const fileExtension = path.extname(fileName);
        const fileNameWithoutExt = path.basename(fileName, fileExtension);
        const newFileName = `${fileNameWithoutExt}_${timestamp}${fileExtension}`;

        const filePath = path.join(mediaDir, newFileName);

        const response = await axios({
            method: 'GET',
            url: fileLink.toString(),
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve({ filePath, fileName: newFileName }));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error(`Error in saveFile function:`, error);
        throw error;
    }
}
async function downloadAndSendPhoto(ctx, fileId, botToken, chatId, caption, tempBot) {
    try {
        // 1. Get the file path from Telegram
        const fileInfo = await ctx.telegram.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.file_path}`;

        // 2. Download and save locally
        const fileName = `photo_${Date.now()}.jpg`;
        const filePath = path.join(__dirname, fileName);
        const writer = fs.createWriteStream(filePath);

        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream'
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 3. Send from disk
        await tempBot.telegram.sendPhoto(chatId, { source: fs.createReadStream(filePath) }, {
            caption
        });

        // 4. Clean up the file
        fs.unlink(filePath, () => {});
        return true;

    } catch (err) {
        console.error(`❌ Error in downloadAndSendPhoto:`, err.message);
        return false;
    }
}
async function downloadTelegramFile(fileId, botToken, ext = 'jpg') {
    try {
        const fileInfoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
        const fileInfoRes = await axios.get(fileInfoUrl);
        if (!fileInfoRes.data.ok) throw new Error('Failed to get file info');

        const filePath = fileInfoRes.data.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
        const fileName = `temp_${Date.now()}.${ext}`;
        const localPath = path.join(__dirname, fileName);

        const writer = fs.createWriteStream(localPath);
        const streamRes = await axios({ url: fileUrl, method: 'GET', responseType: 'stream' });
        streamRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        return localPath;
    } catch (err) {
        console.error('❌ downloadTelegramFile error:', err.message);
        return null;
    }
}
// Downloads Telegram file and saves locally using saveFile
async function downloadAndSaveTelegramFile(fileId, botToken) {
    try {
        const fileInfoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
        const fileInfoRes = await axios.get(fileInfoUrl);
        if (!fileInfoRes.data.ok) throw new Error('Failed to get file info');

        const telegramFilePath = fileInfoRes.data.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${telegramFilePath}`;
        const originalFileName = telegramFilePath.split('/').pop();

        return await saveFile(fileUrl, originalFileName);
    } catch (err) {
        console.error('❌ downloadAndSaveTelegramFile error:', err.message);
        return null;
    }
}

async function insertDeveloperToTestDB({ userId, username, botId, chatId }) {
  try {
    // Use the MongoClient directly instead of mongoose for this operation
    const client = new MongoClient(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      ssl: true,
      tls: true
    });
    
    await client.connect();
    console.log('✅ Connected to MongoDB for developer insertion');
    
    const db = client.db('test'); // Use the test database explicitly
    
    const result = await db.collection('developers').updateOne(
      { user_id: userId, bot_id: botId },
      {
        $set: {
          user_id: userId,
          username: username || null,
          bot_id: botId,
          promoted_at: new Date(),
          promoted_by: 'auto-clone',
          chat_id: chatId
        }
      },
      { upsert: true }
    );
    
    console.log('✅ Developer entry inserted into test.developers:', result.upsertedId || 'updated existing');
    await client.close();
    return true;
  } catch (err) {
    console.error('❌ Failed to insert developer into test DB:', err);
    return false;
  }
}

// Mark groups inactive when bot is removed
bot.on('left_chat_member', async (ctx) => {
    if (!ctx.message.left_chat_member) return;

    const leftMemberId = ctx.message.left_chat_member.id;
    const botInfo = await ctx.telegram.getMe();

    if (leftMemberId === botInfo.id) {
        const db = await ensureDatabaseInitialized('test');

        await db.collection('groups').updateOne(
            { group_id: ctx.chat.id, bot_id: config.botId },
            { $set: { is_active: false } }
        );

        console.log(`🚪 [@${botInfo.username}] Left group '${ctx.chat.title}' (${ctx.chat.id}) — marked inactive for bot_id ${config.botId}`);
    }
});

function extractBroadcastContent(ctx) {
    const msg = ctx.message;

    if (msg.text && msg.text.startsWith('/broadcast')) {
        const textParts = msg.text.split(' ').slice(1);
        if (textParts.length === 0) return null;
        return { type: 'text', content: textParts.join(' ') };
    }

    if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const caption = msg.caption || '';
        return { type: 'photo', content: { file_id: fileId, caption } };
    }

    if (msg.document) {
        return { type: 'document', content: { file_id: msg.document.file_id, caption: msg.caption || '' } };
    }

    if (msg.video) {
        return { type: 'video', content: { file_id: msg.video.file_id, caption: msg.caption || '' } };
    }

    return null;
}

// Handle token submission
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const userId = ctx.from.id;

    // Check if it's a broadcast command
    if (text.startsWith('/broadcast_')) {
        if (userId !== ADMIN_ID) {
            return ctx.reply('⛔ This command is only available to the admin.');
        }
        
        const [command, ...messageParts] = text.split(' ');
        const broadcastType = command.split('_')[1];
        const broadcastMessage = messageParts.join(' ');

        if (!broadcastMessage) {
            return ctx.reply('Please provide a message to broadcast. Usage: /broadcast_<type> <your message>');
        }

        switch (broadcastType) {
            case 'dm':
                return handleBroadcastDM(ctx, broadcastMessage);
            case 'groups':
                return handleBroadcastGroups(ctx, broadcastMessage);
            case 'all':
                return handleBroadcastAll(ctx, broadcastMessage);
            default:
                return ctx.reply('Invalid broadcast command. Use /broadcast_dm, /broadcast_groups, or /broadcast_all');
        }
    }
// Check total bot limit
    const totalActiveBots = Object.keys(activeBots).length;
    if (totalActiveBots >= MAX_TOTAL_BOTS) {
        return ctx.reply('⚠️ عذراً، تم الوصول إلى الحد الأقصى للبوتات على الخادم. يرجى المحاولة لاحقاً.');
    }

    // If not a broadcast command, treat as token submission
    const token = text;

    // Check if user already has a deployed bot
    if (userDeployments.has(userId)) {
        return ctx.reply('❌ عذراً، يمكنك تنصيب بوت واحد فقط في الوقت الحالي.');
    }

    // Validate token format
    if (!token.match(/^\d+:[A-Za-z0-9_-]{35,}$/)) {
        return ctx.reply('❌ التوكن غير صالح. يرجى إدخال توكن صحيح.');
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

            const userId = ctx.from.id;
const username = ctx.from.username || null;
const chatId = ctx.chat.id;

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
    }, async (err) => {
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
            createdBy: userId
        };

        userDeployments.set(userId, botInfo.id);

        // Create database entry
        createCloneDbEntry(botInfo.id, token, expiryDate);

        // ✅ Assign user as "مطور اساسي"
        try {
            const client = await MongoClient.connect(process.env.MONGO_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });

            const db = client.db('test'); // ✅ connect directly to the test DB

            await db.collection('developers').updateOne(
                { user_id: userId, bot_id: botInfo.id },
                {
                    $set: {
                        user_id: userId,
                        username: username,
                        bot_id: botInfo.id,
                        promoted_at: new Date(),
                        promoted_by: 'auto-clone',
                        chat_id: chatId
                    }
                },
                { upsert: true }
            );

            console.log(`👑 User ${userId} (@${username}) assigned as مطور اساسي.`);
            await client.close();
        } catch (err) {
            console.error('❌ Failed to assign developer role to test DB:', err.message);
        }

        // Store bot information in groups collection
        storeGroupInfo(botInfo.id, botInfo.first_name, botInfo.username, token, userId);

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
// At the top of your file, after initializing the bot
bot.command('broadcast_dm', handleBroadcastDM);
bot.command('broadcast_groups', handleBroadcastGroups);
bot.command('broadcast_all', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('⛔ This command is only available to the admin.');
    }

    const message = ctx.message.text.split(' ').slice(1).join(' ');
    if (!message) {
        return ctx.reply('Please provide a message to broadcast.');
    }

    try {
        const db = await ensureDatabaseInitialized('test');
        await db.collection('broadcast_triggers').insertOne({
            triggered: true,
            message: message,
            type: 'all',
            createdAt: new Date()
        });

        ctx.reply('Broadcast triggered. It will be sent shortly across all bots.');
    } catch (error) {
        console.error('Error triggering broadcast:', error);
        ctx.reply('An error occurred while triggering the broadcast.');
    }
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
    ctx.editMessageText('🤖 أهلا بك! في بوت الصانع , يرجى الضغط على التعليمات لمعرفة طريقة الصنع واشياء اخرى.', Markup.inlineKeyboard([
        [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
        [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')],
        [Markup.button.callback('ℹ️ معلومات', 'show_info')] // Add the Info button
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
            ctx.editMessageText('🤖 أهلا بك! في بوت الصانع , يرجى الضغط على التعليمات لمعرفة طريقة الصنع واشياء اخرى.', Markup.inlineKeyboard([
                [Markup.button.callback('• إنشاء بوت جديد •', 'create_bot')],
                [Markup.button.callback('• عرض البوتات النشطة •', 'show_active_bots')],
                [Markup.button.callback('ℹ️ معلومات', 'show_info')] // Add the Info button
            ]));
            
            // Disconnect from PM2
            pm2.disconnect();
        });
    });
});

bot.on('message', async (ctx) => {
    const msg = ctx.message;

    // Only admins can use broadcast
    if (ctx.from.id !== ADMIN_ID) return;

    // Check if the caption or text starts with a broadcast command
    const rawText = msg.caption || msg.text || '';
    if (!rawText.startsWith('/broadcast_')) return;

    // Extract the command and the actual message
    const [cmd, ...messageParts] = rawText.split(' ');
    const message = messageParts.join(' ');

    if (!message) {
        return ctx.reply('❌ Please provide a message to broadcast.');
    }

    const broadcast = extractBroadcastContent(ctx);
    if (!broadcast) return ctx.reply('❌ Please provide a message, photo, or video to broadcast.');

    if (cmd === '/broadcast_groups') {
        return handleBroadcastGroups(ctx, message);
    } else if (cmd === '/broadcast_dm') {
        return handleBroadcastDM(ctx, message);
    } else if (cmd === '/broadcast_all') {
        return handleBroadcastAll(ctx, message);
    } else {
        return ctx.reply('❌ Unknown broadcast command.');
    }
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
// Store bot information in groups collection
async function storeGroupInfo(botId, botName, botUsername, botToken, ownerId) {
  try {
    // Use the database module's setupDatabase function which should handle connections properly
    const db = await database.setupDatabase();
    
    // Store bot info in the groups collection
    await db.collection('groups').updateOne(
      { type: 'bot_info', bot_id: botId },
      {
        $set: {
          type: 'bot_info',
          bot_id: botId,
          bot_name: botName,
          bot_username: botUsername,
          bot_token: botToken,
          owner_id: ownerId,
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );
    
    console.log(`✅ Bot info stored for @${botUsername} (ID: ${botId})`);
    return true;
  } catch (err) {
    console.error('❌ Failed to store bot info:', err);
    return false;
  }
}
async function ensureDatabaseInitialized(databaseName = 'test') {
    let db = database.getDb();
    if (!db) {
        console.log(`Database not initialized, connecting to '${databaseName}' now...`);
        db = await database.connectToMongoDB(databaseName);
    }
    return db;
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



// Then define these handler functions:
// Implement broadcast handlers
async function handleBroadcastGroups(ctx) {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('⛔ This command is only available to the admin.');
    }

    const broadcast = extractBroadcastContent(ctx);
    if (!broadcast) {
        return ctx.reply('❌ Please provide a message, photo, or video to broadcast.');
    }

    await ctx.reply('⏳ Broadcasting to groups... please wait.');

    const db = await connectToMongoDB('test');
    const groups = await db.collection('groups').find({ is_active: true }).toArray();
    if (groups.length === 0) {
        return ctx.reply('⚠️ No groups found to broadcast to.');
    }

    // Download and save the media file once if it's not a text message
    let savedFilePath = null;
    let fileType = null;
    
    if (broadcast.type !== 'text') {
        const botToken = ctx.telegram.token;
        const fileId = broadcast.content.file_id;
        
        // Determine file extension based on type
        const ext = 
            broadcast.type === 'photo' ? 'jpg' :
            broadcast.type === 'video' ? 'mp4' :
            broadcast.type === 'document' ? 'pdf' : 'dat';
        
        fileType = broadcast.type;
        
        // Download the file to server
        savedFilePath = await downloadTelegramFile(fileId, botToken, ext);
        
        if (!savedFilePath) {
            return ctx.reply('❌ Failed to download media file. Broadcast canceled.');
        }
        
        console.log(`✅ Media file saved to: ${savedFilePath}`);
    }

    let successCount = 0;
    let failCount = 0;

    for (const group of groups) {
        try {
            let botId = group.bot_id;

            // Fallback to first available bot
            if (!botId || isNaN(botId)) {
                const fallbackBot = await db.collection('groups').findOne({ type: 'bot_info', is_active: true });
                if (!fallbackBot) {
                    console.warn(`⚠️ No fallback bot found for group ${group.group_id}`);
                    failCount++;
                    continue;
                }
                botId = fallbackBot.bot_id;
                group.bot_token = fallbackBot.bot_token;
                group.bot_username = fallbackBot.bot_username;
            }

            const tempBot = new Telegraf(group.bot_token);

            if (broadcast.type === 'text') {
                await tempBot.telegram.sendMessage(group.group_id, broadcast.content);
            } else {
                // Send the saved file from the server
                const mediaOptions = { caption: broadcast.content.caption || '' };
                const fileStream = { source: fs.createReadStream(savedFilePath) };
                
                if (fileType === 'photo') {
                    await tempBot.telegram.sendPhoto(group.group_id, fileStream, mediaOptions);
                } else if (fileType === 'video') {
                    await tempBot.telegram.sendVideo(group.group_id, fileStream, mediaOptions);
                } else if (fileType === 'document') {
                    await tempBot.telegram.sendDocument(group.group_id, fileStream, mediaOptions);
                }
            }

            console.log(`✅ Message sent to ${group.title} (${group.group_id}) via @${group.bot_username}`);
            tempBot.stop();
            successCount++;
        } catch (err) {
            console.error(`❌ Failed to send to ${group.title || 'Unknown'} (${group.group_id}):`, err.message);
            failCount++;
        }
    }

    // Keep the file on the server (don't delete it)
    // If you want to delete it after broadcasting, uncomment the following:
     if (savedFilePath) {
         fs.unlink(savedFilePath, (err) => {
           if (err) console.error('Failed to delete temp file:', err);
        });
     }

    ctx.reply(`📢 Broadcast completed.\n\n✅ Successful: ${successCount}\n❌ Failed: ${failCount}\n📊 Total Groups: ${groups.length}`);
}

async function handleBroadcastAll(ctx) {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('⛔ This command is only available to the admin.');
    }
    const message = ctx.message.text.split(' ').slice(1).join(' ');
    if (!message) {
        return ctx.reply('Please provide a message to broadcast.');
    }
    await handleBroadcast(ctx, 'all', message);
}
async function handleBroadcastDM(ctx) {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('⛔ This command is only available to the admin.');
    }

    const broadcast = extractBroadcastContent(ctx);
    if (!broadcast) {
        return ctx.reply('❌ Please provide a message, photo, or video to broadcast.');
    }

    await ctx.reply('⏳ Broadcasting to direct messages... please wait.');

    try {
        const db = await ensureDatabaseInitialized('test');
        const users = await db.collection('users').find().toArray();
        if (users.length === 0) {
            return ctx.reply('⚠️ No users found in the database.');
        }

        // Download and save the media file once if it's not a text message
        let savedFilePath = null;
        let fileType = null;
        
        if (broadcast.type !== 'text') {
            const botToken = ctx.telegram.token;
            const fileId = broadcast.content.file_id;
            
            // Determine file extension based on type
            const ext = 
                broadcast.type === 'photo' ? 'jpg' :
                broadcast.type === 'video' ? 'mp4' :
                broadcast.type === 'document' ? 'pdf' : 'dat';
            
            fileType = broadcast.type;
            
            // Download the file to server
            savedFilePath = await downloadTelegramFile(fileId, botToken, ext);
            
            if (!savedFilePath) {
                return ctx.reply('❌ Failed to download media file. Broadcast canceled.');
            }
            
            console.log(`✅ Media file saved to: ${savedFilePath}`);
        }

        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
            try {
                let botToken;
                let botUsername;

                // Try to get user's assigned bot_id
                const groupEntry = await db.collection('groups').findOne({
                    owner_id: user.user_id,
                    type: 'bot_info'
                });

                if (groupEntry && groupEntry.bot_token) {
                    botToken = groupEntry.bot_token;
                    botUsername = groupEntry.bot_username;
                } else {
                    // Fallback to any available bot_info
                    const fallbackBot = await db.collection('groups').findOne({ type: 'bot_info', is_active: true });
                    if (!fallbackBot) {
                        console.warn(`⚠️ No bot token found for user ${user.user_id}`);
                        failCount++;
                        continue;
                    }

                    botToken = fallbackBot.bot_token;
                    botUsername = fallbackBot.bot_username;
                }

                // Send via the correct bot
                const tempBot = new Telegraf(botToken);

                if (broadcast.type === 'text') {
                    await tempBot.telegram.sendMessage(user.user_id, broadcast.content);
                } else {
                    // Send the saved file from the server
                    const mediaOptions = { caption: broadcast.content.caption || '' };
                    const fileStream = { source: fs.createReadStream(savedFilePath) };
                    
                    if (fileType === 'photo') {
                        await tempBot.telegram.sendPhoto(user.user_id, fileStream, mediaOptions);
                    } else if (fileType === 'video') {
                        await tempBot.telegram.sendVideo(user.user_id, fileStream, mediaOptions);
                    } else if (fileType === 'document') {
                        await tempBot.telegram.sendDocument(user.user_id, fileStream, mediaOptions);
                    }
                }

                console.log(`✅ DM sent to user ${user.user_id} via @${botUsername}`);
                tempBot.stop();
                successCount++;
            } catch (err) {
                console.error(`❌ Failed DM to ${user.user_id}:`, err.description || err);
                failCount++;
            }
        }

        // Clean up the saved file after broadcasting
        if (savedFilePath) {
            fs.unlink(savedFilePath, (err) => {
                if (err) console.error('Failed to delete temp file:', err);
            });
        }

        ctx.reply(`📢 DM broadcast completed.\n\n✅ Successful: ${successCount}\n❌ Failed: ${failCount}\n📊 Total Users: ${users.length}`);
    } catch (error) {
        console.error('Error during DM broadcast:', error);
        ctx.reply('An error occurred while broadcasting to direct messages.');
    }
}

async function getUserIdsFromDatabase(botToken) {
    try {
        const CloneModel = mongoose.model('Clone');
        const clone = await CloneModel.findOne({ botToken });
        if (!clone) {
            console.error(`No clone found for bot token: ${botToken}`);
            return [];
        }
        const db = await connectToMongoDB(clone.dbName);
        const User = db.model('User');
        const users = await User.find().distinct('userId');
        return users;
    } catch (error) {
        console.error('Error fetching user IDs:', error);
        return [];
    }
}

async function getGroupIdsFromDatabase(botToken) {
    try {
        const CloneModel = mongoose.model('Clone');
        const clone = await CloneModel.findOne({ botToken });
        if (!clone) {
            console.error(`No clone found for bot token: ${botToken}`);
            return [];
        }
        const db = await connectToMongoDB(clone.dbName);
        const Group = db.model('Group');
        const groups = await Group.find().distinct('groupId');
        return groups;
    } catch (error) {
        console.error('Error fetching group IDs:', error);
        return [];
    }
}

async function getBotGroups(botId) {
    const { ensureDatabaseInitialized } = require('./database'); // make sure this is accessible
    try {
        const db = await ensureDatabaseInitialized('test');
        const groups = await db.collection('groups').find({ 
            is_active: true,
            bot_id: botId
        }).toArray();

        console.log(`Bot ${botId} has ${groups.length} active groups`);
        return groups;
    } catch (error) {
        console.error('Error fetching bot groups:', error);
        return [];
    }
}

async function handleBroadcast(ctx, type, message) {
    const { getDatabaseForBot } = require('./database');
const db = await getDatabaseForBot('test');   // FOR BROADCAST GROUP FETCH

    let successCount = 0;
    let failCount = 0;
    let totalGroups = 0;

    for (const botId in activeBots) {
        const botInfo = activeBots[botId];
        const bot = new Telegraf(botInfo.token);

        // ===== SEND TO DM =====
        if (type === 'dm') {
            try {
                await bot.telegram.sendMessage(botInfo.createdBy, message);
                console.log(`✅ DM sent to user ${botInfo.createdBy}`);
                successCount++;
            } catch (err) {
                console.error(`❌ Failed DM to user ${botInfo.createdBy}:`, err.description || err);
                failCount++;
            }
        }

        // ===== SEND TO GROUPS =====
        if (type === 'groups' || type === 'all') {
            const groups = await getBotGroups(botId);
            console.log(`🔍 Bot @${botInfo.username} has ${groups.length} groups`);
            totalGroups += groups.length;

            for (const group of groups) {
                try {
                    // Check if bot can access group BEFORE sending
                    await bot.telegram.getChat(group.group_id);

                    await bot.telegram.sendMessage(group.group_id, message);
                    console.log(`✅ Message sent to group ${group.title} (${group.group_id})`);
                    successCount++;
                } catch (error) {
                    if (error.code === 400 && error.description.includes('chat not found')) {
                        console.log(`⚠️ Skipping group ${group.title} (${group.group_id}) — bot not in group anymore.`);

                        // OPTIONAL: Mark group as inactive in DB to clean up
                        await db.collection('groups').updateOne(
                            { group_id: group.group_id },
                            { $set: { is_active: false } }
                        );

                        failCount++;
                        continue;
                    }

                    console.error(`❌ Failed to send to group ${group.title} (${group.group_id}):`, error.description || error);
                    failCount++;
                }
            }
        }

        // ===== SEND TO DM AGAIN (FOR 'all') =====
        if (type === 'all') {
            try {
                await bot.telegram.sendMessage(botInfo.createdBy, message);
                console.log(`✅ DM sent to user ${botInfo.createdBy}`);
                successCount++;
            } catch (err) {
                console.error(`❌ Failed DM to user ${botInfo.createdBy}:`, err.description || err);
                failCount++;
            }
        }
    }

    return { successCount, failCount, groupCount: totalGroups };
}



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
            const botProcesses = list.filter(proc => proc.name && proc.name.startsWith('bot_'))

            
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
            const botProcesses = list.filter(proc => proc.name && proc.name.startsWith('bot_'));

            
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
