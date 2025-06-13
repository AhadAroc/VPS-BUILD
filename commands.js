//ultragayshit 

const { adminOnly,setupMiddlewares } = require('./middlewares');
const { developerIds } = require('./handlers');
const { ensureDatabaseInitialized } = require('./database');
const { createPrimaryDevelopersTable } = require('./database');
// Add this near the top of your file, with other global variables
const videoRestrictionStatus = new Map();
const gifRestrictionStatus = new Map();
const linkRestrictionStatus = new Map();
const photoRestrictionStatus = new Map();
const { MongoClient } = require('mongodb');
// Add this near the top of your file, with other global variables
const documentRestrictionStatus = new Map();
// Assuming you have your MongoDB connection string in an environment variable
const uri = process.env.MONGODB_URI;
const { pool } = require('./database'); // Adjust the path as necessary
let photoMessages = new Map(); // chatId -> Set of message IDs
// Add this at the top of your file
const database = require('./database');
const { isDeveloper } = require('./middlewares');
const { loadActiveGroupsFromDatabase, getDatabaseForBot ,} = require('./database'); // Adjust the path as necessary
const axios = require('axios');
const subscriptionStatusCache = new Map();
const config = require('./config');

const mongoose = require('mongoose');
// First, define the Map to track sticker restriction status at the top of your file
const stickerRestrictionStatus = new Map();
const premiumUserSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  notified: { type: Boolean, default: false }
});

// Avoid re-registering the model if it's already defined
const PremiumUser = mongoose.models.PremiumUser || mongoose.model('PremiumUser', premiumUserSchema);

// MongoDB connection for storing scores
let mongoClient = null;
const knownUsers = new Map();
// Map to track broadcasting state for each chat
const chatBroadcastStates = new Map();
let awaitingBroadcastPhoto = false;
// Declare ownerId and ownerMessageSent at the top of your file
let ownerId = null;
let ownerMessageSent = false;

let ownerUsername = null;
let ownerFirstName = null;
   // Add this function near the top of your file, after your imports and before the bot commands
   async function getBotGroups(botId) {
    try {
        const db = await database.connectToMongoDB('test'); // connect explicitly to 'test' DB
        const groups = await db.collection('groups').find({ 
            is_active: true,
            bot_id: botId  // make sure bot_id is always set on save!
        }).toArray();

        console.log(`Bot ${botId} has ${groups.length} active groups`);
        return groups;
    } catch (error) {
        console.error('Error fetching bot groups:', error);
        return [];
    }
}


async function getLatestGroupsMembersState(botId, userId) {
    try {
        const groups = await getBotGroups(botId, userId);
        const membersState = {};

        for (const group of groups) {
            try {
                const chatMembers = await bot.telegram.getChatAdministrators(group.chat_id);
                for (const member of chatMembers) {
                    if (!membersState[member.user.id]) {
                        membersState[member.user.id] = {
                            id: member.user.id,
                            username: member.user.username,
                            first_name: member.user.first_name,
                            last_name: member.user.last_name,
                            isAdmin: member.status === 'administrator' || member.status === 'creator',
                            groups: []
                        };
                    }
                    membersState[member.user.id].groups.push(group.chat_id);
                }
            } catch (error) {
                console.error(`Error fetching members for group ${group.chat_id}:`, error);
            }
        }

        return membersState;
    } catch (error) {
        console.error('Error getting latest groups members state:', error);
        return {};
    }
}
  // ✅ Function to check if the user is admin or owner // u fuked with this part
  async function isAdminOrOwner(ctx, userId) {
    try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        return ['administrator', 'creator'].includes(member.status);
    } catch (error) {
        if (error.response && error.response.error_code === 403 && error.response.description.includes('bot was kicked')) {
            console.error('Bot was kicked from the group:', ctx.chat.id);
            // Notify the owner about the bot being kicked
            if (ownerId) {
                const message = `
                    🚫 تم طرد البوت من المجموعة
                    ┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉
                    👥 *اسم المجموعة:* ${ctx.chat.title || 'Unknown'}
                    🆔 *ايدي المجموعة:* ${ctx.chat.id}
                    ⌯ رابط المجموعة ⌯: ${groupLink}
                `;
                try {
                    await ctx.telegram.sendMessage(ownerId, message, { parse_mode: 'Markdown' });
                    console.log(`Notification sent to owner (ID: ${ownerId})`);
                } catch (notifyError) {
                    console.error('Error notifying owner about bot being kicked:', notifyError);
                }
            }
        } else {
            console.error('Error checking admin status:', error);
        }
        return false;
    }
}
// Add this function to check if a user is a VIP
async function isVIP(ctx, userId) {
    const db = await ensureDatabaseInitialized();

    // Try by user_id first
    let vipUser = await db.collection('vip_users').findOne({ user_id: userId });
    if (vipUser) return true;

    // Fallback to check by username if Telegram username is available
    const username = ctx.from.username;
    if (username) {
        vipUser = await db.collection('vip_users').findOne({ username: username });
        return !!vipUser;
    }

    return false;
}
async function updateGroupActivity(ctx, botId) {
    const chatId = ctx.chat.id;
    const chatTitle = ctx.chat.title || 'Unknown';

    console.log(`🛠️ [updateGroupActivity] Chat: ${chatTitle} (${chatId}) | botId: ${botId}`);

    const db = await ensureDatabaseInitialized('test');
    await db.collection('groups').updateOne(
        { group_id: chatId, bot_id: botId },
        {
            $set: {
                group_id: chatId,
                title: chatTitle,
                is_active: true,
                bot_id: botId,   // <== MAKE SURE THIS IS NOT NULL!
                updated_at: new Date()
            }
        },
        { upsert: true }
    );

    console.log(`✅ Group ${chatTitle} (${chatId}) marked as active for bot ${botId}`);
}
async function reportMessage(ctx) {
    try {
        const userId = ctx.from.id;
        
        // Check if the user is a premium user
        const isPremium = await isPremiumUser(userId);
        
        // Only allow premium users to use this command
        if (!isPremium) {
            await ctx.reply('❌ عذرًا، هذا الأمر متاح فقط للمشتركين في الخدمة المدفوعة. يرجى الترقية للاستفادة من هذه الميزة.');
            return;
        }

        // Check if the message is a reply
        if (!ctx.message.reply_to_message) {
            await ctx.reply('❌ يجب الرد على الرسالة التي تريد الإبلاغ عنها.');
            return;
        }

        const reportedMessage = ctx.message.reply_to_message;
        const reportedUserId = reportedMessage.from.id;
        const reportedUserName = reportedMessage.from.first_name || 'مستخدم';
        const reportedUserUsername = reportedMessage.from.username ? `@${reportedMessage.from.username}` : 'غير متوفر';
        const reporterName = ctx.from.first_name || 'مستخدم';
        const reporterUsername = ctx.from.username ? `@${ctx.from.username}` : 'غير متوفر';
        const groupName = ctx.chat.title || 'مجموعة';
        const groupId = ctx.chat.id;
        
        // Get the message content
        let messageContent = '';
        if (reportedMessage.text) {
            messageContent = reportedMessage.text.length > 100 
                ? reportedMessage.text.substring(0, 100) + '...' 
                : reportedMessage.text;
        } else if (reportedMessage.photo) {
            messageContent = '[صورة]';
        } else if (reportedMessage.video) {
            messageContent = '[فيديو]';
        } else if (reportedMessage.document) {
            messageContent = '[مستند]';
        } else if (reportedMessage.animation) {
            messageContent = '[صورة متحركة]';
        } else {
            messageContent = '[محتوى آخر]';
        }

        // Get all admins of the group
        const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);
        
        // Create the report message for the group
        const groupReportMessage = `
⚠️ *تقرير عن رسالة مخالفة* ⚠️

👤 *المستخدم المُبلغ عنه:* ${reportedUserName} (${reportedUserUsername})
🆔 *معرف المستخدم:* \`${reportedUserId}\`
📝 *محتوى الرسالة:* "${messageContent}"

🚨 *تم الإبلاغ بواسطة:* ${reporterName} (${reporterUsername}) [مستخدم مميز]
⏰ *وقت الإبلاغ:* ${new Date().toLocaleString('ar-SA')}

*رابط الرسالة:* [اضغط هنا](https://t.me/c/${ctx.chat.id.toString().slice(4)}/${reportedMessage.message_id})
`;

        // Create the DM report message with more details
        const dmReportMessage = `
⚠️ *تقرير عن رسالة مخالفة* ⚠️

👥 *المجموعة:* ${groupName}
🆔 *معرف المجموعة:* \`${groupId}\`

👤 *المستخدم المُبلغ عنه:* ${reportedUserName} (${reportedUserUsername})
🆔 *معرف المستخدم:* \`${reportedUserId}\`
📝 *محتوى الرسالة:* "${messageContent}"

🚨 *تم الإبلاغ بواسطة:* ${reporterName} (${reporterUsername}) [مستخدم مميز]
🆔 *معرف المُبلغ:* \`${ctx.from.id}\`
⏰ *وقت الإبلاغ:* ${new Date().toLocaleString('ar-SA')}

*رابط الرسالة:* [اضغط هنا](https://t.me/c/${ctx.chat.id.toString().slice(4)}/${reportedMessage.message_id})
`;

        // Send notification to all admins
        let adminMentions = '';
        for (const admin of admins) {
            if (!admin.user.is_bot) {
                adminMentions += `[​](tg://user?id=${admin.user.id})`;
                
                // Send DM to each admin
                try {
                    await ctx.telegram.sendMessage(admin.user.id, dmReportMessage, {
                        parse_mode: 'Markdown',
                        disable_web_page_preview: true
                    });
                    console.log(`Report DM sent to admin ${admin.user.id}`);
                } catch (dmError) {
                    // If sending DM fails (e.g., admin hasn't started the bot), just log it
                    console.log(`Couldn't send report DM to admin ${admin.user.id}: ${dmError.message}`);
                }
            }
        }

        // Send the report with admin mentions in the group
        await ctx.reply(groupReportMessage + '\n' + adminMentions, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_to_message_id: reportedMessage.message_id
        });

        // Confirm to the reporter
        await ctx.reply('✅ تم إرسال البلاغ إلى مشرفي المجموعة. شكراً لمساعدتك في الحفاظ على قواعد المجموعة.', {
            reply_to_message_id: ctx.message.message_id
        });

    } catch (error) {
        console.error('Error in reportMessage:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة الإبلاغ عن الرسالة.');
    }
}
// Add this middleware function
async function photoRestrictionMiddleware(ctx, next) {
    if (ctx.message && ctx.message.photo) {
        const chatId = ctx.chat.id;
        if (photoRestrictionStatus.get(chatId)) {
            const userId = ctx.from.id;
            
            // Check if the user is an admin, VIP, or important
            if (await isAdminOrOwner(ctx, userId) || await isVIP(ctx, userId) || await isImportant(ctx, userId)) {
                return next();
            } else {
                try {
                    await ctx.deleteMessage();
                    await ctx.reply('❌ عذرًا، مشاركة الصور مقيدة للأعضاء العاديين في هذه المجموعة.');
                } catch (error) {
                    console.error('Error in photoRestrictionMiddleware:', error);
                }
                return;
            }
        }
    }
    return next();
}
function trackUser(ctx) {
    if (ctx.from?.username) {
        knownUsers.set(ctx.from.username.toLowerCase(), {
            id: ctx.from.id,
            first_name: ctx.from.first_name
        });
    }
}

async function linkRestrictionMiddleware(ctx, next) {
    if (ctx.message && ctx.message.entities && ctx.message.entities.some(e => e.type === 'url')) {
        const chatId = ctx.chat.id;
        if (linkRestrictionStatus.get(chatId)) {
            const userId = ctx.from.id;
            const isAdmin = await isAdminOrOwner(ctx, userId);
            const isVipUser = await isVIP(ctx, userId);
            const isImportantUser = await isImportant(ctx, userId);

            if (!isAdmin && !isVipUser && !isImportantUser) {
                try {
                    await ctx.deleteMessage();
                    await ctx.reply('❌ عذرًا، تم منع مشاركة الروابط للأعضاء العاديين في هذه المجموعة.');
                } catch (error) {
                    console.error('Error in linkRestrictionMiddleware:', error);
                }
                return;
            }
        }
    }
    return next();
}
async function videoRestrictionMiddleware(ctx, next) {
    if (ctx.message && (ctx.message.video || (ctx.message.document && ctx.message.document.mime_type && ctx.message.document.mime_type.startsWith('video/')))) {
        const chatId = ctx.chat.id;
        if (videoRestrictionStatus.get(chatId)) {
            const userId = ctx.from.id;
            const isAdmin = await isAdminOrOwner(ctx, userId);
            const isVipUser = await isVIP(ctx, userId);
            const isImportantUser = await isImportant(ctx, userId);

            if (!isAdmin && !isVipUser && !isImportantUser) {
                try {
                    await ctx.deleteMessage();
                    await ctx.reply('❌ عذرًا، تم تعطيل إرسال الفيديوهات للأعضاء العاديين في هذه المجموعة.');
                } catch (error) {
                    console.error('Error in videoRestrictionMiddleware:', error);
                }
                return;
            }
        }
    }
    return next();
}
async function gifRestrictionMiddleware(ctx, next) {
    if (ctx.message && ctx.message.animation) {
        const chatId = ctx.chat.id;
        if (gifRestrictionStatus.get(chatId)) {
            const userId = ctx.from.id;
            const isAdmin = await isAdminOrOwner(ctx, userId);
            const isImportantUser = await isImportant(ctx, userId);

            if (!isAdmin && !isImportantUser) {
                try {
                    await ctx.deleteMessage();
                    await ctx.reply('❌ عذرًا، تم تعطيل إرسال الصور المتحركة للأعضاء العاديين في هذه المجموعة.');
                } catch (error) {
                    console.error('Error in gifRestrictionMiddleware:', error);
                }
                return;
            }
        }
    }
    return next();
}

async function documentRestrictionMiddleware(ctx, next) {
    if (ctx.message && ctx.message.document) {
        const chatId = ctx.chat.id;
        if (documentRestrictionStatus.get(chatId)) {
            const isAdmin = await isAdminOrOwner(ctx, ctx.from.id);
            if (!isAdmin) {
                try {
                    await ctx.deleteMessage();
                    await ctx.reply('❌ عذرًا، تم تعطيل إرسال المستندات للأعضاء العاديين في هذه المجموعة.');
                } catch (error) {
                    console.error('Error in documentRestrictionMiddleware:', error);
                }
                return;
            }
        }
    }
    return next();
}

async function hasRequiredPermissions(ctx, userId) {
    const isAdmin = await isAdminOrOwner(ctx, userId);
    const isSecDev = await isSecondaryDeveloper(ctx, userId);
    const isBotAdm = await isBotAdmin(userId);
    const isPremium = await isPremiumUser(userId);
    
    return isAdmin || isSecDev || isBotAdm || isPremium;
}
// ✅ Display main menu
async function showMainMenu(ctx) {
    try {
        const userId = ctx.from.id;

        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isSecDev = await isSecondaryDeveloper(ctx, userId);
        const isVIPUser = await isVIP(ctx, userId);
        const isBotAdm = await isBotAdmin(userId);

        const isSpecialUser = isAdmin || isSecDev || isVIPUser || isBotAdm;

        const photoUrl = 'https://i.postimg.cc/R0jjs1YY/bot.jpg';

        let keyboard;

        if (isSpecialUser) {
            // ✅ Admins, SecDev, VIPs, and Bot Admins get the full menu
            keyboard = {
                inline_keyboard: [
                    [{ text: 'القناة الاساسية', url: 'https://t.me/ctrlsrc' }],
                    [{ text: '📜🚨  الحماية و الأوامر', callback_data: 'show_commands' }],
                    [{ text: '🎮 بوت المسابقات', callback_data: 'quiz_bot' }],
                    [{ text: 'تابـع جديدنا', url: 'https://t.me/T0_pc' }]
                ]
            };
        } else {
            // 👥 Normal members get a simple limited menu
            keyboard = {
                inline_keyboard: [
                    [{ text: '🎮 بوت المسابقات', callback_data: 'quiz_bot' }],
                    [{ text: '📢 تابع قناة البوت', url: 'https://t.me/ctrlsrc' }]
                ]
            };
        }

        await ctx.replyWithPhoto(photoUrl, {
            caption: '🤖 مرحبًا! أنا بوت الحماية والمسابقات. اختر خيارًا:',
            reply_markup: keyboard
        });
        
    } catch (error) {
        console.error('Error in showMainMenu:', error);
        await ctx.reply('❌ حدث خطأ أثناء عرض القائمة الرئيسية.');
    }
}
setInterval(async () => {
  const db = await database.setupDatabase();
  const now = new Date();
  const expiredUsers = await db.collection("premium_users").find({
    expiresAt: { $lt: now },
    notified: false
  }).toArray();

  for (const user of expiredUsers) {
    try {
      await bot.telegram.sendMessage(user.userId, '⚠️ Your premium subscription has expired.');
    } catch (err) {
      console.error("Failed to notify:", err.message);
    }

    await db.collection("premium_users").updateOne(
      { userId: user.userId },
      { $set: { notified: true } }
    );
  }
}, 60 * 60 * 1000); // Every hour

async function showHelp(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين والمالك فقط.');
        }

        const helpText = `
*🆘 مرحبا بك في معلومات/مساعدة البوت 🆘*

*السؤال 1 : منو يكدر يستخدم البوت ؟*
• المطور الاساسي : يكدر يشغل السوالف الي بيها خيارات كاملة من يراسل البوت بل خاص
• المطور الثانوي : بس يكدر يستخدم السوالف الي بل كروب ويا الادمن والمالك

*السؤال 2 : شلون احذف مطور ومطور ثانوي ؟*
• الي عنده صلاحية خاص البوت وخياراتها يكدر من هناك يروح لل:
  مطورين > مطورين/ثانويين > اليوزر > حذف

*السؤال 3 : شلون تشتغل الاوامر ؟*
• الأوامر الشخصية: الطرد والكتم والخ... تشتغل عن طريق الرد على المستخدم أو *(منشن للمستخدم قيد العمل نعتذر)*
• الأوامر العامة: مثل منع الروابط وحذف الصور تشتغل فقط بإرسالها بالكروب

*ملاحظة:* الأوامر فعالة لمالك البوت فقط و الادمن مال الكروب حاليا.

*السؤال 4 : بوت المسابقات شلون يشتغل ؟*
• بوت المسابقات يشتغل فقط مع (المميز VIP، الادمن، المنشئ، مطور ثانوي)
• تكدر تعدل على الوقت، تضيف اسئلة، وغيرها...

*السؤال الخامس : البوت بيه غلط ومدا يشتغل شنو الحل ؟*
• يرجى تبليغ مطور السورس في رابط قناة السورس و ان شاء الله تنحل 🥲
@Lorisiv
        `;

        await ctx.replyWithMarkdown(helpText, { disable_web_page_preview: true });
    } catch (error) {
        console.error('Error in showHelp:', error);
        await ctx.reply('❌ حدث خطأ أثناء عرض المساعدة. يرجى المحاولة مرة أخرى لاحقًا.');
    }
}
async function isBotAdmin(ctx, userId) {
    try {
        if (!userId) {
            console.error('Error in isBotAdmin: userId is undefined');
            return false;
        }

        const db = await ensureDatabaseInitialized();

        // 1. Check by user_id
        const botAdminById = await db.collection('bot_admins').findOne({ user_id: parseInt(userId) });
        if (botAdminById) {
            console.log(`Bot admin check for user ${userId} by ID: true`);
            return true;
        }

        // 2. Fallback: Check by username
        const username = ctx.from?.username;
        if (username) {
            const botAdminByUsername = await db.collection('bot_admins').findOne({ username: username });
            if (botAdminByUsername) {
                console.log(`Bot admin check for @${username} by username: true`);
                return true;
            }
        }

        console.log(`Bot admin check for user ${userId}: false`);
        return false;
    } catch (error) {
        console.error('Error checking bot admin status:', error);
        return false;
    }
}

async function getLeaderboard(groupId) {
    try {
        const db = await ensureDatabaseInitialized();

        const leaderboard = await db.collection('quiz_scores')
            .aggregate([
                { $match: { chatId: groupId } }, // 🔍 filter by group/chat ID
                {
                    $group: {
                        _id: "$userId",
                        totalScore: { $sum: "$score" },
                        username: { $first: "$username" },
                        firstName: { $first: "$firstName" }
                    }
                },
                { $sort: { totalScore: -1 } },
                { $limit: 10 }
            ])
            .toArray();

        if (!leaderboard.length) {
            return "ℹ️ لا يوجد مشاركون بعد في هذه المجموعة.";
        }

        let leaderboardText = "🏆 قائمة المتصدرين في هذه المجموعة:\n\n";
        leaderboard.forEach((entry, index) => {
            const name = entry.firstName || entry.username || 'مستخدم مجهول';
            leaderboardText += `${index + 1}. ${name}: ${entry.totalScore} نقطة\n`;
        });

        return leaderboardText;
    } catch (error) {
        console.error('Error fetching group leaderboard:', error);
        return "❌ حدث خطأ أثناء جلب قائمة المتصدرين.";
    }
}
async function isPremiumUser(userId) {
    try {
        // Always check the database directly, don't rely on cached values
        const user = await PremiumUser.findOne({ userId: parseInt(userId) });
        
        // If no user found, they're not premium
        if (!user) return false;
        
        // Check if their premium subscription is still valid
        const now = new Date();
        if (new Date(user.expiresAt) > now) {
            return true; // User is premium and subscription is valid
        }
        
        // If subscription expired, notify the user (if not already notified)
        if (!user.notified) {
            try {
                // Send notification about expired premium status
                await bot.telegram.sendMessage(userId, '⚠️ انتهت صلاحيتك المميزة. راسل المطور للتجديد.');
                
                // Mark as notified in the database
                await PremiumUser.updateOne(
                    { userId: parseInt(userId) },
                    { $set: { notified: true } }
                );
            } catch (err) {
                console.error("❌ Failed to notify expired premium user:", err.message);
            }
        }
        
        // If expired, also remove from VIP and important users collections
        try {
            const db = await database.setupDatabase();
            await db.collection('vip_users').deleteMany({ user_id: parseInt(userId) });
            await db.collection('important_users').deleteMany({ user_id: parseInt(userId) });
        } catch (err) {
            console.error("❌ Failed to clean up expired premium user:", err.message);
        }
        
        return false; // Subscription expired
    } catch (err) {
        console.error("❌ isPremiumUser error:", err.message);
        return false; // Return false on error
    }
}



async function showQuizMenu(ctx) {
    try {
        const userId = ctx.from.id;
        
        // Check if the user is an admin, owner, or VIP
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isVIPUser = await isVIP(ctx, userId);
        const isPremium = await isPremiumUser(userId);
        const isBotAdm = await isBotAdmin(userId);
        
        console.log(`Quiz menu permissions for user ${userId}:`, {
            isAdmin,
            isVIPUser,
            isPremium,
            isBotAdm
        });
        
        // Consider including isBotAdm in the permission check
        if (!isAdmin && !isVIPUser && !isBotAdm && !isPremium) {
            return ctx.reply('❌ هذا القسم مخصص للمشرفين والأعضاء المميزين فقط.');
        }

              const keyboard = {
    inline_keyboard: [
        [{ text: '🎮 بدء مسابقة جديدة', callback_data: 'start_quiz' }],
        [{ text: '🏆 قائمة المتصدرين', callback_data: 'show_leaderboard' }],
        [{ text: '📊 إحصائياتي', callback_data: 'show_stats' }],
        [{ text: '⚙️ إعدادات المسابقة', callback_data: 'configure_quiz' }],
        [{ text: 'اضافة اسئلة خاصة ➕', callback_data: 'add_custom_questions' }],
        [{ text: '🔙 العودة للقائمة الرئيسية', callback_data: 'back_to_main' }]
    ]
}

        const photoUrl = 'https://postimg.cc/QBJ4V7hg/5c655f5c'; // Replace with your actual emoji cloud image URL
        const caption = '🎮 مرحبًا بك في نظام المسابقات! اختر من القائمة أدناه:';
        
        if (ctx.callbackQuery) {
            // If it's a callback query, we need to edit the existing message
            if (ctx.callbackQuery.message.photo) {
                // If the current message is a photo, edit the media
                await ctx.editMessageMedia(
                    {
                        type: 'photo',
                        media: photoUrl,
                        caption: caption
                    },
                    { reply_markup: keyboard }
                );
            } else {
                // If it's a text message, edit the text
                await ctx.editMessageText(caption, { reply_markup: keyboard });
            }
        } else {
            // This is a direct command, send a new message with photo
            await ctx.replyWithPhoto(
                { url: photoUrl },
                {
                    caption: caption,
                    reply_markup: keyboard
                }
            );
        }
    } catch (error) {
        console.error('Error in showQuizMenu:', error);
        // If editing fails, send a new message
        await ctx.reply('❌ حدث خطأ أثناء عرض قائمة المسابقات. الرجاء المحاولة مرة أخرى.');
    }
}
async function broadcastMessage(ctx, mediaType, mediaId, caption) {
    try {
        const db = await ensureDatabaseInitialized();
        const groups = await db.collection('groups').find({ is_active: true }).toArray();

        console.log(`Broadcasting to ${groups.length} groups.`); // Debugging line

        for (const group of groups) {
            try {
                if (mediaType && mediaId) {
                    switch (mediaType) {
                        case 'photo':
                            await ctx.telegram.sendPhoto(group.group_id, mediaId, { caption: caption || '' });
                            break;
                        case 'video':
                            await ctx.telegram.sendVideo(group.group_id, mediaId, { caption: caption || '' });
                            break;
                        // 🛑 Add more cases for other media if needed
                        default:
                            console.error('Unsupported media type:', mediaType);
                            break;
                    }
                } else if (caption) {
                    // Text-only message
                    await ctx.telegram.sendMessage(group.group_id, caption);
                }

                console.log(`Message sent to group: ${group.group_id}`);
            } catch (error) {
                console.error(`❌ Error sending to group ${group.group_id}:`, error);
            }
        }

        await ctx.reply('✅ تم إرسال الرسالة إلى جميع المجموعات النشطة.');
    } catch (error) {
        console.error('❌ Error in broadcastMessage:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة إرسال الرسالة.');
    }
}

async function getDifficultyLevels() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const database = client.db("quizBot"); // Replace with your actual database name
        const collection = database.collection("questions");

        // Aggregate to get unique difficulty levels
        const difficultyLevels = await collection.distinct("difficulty");

        return difficultyLevels;
    } catch (error) {
        console.error("Error fetching difficulty levels:", error);
        return [];
    } finally {
        await client.close();
    }
}
// Add this function to check if a user is the bot owner
async function isBotOwner(ctx, userId) {
    try {
        const chatId = ctx.chat.id;
        const db = await ensureDatabaseInitialized();
        
        const userIdNum = parseInt(userId);
        const chatIdNum = parseInt(chatId);

        console.log(`Checking if user ${userIdNum} is a bot owner (اساسي) in chat ${chatIdNum}`);

        // 1. Try matching by user_id and chat_id
        const byId = await db.collection('bot_owners').findOne({
            user_id: userIdNum,
            chat_id: chatIdNum,
            is_active: true
        });
        if (byId) {
            console.log(`User ${userIdNum} is a bot owner by ID.`);
            return true;
        }

        // 2. Fallback: try matching by username
        const username = ctx.from?.username;
        if (username) {
            const byUsername = await db.collection('bot_owners').findOne({
                username: username,
                chat_id: chatIdNum,
                is_active: true
            });
            if (byUsername) {
                console.log(`User @${username} is a bot owner by username.`);
                return true;
            }
        }

        console.log(`User ${userIdNum} is not a bot owner.`);
        return false;
    } catch (error) {
        console.error('Error checking if user is bot owner (اساسي):', error);
        return false;
    }
}
async function getQuestionsForDifficulty(difficulty) {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const database = client.db("quizBot"); // Replace with your actual database name
        const collection = database.collection("questions");

        // Find questions matching the given difficulty
        const questions = await collection.find({ difficulty: difficulty }).toArray();

        return questions;
    } catch (error) {
        console.error(`Error fetching questions for difficulty ${difficulty}:`, error);
        return [];
    } finally {
        await client.close();
    }
}
// Add this function to handle bot ownership assignment
async function assignBotOwnership(ctx) {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username || 'Unknown';
        const firstName = ctx.from.first_name || 'Unknown';
        const lastName = ctx.from.last_name || '';
        const botId = ctx.botInfo.id;
        const botUsername = ctx.botInfo.username;
        
        const db = await ensureDatabaseInitialized();
        
        // Check if this bot already has an owner assigned
        const botOwnership = await db.collection('bot_ownership').findOne({ bot_id: botId });
        
        if (!botOwnership) {
            // This is the first time someone is using this bot - assign ownership
            await db.collection('bot_ownership').insertOne({
                bot_id: botId,
                bot_username: botUsername,
                owner_id: userId,
                owner_username: username,
                owner_first_name: firstName,
                owner_last_name: lastName,
                assigned_at: new Date(),
                is_active: true
            });
            
            console.log(`New ownership assigned for bot ${botId} (@${botUsername}) to user ${userId} (@${username})`);
            
            // Set global owner ID variable
            ownerId = userId;
            ownerUsername = username;
            ownerFirstName = firstName;
            
            // Send confirmation message to the new bot owner
            const ownershipMessage = `
🎉 تم تعيينك كمالك جديد للبوت!
┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉
🤖 *معلومات البوت:*
• الاسم: ${ctx.botInfo.first_name}
• المعرف: @${botUsername}
• الايدي: ${botId}

👤 *معلوماتك:*
• الاسم: ${firstName} ${lastName}
• المعرف: @${username}
• الايدي: ${userId}

✅ يمكنك الآن استخدام جميع ميزات البوت كمالك.
`;
            
            await ctx.telegram.sendMessage(userId, ownershipMessage, { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📋 لوحة التحكم', callback_data: 'owner_panel' }]
                    ]
                }
            });
            
            return true; // Ownership was assigned
        } else {
            // This bot already has an owner
            // Update the global owner ID variable if not set
            if (ownerId === null) {
                ownerId = botOwnership.owner_id;
                ownerUsername = botOwnership.owner_username;
                ownerFirstName = botOwnership.owner_first_name;
            }
            
            // Check if the current user is the owner
            if (botOwnership.owner_id === userId) {
                console.log(`Bot owner ${userId} accessed their bot ${botId}`);
                // Optional: Update last access time
                await db.collection('bot_ownership').updateOne(
                    { bot_id: botId },
                    { $set: { last_accessed: new Date() }}
                );
            }
            
            return false; // Ownership was not assigned (already exists)
        }
    } catch (error) {
        console.error('Error managing bot ownership:', error);
        return false;
    }
}

async function checkUserSubscription(ctx) {
    try {
        const userId = ctx.from.id;
        const subscriptionStatusCache = new Map();
        // Define the channels that require subscription
        const requiredChannels = [
            { id: -1002555424660, username: 'sub2vea', title: 'قناة السورس' },
            { id: -1002331727102, username: 'leavemestary', title: 'القناة الرسمية' }
        ];

        // Extract channel IDs for the Axios request
        const channelIds = requiredChannels.map(channel => channel.id);

        // Send a POST request to Bot B
        const response = await axios.post('http://69.62.114.242:80/check-subscription', {
            userId,
            channels: channelIds
        });

        const { subscribed } = response.data;

        if (subscribed) {
            subscriptionStatusCache.set(userId, true);
            // Don't show menus here - just return true
            return true; // ✅ Subscribed
        } else {
            const subscriptionMessage = '⚠️ لاستخدام البوت، يرجى الاشتراك في القنوات التالية:';
            const inlineKeyboard = [
                [{ text: '📢 قناة السورس', url: 'https://t.me/sub2vea' }],
                [{ text: '📢 القناة الرسمية', url: 'https://t.me/leavemestary' }],
                [{ text: '✅ تحقق من الاشتراك', callback_data: 'check_subscription' }]
            ];

            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('❗ اشترك أولاً');
                await ctx.editMessageText(subscriptionMessage, {
                    reply_markup: { inline_keyboard: inlineKeyboard }
                }).catch(err => console.error('editMessageText error:', err));
            } else {
                await ctx.reply(subscriptionMessage, {
                    reply_markup: { inline_keyboard: inlineKeyboard }
                });
            }
            return false; // ❌ Not subscribed
        }
    } catch (error) {
        console.error('Error in checkUserSubscription:', error);
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery('❌ خطأ أثناء التحقق.', { show_alert: true }).catch(() => {});
        }
        return false; // treat as not subscribed on error
    }
}

async function isSubscribed(ctx, userId) {
    try {
        // Check if we have a cached result that's still valid (cache for 1 minute only to prevent issues)
        const cachedResult = subscriptionCache.get(userId);
        if (cachedResult && (Date.now() - cachedResult.timestamp < 1 * 60 * 1000)) {
            console.log(`Using cached subscription status for user ${userId}: ${cachedResult.isSubscribed}`);
            return {
                isSubscribed: cachedResult.isSubscribed,
                statusChanged: false,
                notSubscribedChannels: cachedResult.notSubscribedChannels || []
            };
        }

        console.log(`Checking subscription status for user ${userId}`);
        
        // Define the channels that require subscription
        const requiredChannels = [
            { username: 'leavemestary', title: 'قناة السورس' },
            { username: 'sub2vea', title: 'القناة الرسمية' }
        ];
        
        let allSubscribed = true;
        let notSubscribedChannels = [];
        
        // Check each channel
        for (const channel of requiredChannels) {
            try {
                // Force a fresh check by bypassing any Telegram API caching
                const member = await ctx.telegram.getChatMember(`@${channel.username}`, userId);
                const isSubbed = ['member', 'administrator', 'creator'].includes(member.status);
                
                console.log(`User ${userId} subscription status for @${channel.username}: ${isSubbed} (${member.status})`);
                
                if (!isSubbed) {
                    allSubscribed = false;
                    notSubscribedChannels.push(channel);
                }
            } catch (error) {
                console.error(`Error checking subscription for @${channel.username}:`, error);
                // If we can't check, assume not subscribed for safety
                allSubscribed = false;
                notSubscribedChannels.push(channel);
            }
        }
        
        // Clear the cache if the status has changed
        const previousStatus = subscriptionCache.get(userId)?.isSubscribed || false;
        const statusChanged = previousStatus !== allSubscribed;
        
        if (statusChanged) {
            console.log(`Subscription status changed for user ${userId}: ${previousStatus} -> ${allSubscribed}`);
        }
        
        // Store the result in cache with a shorter expiration time (30 seconds)
        subscriptionCache.set(userId, { 
            isSubscribed: allSubscribed, 
            timestamp: Date.now(),
            notSubscribedChannels: notSubscribedChannels
        });
        
        // Return the result with status change indicator
        return {
            isSubscribed: allSubscribed,
            statusChanged: statusChanged,
            notSubscribedChannels: notSubscribedChannels
        };
    } catch (error) {
        console.error(`Error in isSubscribed check for user ${userId}:`, error);
        // Default to false on error
        return {
            isSubscribed: false,
            statusChanged: false,
            notSubscribedChannels: []
        };
    }
}
async function checkUserRank(ctx) {
    try {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const botId = ctx.botInfo.id;
        let rank = 'عضو عادي'; // Default rank
        let rankEmoji = '👤';

        // Get database connection
        const db = await ensureDatabaseInitialized();

        // Check if user is the owner
        if (ctx.from.username === 'Lorisiv') {
            rank = 'المطور الأساسي';
            rankEmoji = '👑';
        } 
        // Check if user is a developer
        else if (await isDeveloper(ctx, userId)) {
            rank = 'مطور';
            rankEmoji = '⚙️';
        } 
        // Check if user is a secondary developer
        else if (await isSecondaryDeveloper(ctx, userId)) {
            rank = 'مطور ثانوي';
            rankEmoji = '🔧';
        } 
        // Check if user is a bot owner (اساسي)
        else if (await isBotOwner(ctx, userId)) {
            rank = 'اساسي';
            rankEmoji = '🛡️';
        }
        // Check if user is a bot admin
        else if (await isBotAdmin(userId)) {
            rank = 'مشرف بوت';
            rankEmoji = '🛠️';
        }
        // Check if user is a group admin
        else if (await isAdminOrOwner(ctx, userId)) {
            try {
                const member = await ctx.telegram.getChatMember(chatId, userId);
                if (member.status === 'creator') {
                    rank = 'المالك';
                    rankEmoji = '👑';
                } else {
                    rank = 'مشرف';
                    rankEmoji = '🔰';
                }
            } catch (error) {
                console.log('Error getting chat member status:', error);
                rank = 'مشرف';
                rankEmoji = '🔰';
            }
        } 
        // Check if user is VIP
        else if (await isVIP(ctx, userId)) {
            rank = 'مميز';
            rankEmoji = '💎';
        }

        // Get user mention
        const userMention = ctx.from.username 
            ? `@${ctx.from.username}` 
            : ctx.from.first_name;

        // Send the rank message
        await ctx.reply(
            `${rankEmoji} *المستخدم:* ${userMention}\n` +
            `🆔 *الايدي:* \`${userId}\`\n` +
            `🏅 *الرتبة:* ${rank}`,
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        console.error('Error checking user rank:', error);
        await ctx.reply('❌ حدث خطأ أثناء التحقق من رتبتك. يرجى المحاولة مرة أخرى لاحقًا.');
    }
}

// Function to send commands list with buttons
async function sendCommandListTelegraf(ctx) {
    const commandText = `📜 *قائمة الأوامر:*

*📊 أوامر المعلومات*
🔹 *ايدي* – ظهور الايدي و معرفك
🔹 *رتبتي* – ظهور رتبتك
🔹 *رابط المجموعة* – الحصول على رابط المجموعة

*👥 أوامر الإدارة*
🔹 *رفع امن مسابقات* – رفع ادمن مسابقات
🔹 *تنزيل امن مسابقات* – تنزيل ادمن مسابقات
🔹 *رفع مميز* – رفع مستخدم إلى مميز
🔹 *تنزيل مميز* – تنزيل مستخدم من مميز
🔹 *لستة مميز* – عرض قائمة المميزين
🔹 *رفع ادمن* – ترقية إلى أدمن
🔹 *تنزيل ادمن* – ترقية إلى أدمن
🔹 *رفع منشئ* – ترقية إلى منشئ
🔹 *تنزيل* – إزالة رتبة
🔹 *رفع مطور* – ترقية إلى مطور
🔹 *رفع مطور ثانوي* – ترقية إلى مطور ثانوي
🔹 *تنزيل اساسي* – تنزيل إلى اساسي
🔹 *رفع اساسي* – ترقية إلى اساسي
🔹 *تنزيل مطور* – لتنزيل مطور أول أو ثانوي، اذهب إلى خاص البوت كمطور

*🛡️ أوامر الحماية*
🔹 *كتم* – كتم مستخدم
🔹 *الغاء كتم* – إلغاء كتم مستخدم
🔹 *مسح* – حذف آخر رسالة
🔹 *تثبيت* – تثبيت رسالة
🔹 *طرد* – طرد مستخدم
🔹 *تحذير* – إصدار تحذير لمستخدم
🔹 *تحذيرات* – عرض عدد التحذيرات لمستخدم
🔹 *نداء الجميع* – مناداة جميع الأعضاء

*🖼️ أوامر الوسائط*
🔹 *مسح الصور* – حذف آخر الصور المرسلة
🔹 *منع الصور* – منع إرسال الصور
🔹 *فتح الصور* – السماح بإرسال الصور
🔹 *منع فيديو* – منع إرسال الفيديوهات
🔹 *فتح فيديو* – السماح بإرسال الفيديoهات
🔹 *منع متحركة* – منع إرسال الصور المتحركة
🔹 *فتح متحركة* – السماح بإرسال الصور المتحركة
🔹 *منع ملصقات* – منع إرسال الملصقات
🔹 *فتح ملصقات* – السماح بإرسال الملصقات

*🔗 أوامر الروابط*
🔹 *ازالة الروابط* – حذف الروابط في المجموعة
🔹 *فتح روابط* – السماح بمشاركة الروابط
🔹 *منع روابط* – منع مشاركة الروابط

*🎭 أوامر الترفيه*
🔹 *نكتة* – إرسال نكتة`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "⚡ عرض الاختصارات", callback_data: "show_shortcuts" },
                
            ],
            [
                
            ]
        ]
    };

    try {
        await ctx.reply(commandText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } catch (error) {
        console.error('Error sending command list:', error);
        // Fallback without buttons if there's an error
        await ctx.reply(commandText, { parse_mode: 'Markdown' });
    }
}

// Function to send shortcuts list
async function sendShortcutsList(ctx) {
    const shortcutsText = `⚡ *قائمة الاختصارات:*

*🔺 اختصارات الرفع:*
🔹 *ر م* – رفع مميز
🔹 *ر ط* – رفع مطور
🔹 *رط* – رفع مطور (بدون مسافة)
🔹 *ر ث* – رفع مطور ثانوي
🔹 *رث* – رفع مطور ثانوي (بدون مسافة)
🔹 *ر ا* – رفع ادمن
🔹 *را* – رفع ادمن (بدون مسافة)
🔹 *ر ا* – رفع مطور أساسي
🔹 *را* – رفع مطور أساسي (بدون مسافة)

*🔻 اختصارات التنزيل:*
'🔹 <b>ت س</b> – تنزيل اساسي\n' +
🔹 *ت م* – تنزيل مميز
🔹 *ت ط* – تنزيل مطور
🔹 *تط* – تنزيل مطور (بدون مسافة)
🔹 *ت ا* – تنزيل ادمن
🔹 *تا* – تنزيل ادمن (بدون مسافة)

*📋 اختصارات أخرى:*
🔹 *ر ت* – عرض رتبتي
🔹 *رت* – عرض رتبتي (بدون مسافة)`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "📜 عرض الأوامر الكاملة", callback_data: "show_commands" },
                { text: "🔄 تحديث", callback_data: "refresh_shortcuts" }
            ],
            [
                { text: "❌ إغلاق", callback_data: "close_menu" }
            ]
        ]
    };

    try {
        await ctx.reply(shortcutsText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    } catch (error) {
        console.error('Error sending shortcuts list:', error);
        await ctx.reply(shortcutsText, { parse_mode: 'Markdown' });
    }
}

// Handle callback queries
async function handleCommandCallbacks(ctx) {
    const data = ctx.callbackQuery.data;

    try {
        await ctx.answerCbQuery();

        switch (data) {
            case 'show_shortcuts':
                const shortcutsText = `⚡ *قائمة الاختصارات:*

*🔺 اختصارات الرفع:*
🔹 *ر م* – رفع مميز
🔹 *ر ط* – رفع مطور
🔹 *رط* – رفع مطور (بدون مسافة)
🔹 *ر ث* – رفع مطور ثانوي
🔹 *رث* – رفع مطور ثانوي (بدون مسافة)
🔹 *ر ا* – رفع ادمن
🔹 *را* – رفع ادمن (بدون مسافة)
🔹 *ر س* – رفع مطور أساسي
🔹 *رس* – رفع مطور أساسي (بدون مسافة)


*🔻 اختصارات التنزيل:*
'🔹 <b>ت س</b> – تنزيل اساسي\n' +
🔹 *ت م* – تنزيل مميز
🔹 *ت ط* – تنزيل مطور
🔹 *تط* – تنزيل مطور (بدون مسافة)
🔹 *ت ا* – تنزيل ادمن
🔹 *تا* – تنزيل ادمن (بدون مسافة)

*📋 اختصارات أخرى:*
🔹 *ر ت* – عرض رتبتي
🔹 *رت* – عرض رتبتي (بدون مسافة)`;

                await ctx.editMessageText(shortcutsText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "📜 عرض الأوامر الكاملة", callback_data: "show_commands" },
                                { text: "🔄 تحديث", callback_data: "refresh_shortcuts" }
                            ],
                            [{ text: "❌ إغلاق", callback_data: "close_menu" }]
                        ]
                    }
                });
                break;

            case 'show_commands':
            case 'refresh_commands':
                const commandText = `📜 *قائمة الأوامر:*

*📊 أوامر المعلومات*
🔹 *ايدي* – ظهور الايدي و معرفك
🔹 *رتبتي* – ظهور رتبتك
🔹 *رابط المجموعة* – الحصول على رابط المجموعة

*👥 أوامر الإدارة*
🔹 *رفع امن مسابقات* – رفع ادمن مسابقات
🔹 *تنزيل امن مسابقات* – تنزيل ادمن مسابقات
🔹 *رفع مميز* – رفع مستخدم إلى مميز
🔹 *تنزيل مميز* – تنزيل مستخدم من مميز
🔹 *لستة مميز* – عرض قائمة المميزين
🔹 *رفع ادمن* – ترقية إلى أدمن
🔹 *تنزيل ادمن* – ترقية إلى أدمن
🔹 *رفع منشئ* – ترقية إلى منشئ
🔹 *تنزيل* – إزالة رتبة
🔹 *رفع مطور* – ترقية إلى مطور
🔹 *رفع مطور ثانوي* – ترقية إلى مطور ثانوي
🔹 *تنزيل مطور* – لتنزيل مطور أول أو ثانوي، اذهب إلى خاص البوت كمطور
🔹 *تنزيل اساسي* – تنزيل إلى اساسي
🔹 *رفع اساسي* – ترقية إلى اساسي

*🛡️ أوامر الحماية*
🔹 *كتم* – كتم مستخدم
🔹 *الغاء كتم* – إلغاء كتم مستخدم
🔹 *مسح* – حذف آخر رسالة
🔹 *تثبيت* – تثبيت رسالة
🔹 *طرد* – طرد مستخدم
🔹 *تحذير* – إصدار تحذير لمستخدم
🔹 *تحذيرات* – عرض عدد التحذيرات لمستخدم
🔹 *نداء الجميع* – مناداة جميع الأعضاء

*🖼️ أوامر الوسائط*
🔹 *مسح الصور* – حذف آخر الصور المرسلة
🔹 *منع الصور* – منع إرسال الصور
🔹 *فتح الصور* – السماح بإرسال الصور
🔹 *منع فيديو* – منع إرسال الفيديوهات
🔹 *فتح فيديو* – السماح بإرسال الفيديوهات
🔹 *منع متحركة* – منع إرسال الصور المتحركة
🔹 *فتح متحركة* – السماح بإرسال الصور المتحركة
🔹 *منع ملصقات* – منع إرسال الملصقات
🔹 *فتح ملصقات* – السماح بإرسال الملصقات

*🔗 أوامر الروابط*
🔹 *ازالة الروابط* – حذف الروابط في المجموعة
🔹 *فتح روابط* – السماح بمشاركة الروابط
🔹 *منع روابط* – منع مشاركة الروابط

*🎭 أوامر الترفيه*
🔹 *نكتة* – إرسال نكتة`;

                await ctx.editMessageText(commandText, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "⚡ عرض الاختصارات", callback_data: "show_shortcuts" },
                                
                            ],
                            
                        ]
                    }
                });
                break;

            case 'refresh_shortcuts':
                await handleCommandCallbacks({ ...ctx, callbackQuery: { ...ctx.callbackQuery, data: 'show_shortcuts' } });
                break;

            case 'close_menu':
                await ctx.deleteMessage();
                break;
        }
    } catch (error) {
        console.error('Error handling callback query:', error);
    }
}

function setupCommands(bot) {
    const { setupActions, activeQuizzes, endQuiz,configureQuiz,startAddingCustomQuestions,chatStates, } = require('./actions'); // these were up there
       // Make sure to use this middleware
bot.use(photoRestrictionMiddleware);
bot.use(linkRestrictionMiddleware);
bot.use(videoRestrictionMiddleware);
bot.use(gifRestrictionMiddleware);
bot.use(documentRestrictionMiddleware);
bot.use(stickerRestrictionMiddleware);

    bot.use(async (ctx, next) => {
        try {
            const userId = ctx.from?.id;
            if (!userId) {
                return next();
            }
    
            // Check if the user has a specific rank
            const isDev = await isDeveloper(ctx, userId);
            const isAdmin = await isAdminOrOwner(ctx, userId);
            const isSecDev = await isSecondaryDeveloper(ctx, userId);
    
            // Only proceed with the subscription check if the user is not a dev, admin, or sec dev
            if (!isDev && !isAdmin && !isSecDev) {
                return next();
            }
    
            // allow if it's a private message without buttons
            if (ctx.chat?.type === 'private' && !ctx.callbackQuery) {
                return next();
            }
    
            const requiredChannels = [
                { id: -1002555424660, username: 'sub2vea', title: 'قناة السورس' },
                { id: -1002331727102, username: 'leavemestary', title: 'القناة الرسمية' }
            ];
    
            const channelIds = requiredChannels.map(channel => channel.id);
    
            const response = await axios.post('http://69.62.114.242:80/check-subscription', {
                userId,
                channels: channelIds
            });
    
            const { subscribed } = response.data;
    
            if (subscribed) {
                // user is good -> continue to whatever command they pressed
                return next();
            } else {
                // user is not subscribed -> block everything else and show subscription message
                if (ctx.callbackQuery) {
                    await ctx.answerCbQuery('❌ يرجى الاشتراك أولاً!', { show_alert: true });
                }
    
                const inlineKeyboard = requiredChannels.map(channel => 
                    [{ text: `📢 ${channel.title}`, url: `https://t.me/${channel.username}` }]
                );
                inlineKeyboard.push([{ text: '✅ تحقق من الاشتراك', callback_data: 'check_subscription' }]);
    
                await ctx.reply('⚠️ للاستخدام الكامل للبوت، يرجى الاشتراك في القنوات التالية:', {
                    reply_markup: {
                        inline_keyboard: inlineKeyboard
                    }
                });
            }
        } catch (error) {
            console.error('Middleware subscription check error:', error);
            return next(); // let the bot work even if check fails (fail-safe)
        }
    });
    bot.command('start', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const chatTitle = ctx.chat.title || 'Private Chat';
        const username = ctx.from.username || 'Unknown';
        const firstName = ctx.from.first_name || 'Unknown';
        const lastName = ctx.from.last_name || '';
        const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const currentDate = new Date().toLocaleDateString('en-GB');
        const isDM = ctx.chat.type === 'private';

        console.log('DEBUG: "/start" command triggered by user:', userId, 'in chat type:', ctx.chat.type);

        // Try to assign bot ownership (only works for the first user)
        const ownershipAssigned = await assignBotOwnership(ctx);
        
        // If ownership was just assigned, we can stop here as the welcome message was already sent
        if (ownershipAssigned && isDM) {
            return;
        }

        // Check if the user has a specific rank
        const isDev = await isDeveloper(ctx, userId);
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isSecDev = await isSecondaryDeveloper(ctx, userId);
        const isBotOwn = await isBotOwner(ctx, userId);

        // Only proceed if the user is a dev, admin, sec dev, or bot owner
        if (!isDev && !isAdmin && !isSecDev && !isBotOwn) {
            return ctx.reply('❌ عذرًا، هذا الأمر مخصص للمطورين والمشرفين فقط.');
        }

        if (ctx.from) {
            await updateLastInteraction(
                ctx.from.id, 
                ctx.from.username, 
                ctx.from.first_name, 
                ctx.from.last_name
            );
        }

        // Check if this is the first time the bot is activated in this group
        const db = await ensureDatabaseInitialized();
        const isFirstActivation = await db.collection('activations').findOne({ chat_id: chatId });

        if (!isFirstActivation) {
            // Insert activation record
            await db.collection('activations').insertOne({ chat_id: chatId, activated_at: new Date() });

            // Format the message
            const message = `
                قام شخص بتفعيل البوت...
                ┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉
                معلومات المجموعة:
                الاسم: ${chatTitle}
                الايدي: ${chatId}
                الأعضاء: ${ctx.chat.all_members_are_administrators ? 'Admins Only' : 'Public'}
                ┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉
                معلومات الشخص:
                الاسم: ${firstName} ${lastName}
                المعرف: @${username}
                التاريخ: ${currentDate}
                الساعة: ${currentTime}
            `;

            // Send the message to all developers
            for (const devId of developerIds) {
                await ctx.telegram.sendMessage(devId, message);
            }
        }

        // Check if the user is subscribed
        const subscribed = await checkUserSubscription(ctx);
        if (!subscribed) return; // Stop if not subscribed

        if (isDM) {
            if (isDev || isBotOwn) {
                console.log('DEBUG: Showing developer panel in DM');
                return await showDevPanel(ctx);
            }

            // Fallback welcome (only if necessary)
            const welcomeMessage = 'مرحبا بك في البوت! الرجاء إضافة البوت في مجموعتك الخاصة لغرض الاستخدام.';
            const keyboard = [
                [{ text: '➕ أضفني إلى مجموعتك', url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }],
                [{ text: '📢 قناة السورس', url: 'https://t.me/ctrlsrc' }],
                [{ text: '📢 القناة الرسمية', url: 'https://t.me/T0_B7' }]
            ];
            return ctx.reply(welcomeMessage, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }

        // For groups
        await updateActiveGroup(ctx.chat.id, ctx.chat.title, userId);

        if (isDev || isBotOwn) {
            console.log('DEBUG: Showing developer panel in group');
            return await showDevPanel(ctx);
        }

        const isVIPUser = await isVIP(ctx, userId);

        if (isAdmin || isVIPUser) {
            console.log('DEBUG: User is admin/owner/VIP in group, showing main menu');
            return await showMainMenu(ctx);
        } else {
            console.log('DEBUG: Regular user in group, showing basic message');
            return ctx.reply('للاستفادة من جميع مميزات البوت، يجب أن تكون مشرفًا أو عضوًا مميزًا. يمكنك استخدام الأوامر المتاحة للأعضاء العاديين في المجموعة.');
        }
    } catch (error) {
        console.error('Error handling "start" command:', error);
        ctx.reply('❌ حدث خطأ أثناء معالجة الأمر. يرجى المحاولة مرة أخرى لاحقًا.');
    }
});
    
    bot.action('check_subscription', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const requiredChannels = [
                { id: -1002555424660, username: 'sub2vea', title: 'قناة السورس' },
                { id: -1002331727102, username: 'leavemestary', title: 'القناة الرسمية' }
            ];
    
            // Extract channel IDs for the Axios request
            const channelIds = requiredChannels.map(channel => channel.id);
    
            // Send a POST request to Bot B
            const response = await axios.post('http://69.62.114.242:80/check-subscription', {
                userId,
                channels: channelIds
            });
    
            const { subscribed } = response.data;
    
            if (subscribed) {
                // User is subscribed to all channels
                if (ctx.chat.type === 'private') {
                    // Show developer menu in DMs
                    await showDevPanel(ctx);
                } else {
                    // Show main menu in groups
                    await showMainMenu(ctx);
                }
            } else {
                // User is not subscribed to all channels
                await ctx.answerCbQuery('❌ يرجى الاشتراك في جميع القنوات المطلوبة أولاً.');
                
                const subscriptionMessage = 'لم تشترك في جميع القنوات بعد! لاستخدام البوت بشكل كامل، يرجى الاشتراك في القنوات التالية:';
                
                const inlineKeyboard = requiredChannels.map(channel => 
                    [{ text: `📢 ${channel.title}`, url: `https://t.me/${channel.username}` }]
                );
                inlineKeyboard.push([{ text: '✅ تحقق من الاشتراك مرة أخرى', callback_data: 'check_subscription' }]);
                
                await ctx.editMessageText(subscriptionMessage, {
                    reply_markup: {
                        inline_keyboard: inlineKeyboard
                    }
                });
            }
        } catch (error) {
            console.error('Error in check_subscription action:', error);
            await ctx.answerCbQuery('حدث خطأ أثناء التحقق من الاشتراك.');
        }
    });
    bot.on('new_chat_members', async (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    if (!newMembers || newMembers.length === 0) return;

    const botInfo = await ctx.telegram.getMe();
    const isBotAdded = newMembers.some(member => member.id === botInfo.id);

    if (isBotAdded) {
        const chatTitle = ctx.chat.title || 'Unknown';
        const chatId = ctx.chat.id;

        // ===== Save group to DB =====
        const { getDatabaseForBot } = require('./database');
        const db = await getDatabaseForBot('test'); // FOR GROUP SAVE ON JOIN

        await db.collection('groups').updateOne(
            { group_id: chatId, bot_id: config.botId },
            {
                $set: {
                    group_id: chatId,
                    title: chatTitle,
                    is_active: true,
                    bot_id: config.botId,
                    added_at: new Date()
                }
            },
            { upsert: true }
        );

        console.log(`✅ [@${botInfo.username}] Saved group '${chatTitle}' (${chatId}) for bot_id ${config.botId}`);

        // ===== Get group link =====
        let groupLink = 'Unavailable';
        try {
            const chat = await ctx.telegram.getChat(chatId);
            groupLink = chat.invite_link || 'Unavailable';
        } catch (error) {
            console.error('Error fetching group link:', error);
        }

        // ===== Send notification to owner + developers =====
        const message = `
⌯ تم إضافة/تفعيل البوت إلى المجموعة ⌯
┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉
⌯ اسم المجموعة ⌯: ${chatTitle}
⌯ ايدي المجموعة ⌯: ${chatId}
⌯ رابط المجموعة ⌯: ${groupLink}
        `;

        const recipients = [ownerId, ...developerIds];
        for (const recipientId of recipients) {
            try {
                await ctx.telegram.sendMessage(recipientId, message);
            } catch (error) {
                console.error(`Error sending message to ${recipientId}:`, error);
            }
        }
    }
});
    
    
    bot.on('left_chat_member', async (ctx) => {
    if (!ctx.message.left_chat_member) return;

    const leftMemberId = ctx.message.left_chat_member.id;
    const botInfo = await ctx.telegram.getMe();

    // Check if the bot itself was kicked
    if (leftMemberId === botInfo.id) {
        const chatId = ctx.chat.id;
        const chatTitle = ctx.chat.title || 'Unknown';

        try {
            const db = await ensureDatabaseInitialized('test');

            // 🔍 Get group data for archive (optional)
            const groupData = await db.collection('groups').findOne({
                group_id: chatId,
                bot_id: botInfo.id
            });

            // ✅ Archive the group data before marking inactive (optional but safe)
            if (groupData) {
                await db.collection('groups_archive').insertOne({
                    ...groupData,
                    archived_at: new Date()
                });
            }

            // 🛑 Mark the group as inactive (soft delete)
            await db.collection('groups').updateOne(
                { group_id: chatId, bot_id: botInfo.id },
                {
                    $set: {
                        is_active: false,
                        removed_at: new Date(),
                        cleanup: true
                    }
                }
            );

            // 🧹 Clean up junk data
            await db.collection('quiz_scores').deleteMany({ chatId: chatId });
            await db.collection('custom_questions').deleteMany({ chatId: chatId });
            await db.collection('quiz_settings').deleteMany({ chatId: chatId });

            console.log(`🚪 [@${botInfo.username}] Left group '${chatTitle}' (${chatId}) — marked inactive and cleaned up.`);

            // 📩 Notify the owner (optional)
            const botMeta = await db.collection('groups').findOne({ bot_id: botInfo.id, type: 'bot_info' });
            const ownerId = botMeta?.owner_id;

            if (ownerId) {
                const message = `
🚫 تم طرد البوت من المجموعة
┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉ ┉
👥 *اسم المجموعة:* ${chatTitle}
🆔 *ايدي المجموعة:* ${chatId}
✅ *تم حذف جميع بيانات المجموعة*
📦 *تم أرشفة المجموعة قبل الحذف*
                `;
                try {
                    await ctx.telegram.sendMessage(ownerId, message, { parse_mode: 'Markdown' });
                    console.log(`📬 Notification sent to owner (ID: ${ownerId})`);
                } catch (notifyError) {
                    console.error('⚠️ Failed to notify owner:', notifyError);
                }
            }

        } catch (error) {
            console.error('❌ Error cleaning up group data:', error);
        }
    }
});

    
    // Listen for photo messages
    bot.on('photo', async (ctx, next) => {
        const chatId = ctx.chat.id;
    
        const isBroadcasting = chatBroadcastStates.get(chatId) || false;
    
        if (isBroadcasting) {
            try {
                const photoArray = ctx.message.photo;
                const fileId = photoArray[photoArray.length - 1].file_id;
                const caption = ctx.message.caption || '';
    
                console.log(`Broadcasting photo: ${fileId}`);
    
                await broadcastMessage(ctx, 'photo', fileId, caption);
            } catch (error) {
                console.error('Error broadcasting photo:', error);
            }
        }
    
        // Always call next() so the reply logic in `actions.js` runs
        return next();
    });
    bot.on('video', async (ctx, next) => {
        const chatId = ctx.chat.id;
        const isBroadcasting = chatBroadcastStates.get(chatId) || awaitingBroadcastPhoto;
    
        if (!isBroadcasting) return next(); // Let other handlers deal with it if not broadcasting
    
        try {
            const video = ctx.message.video;
            const fileId = video.file_id;
            const fileSize = video.file_size; // in bytes
            const caption = ctx.message.caption || '';
    
            const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    
            if (fileSize > maxSize) {
                await ctx.reply('❌ الفيديو كبير جدًا. الرجاء إرسال فيديو أقل من 10 ميجابايت.');
                return;
            }
    
            console.log(`Broadcasting video from chat ${chatId}, size: ${fileSize} bytes`);
    
            await broadcastMessage(ctx, 'video', fileId, caption);
    
            if (awaitingBroadcastPhoto) {
                awaitingBroadcastPhoto = false;
                await ctx.reply('✅ تم إرسال الفيديو.\n🛑 تم إيقاف وضع الإذاعة اليدوي.');
            }
        } catch (error) {
            console.error('Error broadcasting video:', error);
            await ctx.reply('❌ حدث خطأ أثناء بث الفيديو.');
        }
    });
    
// Add this callback handler for returning to the main menu
bot.action('back_to_main', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
        // Get the original photo URL
        const photoUrl = 'https://i.postimg.cc/R0jjs1YY/bot.jpg';
        
        // Edit the message to show the main menu again
        await ctx.editMessageMedia(
            {
                type: 'photo',
                media: photoUrl,
                caption: '🤖 مرحبًا! أنا بوت الحماية والمسابقات ايضا. اختر خيارًا:'
            },
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'القناة الاساسية', url: 'https://t.me/ctrlsrc' }],
                        [{ text: '📜🚨  الحماية و الأوامر', callback_data: 'show_commands' }],
                        
                        [{ text: '🎮 بوت المسابقات', callback_data: 'quiz_bot' }],
                        [{ text: 'تابـع جديدنا', url: 'https://t.me/T0_pc' }]
                    ]
                }
            }
        );
    } catch (error) {
        console.error('Error returning to main menu:', error);
        await ctx.reply('❌ حدث خطأ أثناء العودة للقائمة الرئيسية.');
    }
});
bot.command('broadcast', async (ctx) => {
    const chatId = ctx.chat.id;
    const isBroadcasting = chatBroadcastStates.get(chatId) || false;

    if (isBroadcasting) {
        chatBroadcastStates.set(chatId, false);
        await ctx.reply('🛑 تم إيقاف وضع الإذاعة.');
    } else {
        chatBroadcastStates.set(chatId, true);
        await ctx.reply('📢 وضع الإذاعة . يمكنك الآن إرسال الصور للبث يرجى استخدام الامر مرة اخرى للايقاف .');
    }
});

bot.hears('broadcast', async (ctx) => {
    // Check if the user has the required permissions
    if (!await hasRequiredPermissions(ctx, ctx.from.id)) {
        return ctx.reply('❌ ليس لديك الصلاحيات اللازمة لاستخدام هذا الأمر.');
    }

    // Example usage: broadcast <mediaType> <mediaId> <caption>
    const args = ctx.message.text.split(' ').slice(1);
    const mediaType = args[0]; // e.g., 'photo', 'video'
    const mediaId = args[1]; // Telegram file ID
    const caption = args.slice(2).join(' '); // The rest is the caption

    await broadcastMessage(ctx, mediaType, mediaId, caption);
});
// Add this to your existing command handlers
bot.hears('رابط المجموعة', (ctx) => getGroupLink(ctx));
bot.command('رابط_المجموعة', (ctx) => getGroupLink(ctx));
bot.hears('نداء الجميع', adminOnly((ctx) => callEveryone(ctx, true)));


bot.command('promote', (ctx) => promoteUser(ctx, 'مطور'));
bot.command('promote', (ctx) => promoteUser(ctx, 'developer'));
bot.command('مساعدة', showHelp);
bot.hears('مساعدة', showHelp);
bot.command('تنزيل مطور', async (ctx) => {
    await demoteUser(ctx, 'developer');
});
;
bot.hears(/^تنزيل مطور/, async (ctx) => {
    await demoteUser(ctx, 'developer');
});
bot.hears('كتم', adminOnly((ctx) => muteUser(ctx, true)));
bot.hears('الغاء_كتم', adminOnly((ctx) => muteUser(ctx, false)));
bot.command('مسح', adminOnly((ctx) => deleteLatestMessage(ctx)));
bot.command('تثبيت', adminOnly((ctx) => pinMessage(ctx)));
bot.command('نكتة', adminOnly((ctx) => sendJoke(ctx)));
bot.command('طرد', adminOnly((ctx) => kickUser(ctx)));
// Add these command handlers
bot.command('لستة_مميز', listVIPUsers);
bot.hears('لستة مميز', listVIPUsers);
bot.command('قائمة_المميزين', listVIPUsers);
bot.hears('قائمة المميزين', listVIPUsers);
// Command handler for "ترقية_ثانوي"
bot.command('ترقية_ثانوي', promoteToSecondaryDeveloper);

// Text handler for "ترقية ثانوي" (without underscore)
bot.hears(/^رفع ثانوي/, promoteToSecondaryDeveloper);

// Add these command handlers for sticker restriction
bot.command('منع_ملصقات', adminOnly((ctx) => disableStickerSharing(ctx)));
bot.command('تفعيل_ملصقات', adminOnly((ctx) => enableStickerSharing(ctx)));

// Also add handlers for text commands without the underscore
bot.hears('منع ملصقات', adminOnly((ctx) => disableStickerSharing(ctx)));
bot.hears('فتح ملصقات', adminOnly((ctx) => enableStickerSharing(ctx)));
bot.command('ترقية_مشرف_بوت', promoteToBotAdmin);
bot.hears('رفع ادمن', promoteToBotAdmin);

bot.command('ازالة_مشرف_بوت', removeBotAdmin);
bot.hears('تنزيل ادمن', removeBotAdmin);
// Additional handler for flexibility
bot.hears(/^رفع مطور ثانوي/, promoteToSecondaryDeveloper);
bot.hears('تنزيل', (ctx) => demoteUser(ctx));
// Add these lines to your existing command handlers
bot.command('ترقية_مطور', async (ctx) => {
    await promoteUser(ctx, 'مطور');
});

// Add these command handlers for the new command
bot.command('رفع_اساسي', promoteToBotOwner);
bot.hears(/^رفع اساسي/, promoteToBotOwner);


//shortcuts 
//bot.hears(/^رفع مميز/, promoteToImportant);
bot.hears(/^ر م/, promoteToImportant); // Shortcut for رفع مميز
bot.hears(/^رم/, promoteToImportant); // Alternative shortcut without space
bot.command('رم', promoteToImportant); // Command version of the shortcut
bot.command('ر_م', promoteToImportant); // Command version with underscore

// Similarly, let's add shortcuts for demoting VIP users
//bot.hears(/^تنزيل مميز/, demoteFromImportant);
bot.hears(/^ت م/, demoteFromImportant); // Shortcut for تنزيل مميز
bot.hears(/^تم/, demoteFromImportant); // Alternative shortcut without space
bot.command('تم', demoteFromImportant); // Command version of the shortcut
bot.command('ت_م', demoteFromImportant); // Command version with underscore

// Let's also add shortcuts for listing VIP users
//bot.hears('لستة مميز', listImportantUsers);
bot.hears('ل م', listImportantUsers); // Shortcut for لستة مميز
bot.hears('لم', listImportantUsers); // Alternative shortcut without space
bot.command('لم', listImportantUsers); // Command version of the shortcut
bot.command('ل_م', listImportantUsers); // Command version with underscore

// for id 
bot.hears('ايدي', (ctx) => showUserId(ctx));
bot.hears('اد', (ctx) => showUserId(ctx));
bot.hears('ا د', (ctx) => showUserId(ctx));


bot.hears(/^ر ا/, promoteToBotOwner); // Shortcut for رفع اساسي
bot.hears(/^را/, promoteToBotOwner); // Alternative shortcut without space
bot.command('را', promoteToBotOwner); // Command version of the shortcut
bot.command('ر_ا', promoteToBotOwner); // Command version with underscores



// Add shortcuts for تنزيل اساسي
bot.hears(/^ت س/, demoteFromBotOwner); // Shortcut for تنزيل اساسي
bot.hears(/^تس/, demoteFromBotOwner); // Alternative shortcut without space
bot.command('تا', demoteFromBotOwner); // Command version of the shortcut
bot.command('ت_ا', demoteFromBotOwner); // Command version with underscore








// Add these command handlers to your bot setup
bot.command('رفع_مميز', promoteToImportant);
//bot.hears(/^رفع مميز/, promoteToImportant);
bot.command('تنزيل_مميز', demoteFromImportant);
//bot.hears(/^تنزيل مميز/, demoteFromImportant);

// Update command handlers for listing important users
bot.command('لستة_مميز', listImportantUsers);
bot.hears('لستة مميز', listImportantUsers);
bot.command('قائمة_المميزين', listImportantUsers);
bot.hears('قائمة المميزين', listImportantUsers);
bot.hears(/^رفع مطور/, async (ctx) => {
    await promoteUser(ctx, 'مطور');
});
// Handle "نكتة" text command
bot.hears('نكتة', adminOnly((ctx) => sendJoke(ctx)));
bot.command('مسح الصور', adminOnly((ctx) => deleteLatestPhotos(ctx)));
bot.command('ازالة الروابط', adminOnly((ctx) => removeLinks(ctx)));
bot.hears('ازالة الروابط', (ctx) => removeLinks(ctx));
bot.command('معرفي', (ctx) => showUserId(ctx));
bot.hears('مسح الصور', (ctx) => deleteLatestPhotos(ctx));
bot.hears('ايدي', (ctx) => showUserId(ctx));
bot.command('تنزيل', adminOnly((ctx) => demoteUser(ctx)));
bot.hears('تنزيل', adminOnly((ctx) => demoteUser(ctx)));
bot.hears('فتح روابط', adminOnly((ctx) => enableLinkSharing(ctx)));
bot.hears('منع روابط', adminOnly((ctx) => disableLinkSharing(ctx)));
bot.hears('تثبيت', adminOnly((ctx) => pinMessage(ctx)));
bot.hears('مسح', adminOnly((ctx) => deleteLatestMessage(ctx)));
bot.command('مسح', adminOnly((ctx) => deleteLatestMessage(ctx)));
bot.command('تثبيت', adminOnly((ctx) => pinMessage(ctx)));
bot.command('نكتة', adminOnly((ctx) => sendJoke(ctx)));
bot.command('طرد', adminOnly((ctx) => kickUser(ctx)));
bot.hears('طرد', adminOnly((ctx) => kickUser(ctx)));
// Add these command handlers
bot.command('كتم', (ctx) => muteUser(ctx, true));
bot.command('الغاء_كتم', (ctx) => muteUser(ctx, false));

// Add these hears handlers
bot.hears('كتم', (ctx) => muteUser(ctx, true));
bot.hears('الغاء كتم', (ctx) => muteUser(ctx, false));
// Handle "نكتة" text command
bot.hears('نكتة', adminOnly((ctx) => sendJoke(ctx)));

bot.command('مسح الصور', adminOnly((ctx) => deleteLatestPhotos(ctx)));
bot.command('ازالة_الروابط', adminOnly((ctx) => removeLinks(ctx)));

bot.command('منع الصور', adminOnly((ctx) => disablePhotoSharing(ctx)));

bot.command('تفعيل الصور', adminOnly((ctx) => enablePhotoSharing(ctx)));

bot.hears('منع الصور', adminOnly((ctx) => disablePhotoSharing(ctx)));
bot.hears('فتح الصور', adminOnly((ctx) => enablePhotoSharing(ctx)));
// Add command handlers for promoting and demoting VIP users
bot.command('ترقية_مميز', (ctx) => promoteUser(ctx, 'مميز'));
bot.command('تنزيل_مميز', demoteUser);

// Add hears handlers for promoting and demoting VIP users
bot.hears(/^رفع  مسابقات/, (ctx) => promoteUser(ctx, 'مميز'));
bot.hears(/^تنزيل ادمن مسابقات/, demoteUser);

bot.command('معرفي', (ctx) => showUserId(ctx));

bot.hears('ايدي', (ctx) => showUserId(ctx));
bot.command('تنزيل', adminOnly((ctx) => demoteUser(ctx)));
bot.hears('تنزيل', adminOnly((ctx) => demoteUser(ctx)));

bot.command('كتم', adminOnly((ctx) => muteUser(ctx, true)));
bot.command('الغاء_كتم', adminOnly((ctx) => muteUser(ctx, false)));

bot.command('منع فيديو', adminOnly((ctx) => disableVideoSharing(ctx)));
bot.command('تفعيل فيديو', adminOnly((ctx) => enableVideoSharing(ctx)));

// Also add handlers for text commands without the slash
bot.hears('منع فيديو', adminOnly((ctx) => disableVideoSharing(ctx)));
bot.hears('فتح فيديو', adminOnly((ctx) => enableVideoSharing(ctx)));
bot.command('منع_متحركة', adminOnly((ctx) => disableGifSharing(ctx)));
bot.command('تفعيل_متحركة', adminOnly((ctx) => enableGifSharing(ctx)));

// Also add handlers for text commands without the underscore
bot.hears('منع متحركة', adminOnly((ctx) => disableGifSharing(ctx)));
bot.hears('فتح متحركة', adminOnly((ctx) => enableGifSharing(ctx)));
bot.command('ترقية_مطور', (ctx) => promoteUser(ctx, 'مطور'));
bot.hears(/^ترقية مطوسر/, (ctx) => promoteUser(ctx, 'مطور'));


bot.command('منع_مستندات', adminOnly((ctx) => disableDocumentSharing(ctx)));
bot.command('تفعيل_مستندات', adminOnly((ctx) => enableDocumentSharing(ctx)));
bot.command('رتبتي', checkUserRank);
    bot.hears('رتبتي', checkUserRank);
// Also add handlers for text commands without the underscore
//bot.hears('منع مستندات', adminOnly((ctx) => disableDocumentSharing(ctx)));
//bot.hears('تفعيل مستندات', adminOnly((ctx) => enableDocumentSharing(ctx)));
// Add this handler for the warning command
bot.hears('تحذير', async (ctx) => {
    try {
        // Check if this is a reply to another message
        if (!ctx.message.reply_to_message) {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم لتحذيره.');
        }

        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const targetUserId = ctx.message.reply_to_message.from.id;
        const targetUserName = ctx.message.reply_to_message.from.first_name || 'المستخدم';

        // Check if user has admin permissions or is a premium user or has the specific ID
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isPremium = await isPremiumUser(userId);
        const isSpecificUser = userId === 7308214106;

        if (!isAdmin && !isPremium && !isSpecificUser) {
            return ctx.reply('❌ عذراً، هذا الأمر متاح فقط للمشرفين والمستخدمين المميزين.');
        }

        // Initialize user warnings if not already done
        const db = await ensureDatabaseInitialized();
        
        // Get current warning count for this user in this chat
        const userWarning = await db.collection('warnings').findOne({
            chat_id: chatId,
            user_id: targetUserId
        });

        // Define warning state object
        const warningState = userWarning || {
            chat_id: chatId,
            user_id: targetUserId,
            count: 0,
            last_warned_at: new Date()
        };

        // Increment warning count
        warningState.count += 1;
        warningState.last_warned_at = new Date();

        // Update or insert the warning record
        await db.collection('warnings').updateOne(
            { chat_id: chatId, user_id: targetUserId },
            { $set: warningState },
            { upsert: true }
        );

        // Get warning settings for this chat
        const settings = await db.collection('warning_settings').findOne({ chat_id: chatId }) || {
            kick: 5,
            mute: 3,
            restrictMedia: 2
        };

        // Check if action needs to be taken based on warning count
        let actionTaken = '';
        if (warningState.count >= settings.kick) {
            // Kick user
            try {
                await ctx.telegram.kickChatMember(chatId, targetUserId, {
                    until_date: Math.floor(Date.now() / 1000) + 60 // Ban for 1 minute (minimum allowed)
                });
                actionTaken = '🚫 تم طرد المستخدم من المجموعة بسبب تجاوز عدد التحذيرات المسموح بها.';
                
                // Reset warnings after kick
                await db.collection('warnings').updateOne(
                    { chat_id: chatId, user_id: targetUserId },
                    { $set: { count: 0 } }
                );
            } catch (error) {
                console.error('Error kicking user:', error);
                actionTaken = '❌ فشل طرد المستخدم. تأكد من أن البوت لديه صلاحيات كافية.';
            }
        } else if (warningState.count >= settings.mute) {
            // Mute user
            try {
                await ctx.telegram.restrictChatMember(chatId, targetUserId, {
                    until_date: Math.floor(Date.now() / 1000) + 3600, // Mute for 1 hour
                    permissions: {
                        can_send_messages: false,
                        can_send_media_messages: false,
                        can_send_polls: false,
                        can_send_other_messages: false,
                        can_add_web_page_previews: false
                    }
                });
                actionTaken = '🔇 تم كتم المستخدم لمدة ساعة بسبب تجاوز عدد التحذيرات.';
            } catch (error) {
                console.error('Error muting user:', error);
                actionTaken = '❌ فشل كتم المستخدم. تأكد من أن البوت لديه صلاحيات كافية.';
            }
        } else if (warningState.count >= settings.restrictMedia) {
            // Restrict media
            try {
                await ctx.telegram.restrictChatMember(chatId, targetUserId, {
                    until_date: Math.floor(Date.now() / 1000) + 1800, // Restrict for 30 minutes
                    permissions: {
                        can_send_messages: true,
                        can_send_media_messages: false,
                        can_send_polls: false,
                        can_send_other_messages: false,
                        can_add_web_page_previews: false
                    }
                });
                actionTaken = '📵 تم منع المستخدم من إرسال الوسائط لمدة 30 دقيقة بسبب تجاوز عدد التحذيرات.';
            } catch (error) {
                console.error('Error restricting user media:', error);
                actionTaken = '❌ فشل تقييد وسائط المستخدم. تأكد من أن البوت لديه صلاحيات كافية.';
            }
        }

        // Send warning message with user tag
        await ctx.replyWithHTML(`⚠️ تحذير للمستخدم <a href="tg://user?id=${targetUserId}">${targetUserName}</a>!\n\n📊 عدد التحذيرات: ${warningState.count}/${settings.kick}\n\n${actionTaken}`);
    } catch (error) {
        console.error('Error in warning command:', error);
        await ctx.reply('❌ حدث خطأ أثناء تنفيذ أمر التحذير. يرجى المحاولة مرة أخرى.');
    }
});


// Add these command handlers in your setupCommands function
bot.command('report', reportMessage);
bot.command('ابلاغ', reportMessage);
bot.hears(/^ابلاغ$/, reportMessage);
bot.hears(/^تبليغ$/, reportMessage);
bot.command('تبليغ', reportMessage);

// Handle the command with buttons
bot.hears(['الأوامر', 'اوامر', 'الاوامر'], async (ctx) => {
    await sendCommandListTelegraf(ctx);
});

// Add this near your other command handlers
bot.command('stop', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        
        // Check if the user is a bot admin or owner
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isBotAdm = await isBotAdmin(ctx, userId);
        const isBotOwn = await isBotOwner(ctx, userId);
        const isVIPUser = await isVIP(ctx, userId);
        // Only allow bot admins and owners to stop quizzes
        if (!isAdmin && !isBotAdm && !isBotOwn) {
            return ctx.reply('❌ عذراً، هذا الأمر متاح فقط للمشرفين ومالك البوت.');
        }
        
        if (activeQuizzes.has(chatId)) {
            await endQuiz(ctx, chatId);
            await ctx.reply('✅ تم إيقاف المسابقة بنجاح.');
        } else {
            await ctx.reply('ℹ️ لا توجد مسابقة نشطة حالياً.');
        }
    } catch (error) {
        console.error('Error handling stop command:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة إيقاف المسابقة.');
    }
});
 // Add this action handler for the show_stats button
bot.action('show_stats', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        const stats = await database.getUserStatistics(userId);
        
        // Create a visually appealing statistics message
        let statsMessage = `📊 *إحصائياتك في المسابقات* 📊\n\n`;
        
        // Add user info
        statsMessage += `👤 *المستخدم:* ${ctx.from.first_name}\n`;
        statsMessage += `🆔 *المعرف:* @${ctx.from.username || 'غير متوفر'}\n\n`;
        
        // Add statistics with emojis
        statsMessage += `🏆 *المركز في قائمة المتصدرين:* ${stats.rank}\n`;
        statsMessage += `💯 *مجموع النقاط:* ${stats.totalScore} نقطة\n`;
        statsMessage += `🎮 *عدد المسابقات المشارك بها:* ${stats.quizCount}\n`;
        statsMessage += `✅ *الإجابات الصحيحة:* ${stats.correctAnswers}\n`;
        statsMessage += `📝 *إجمالي الإجابات:* ${stats.totalAnswers}\n`;
        statsMessage += `🎯 *نسبة الدقة:* ${stats.accuracy}%\n\n`;
        
        // Add motivational message based on performance
        if (stats.accuracy >= 80) {
            statsMessage += `🌟 *رائع!* أداؤك ممتاز في المسابقات. استمر!`;
        } else if (stats.accuracy >= 50) {
            statsMessage += `👍 *جيد!* أنت في الطريق الصحيح. واصل التقدم!`;
        } else if (stats.totalAnswers > 0) {
            statsMessage += `💪 *لا بأس!* استمر في المحاولة وستتحسن نتائجك.`;
        } else {
            statsMessage += `🚀 *ابدأ الآن!* شارك في المسابقات لتظهر إحصائياتك هنا.`;
        }
        
        // Add back button
        const replyMarkup = {
            inline_keyboard: [
                [{ text: '🔙 العودة لقائمة المسابقات', callback_data: 'back_to_quiz_menu' }]
            ]
        };
        
        // Send the statistics message
        if (ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(statsMessage, {
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            });
        } else {
            await ctx.editMessageText(statsMessage, {
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            });
        }
    } catch (error) {
        console.error('Error showing user statistics:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء عرض الإحصائيات.');
        await ctx.reply('عذرًا، حدث خطأ أثناء محاولة عرض إحصائياتك. الرجاء المحاولة مرة أخرى لاحقًا.');
    }
});     
// Add this callback query handler
bot.action('list_secondary_devs', async (ctx) => {
    await ctx.answerCbQuery();
    await listSecondaryDevelopers(ctx);
});

 bot.action('add_custom_questions', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const userId = ctx.from.id;
        
        // Check if the user is premium
        const isPremium = await isPremiumUser(userId);
        
        if (isPremium) {
            // User is premium, allow adding custom questions
            await startAddingCustomQuestions(ctx);
        } else {
            // User is not premium, show subscription message
            const subscriptionMessage = '⭐ هذه الميزة متاحة فقط للمستخدمين المميزين (Premium).\n\nيرجى التواصل مع المطور للحصول على اشتراك مميز.';
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: '💬 التواصل مع المطور', url: 'https://t.me/Lorisiv' }],
                    [{ text: '🔙 العودة', callback_data: 'back_to_quiz_menu' }]
                ]
            };
            
            if (ctx.callbackQuery.message.photo) {
                await ctx.editMessageCaption(subscriptionMessage, {
                    reply_markup: keyboard
                });
            } else {
                await ctx.editMessageText(subscriptionMessage, {
                    reply_markup: keyboard
                });
            }
        }
    } catch (error) {
        console.error('Error handling add_custom_questions action:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة إضافة أسئلة مخصصة.');
    }
});
// Add this function to remove a specific VIP user
async function removeVIPUser(ctx, targetUserId) {
    try {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        
        // Check if user has admin permissions
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isDev = await isDeveloper(ctx, userId);
        
        if (!isAdmin && !isDev) {
            return ctx.reply('❌ عذراً، هذا الأمر متاح فقط للمشرفين والمطورين.');
        }
        
        // Get the database
        const db = await ensureDatabaseInitialized();
        
        // Remove the user from important_users collection
        const result = await db.collection('important_users').deleteOne({
            chat_id: chatId,
            user_id: targetUserId
        });
        
        if (result.deletedCount > 0) {
            // Try to get user information
            let userInfo = 'المستخدم';
            try {
                const chatMember = await ctx.telegram.getChatMember(chatId, targetUserId);
                userInfo = chatMember.user.first_name || 'المستخدم';
                if (chatMember.user.username) {
                    userInfo += ` (@${chatMember.user.username})`;
                }
            } catch (error) {
                console.log(`Couldn't get info for user ${targetUserId}: ${error.message}`);
            }
            
            return ctx.reply(`✅ تم إزالة ${userInfo} من قائمة المستخدمين المميزين (VIP) بنجاح.`);
        } else {
            return ctx.reply('❌ هذا المستخدم ليس في قائمة المستخدمين المميزين (VIP).');
        }
    } catch (error) {
        console.error('Error removing VIP user:', error);
        return ctx.reply('❌ حدث خطأ أثناء محاولة إزالة المستخدم من قائمة المميزين.');
    }
}
async function listImportantUsers(ctx) {
    try {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        
        // Check if user has admin permissions
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isDev = await isDeveloper(ctx, userId);
        
        if (!isAdmin && !isDev) {
            return ctx.reply('❌ عذراً، هذا الأمر متاح فقط للمشرفين والمطورين.');
        }

        const db = await ensureDatabaseInitialized();
        const importantUsers = await db.collection('important_users').find({ chat_id: chatId }).toArray();

        if (importantUsers.length === 0) {
            return ctx.reply('📋 لا يوجد مستخدمين مميزين (VIP) حالياً في هذه المجموعة.');
        }

        let message = '📋 *قائمة المستخدمين المميزين (VIP):*\n\n';
        
        // Create inline keyboard with remove buttons for each user
        const inlineKeyboard = [];
        
        // Loop through each important user and get their info
        for (const user of importantUsers) {
            try {
                // Try to get user information from Telegram
                const chatMember = await ctx.telegram.getChatMember(chatId, user.user_id);
                const firstName = chatMember.user.first_name || 'مستخدم';
                const username = chatMember.user.username ? `@${chatMember.user.username}` : '';
                
                message += `• ${firstName} ${username} (ID: ${user.user_id})\n`;
                
                // Add a button to remove this user
                inlineKeyboard.push([{
                    text: `❌ إزالة ${firstName}`,
                    callback_data: `remove_vip:${user.user_id}`
                }]);
            } catch (error) {
                // If we can't get user info, just show the ID
                console.log(`Couldn't get info for user ${user.user_id}: ${error.message}`);
                message += `• مستخدم (ID: ${user.user_id})\n`;
                
                // Add a button to remove this user
                inlineKeyboard.push([{
                    text: `❌ إزالة المستخدم ${user.user_id}`,
                    callback_data: `remove_vip:${user.user_id}`
                }]);
            }
        }
        
        // Add a button to remove all VIP users
        inlineKeyboard.push([{
            text: '🗑️ إزالة جميع المستخدمين المميزين',
            callback_data: 'remove_all_vip'
        }]);
        
        // Add a back button
        inlineKeyboard.push([{
            text: '🔙 رجوع',
            callback_data: 'back_to_admin_menu'
        }]);
        
        // Send the message with the inline keyboard
        return ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        });
    } catch (error) {
        console.error('Error listing important users:', error);
        return ctx.reply('❌ حدث خطأ أثناء محاولة عرض قائمة المستخدمين المميزين.');
    }
}
// Add these action handlers for removing VIP users
bot.action(/^remove_vip:(\d+)$/, async (ctx) => {
    try {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        const targetUserId = ctx.match[1];
        
        // Check if user has admin permissions
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isDev = await isDeveloper(ctx, userId);
        
        if (!isAdmin && !isDev) {
            return ctx.answerCbQuery('❌ عذراً، هذا الإجراء متاح فقط للمشرفين والمطورين.', { show_alert: true });
        }
        
        // Get the database
        const db = await ensureDatabaseInitialized();
        
        // Remove the user from important_users collection
        const result = await db.collection('important_users').deleteOne({
            chat_id: chatId,
            user_id: parseInt(targetUserId)
        });
        
        if (result.deletedCount > 0) {
            await ctx.answerCbQuery('✅ تم إزالة المستخدم من قائمة المميزين بنجاح.', { show_alert: true });
            
            // Refresh the list
            await listImportantUsers(ctx);
        } else {
            await ctx.answerCbQuery('❌ لم يتم العثور على المستخدم في قائمة المميزين.', { show_alert: true });
        }
    } catch (error) {
        console.error('Error removing VIP user:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء محاولة إزالة المستخدم من قائمة المميزين.', { show_alert: true });
    }
});

bot.action('remove_all_vips', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        
        // Check if user has admin permissions
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isDev = await isDeveloper(ctx, userId);
        
        if (!isAdmin && !isDev) {
            return ctx.answerCbQuery('❌ عذراً، هذا الإجراء متاح فقط للمشرفين والمطورين.', { show_alert: true });
        }
        
        // Confirm removal
        await ctx.answerCbQuery('⚠️ هل أنت متأكد من رغبتك في إزالة جميع المستخدمين المميزين؟', { show_alert: true });
        
        // Show confirmation dialog
        await ctx.editMessageText('⚠️ *تأكيد الإزالة*\n\nهل أنت متأكد من رغبتك في إزالة *جميع* المستخدمين المميزين من هذه المجموعة؟', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ نعم، إزالة الجميع', callback_data: 'confirm_remove_all_vips' },
                        { text: '❌ لا، إلغاء', callback_data: 'cancel_remove_all_vips' }
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('Error in remove_all_vips action:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء معالجة الطلب.', { show_alert: true });
    }
});

bot.action('confirm_remove_all_vips', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        
        // Check if user has admin permissions
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isDev = await isDeveloper(ctx, userId);
        
        if (!isAdmin && !isDev) {
            return ctx.answerCbQuery('❌ عذراً، هذا الإجراء متاح فقط للمشرفين والمطورين.', { show_alert: true });
        }
        
        // Get the database
        const db = await ensureDatabaseInitialized();
        
        // Remove all VIP users for this chat
        const result = await db.collection('important_users').deleteMany({ chat_id: chatId });
        
        if (result.deletedCount > 0) {
            await ctx.answerCbQuery(`✅ تم إزالة ${result.deletedCount} مستخدم من قائمة المميزين بنجاح.`, { show_alert: true });
            await ctx.editMessageText('✅ تم إزالة جميع المستخدمين المميزين من هذه المجموعة بنجاح.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 رجوع', callback_data: 'back_to_main' }]
                    ]
                }
            });
        } else {
            await ctx.answerCbQuery('ℹ️ لا يوجد مستخدمين مميزين لإزالتهم.', { show_alert: true });
            await ctx.editMessageText('ℹ️ لا يوجد مستخدمين مميزين لإزالتهم.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 رجوع', callback_data: 'back_to_main' }]
                    ]
                }
            });
        }
    } catch (error) {
        console.error('Error removing all VIP users:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء محاولة إزالة المستخدمين المميزين.', { show_alert: true });
        await ctx.editMessageText('❌ حدث خطأ أثناء محاولة إزالة المستخدمين المميزين. يرجى المحاولة مرة أخرى لاحقًا.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 رجوع', callback_data: 'back_to_main' }]
                ]
            }
        });
    }
});

bot.action('cancel_remove_all_vips', async (ctx) => {
    await ctx.answerCbQuery('✅ تم إلغاء العملية.', { show_alert: true });
    await listImportantUsers(ctx);
});

// Add this function to remove all VIP users
async function removeAllVIPUsers(ctx) {
    try {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        
        // Check if user has admin permissions
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isDev = await isDeveloper(ctx, userId);
        
        if (!isAdmin && !isDev) {
            return ctx.reply('❌ عذراً، هذا الأمر متاح فقط للمشرفين والمطورين.');
        }
        
        // Get the database
        const db = await ensureDatabaseInitialized();
        
        // Count how many users will be removed
        const count = await db.collection('important_users').countDocuments({ chat_id: chatId });
        
        if (count === 0) {
            return ctx.reply('📋 لا يوجد مستخدمين مميزين (VIP) في هذه المجموعة.');
        }
        
        // Remove all VIP users for this chat
        await db.collection('important_users').deleteMany({ chat_id: chatId });
        
        return ctx.reply(`✅ تم إزالة جميع المستخدمين المميزين (VIP) من هذه المجموعة. (${count} مستخدم)`);
    } catch (error) {
        console.error('Error removing all VIP users:', error);
        return ctx.reply('❌ حدث خطأ أثناء محاولة إزالة جميع المستخدمين المميزين.');
    }
}   

// Add this action handler for the configure_quiz button
bot.action('configure_quiz', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await configureQuiz(ctx);
    } catch (error) {
        console.error('Error handling configure_quiz action:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة فتح إعدادات المسابقة.');
    }
});

bot.action('add_another_question', async (ctx) => {
    await ctx.answerCbQuery();
    await startAddingCustomQuestions(ctx);
});

bot.action('back_to_quiz_menu', async (ctx) => {
    await ctx.answerCbQuery();
    chatStates.delete(ctx.chat.id);
    await showQuizMenu(ctx);
});

// Update the "بدء" command handler
// Now update the "بدء" command handler
// Update the "بدء" command handler
bot.hears('بدء', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        // First, try to assign ownership (this will only work for the first user)
        const ownershipAssigned = await assignBotOwnership(ctx);
        
        // If ownership was just assigned to this user, we don't need to do the other checks
        if (ownershipAssigned) {
            console.log(`DEBUG: Ownership assigned to user ${userId}`);
            return; // Exit early since we already sent the ownership confirmation message
        }
        
        // If we get here, either:
        // 1. The bot already had an owner (not this user)
        // 2. The bot already had an owner (this user)
        
        // Check if the current user is the owner
        if (userId === ownerId) {
            console.log(`DEBUG: Owner ${userId} used the بدء command`);
            
            // Owner can always use the command
            const subscribed = await checkUserSubscription(ctx);
            
            if (subscribed) {
                if (ctx.chat.type === 'private') {
                    console.log('DEBUG: Showing Dev Panel to owner (private)');
                    await showDevPanel(ctx);
                } else {
                    console.log('DEBUG: Showing Main Menu to owner (group)');
                    await showMainMenu(ctx);
                }
            } else {
                console.log('DEBUG: Owner not subscribed, sending subscription buttons.');
                const subscriptionMessage = '⚠️ لم تشترك في جميع القنوات بعد! يرجى الاشتراك:';

                const inlineKeyboard = [
                    [{ text: '📢 قناة السورس', url: 'https://t.me/sub2vea' }],
                    [{ text: '📢 القناة الرسمية', url: 'https://t.me/leavemestary' }],
                    [{ text: '✅ تحقق من الاشتراك', callback_data: 'check_subscription' }]
                ];

                await ctx.reply(subscriptionMessage, {
                    reply_markup: { inline_keyboard: inlineKeyboard }
                });
            }
            return;
        }
        
        // If we get here, the user is not the owner
        // Check if they are a secondary developer, admin, or VIP
        const isSecDev = await isSecondaryDeveloper(ctx, userId);
        const isVIPUser = await isVIP(ctx, userId);
        const isDev = await isDeveloper(ctx, userId);
        const isBotOwn = await isBotOwner(ctx, userId);
        const isBotAdm = await isBotAdmin(ctx, userId);
       

        // Only proceed if the user is a dev, admin, sec dev, bot admin, or bot owner
        if (!isDev && !isSecDev && !isBotOwn && !isBotAdm) {
            return ctx.reply('❌ عذرًا، هذا الأمر مخصص للمطورين والمشرفين فقط.');
        }

        if (ctx.from) {
            await updateLastInteraction(
                ctx.from.id, 
                ctx.from.username, 
                ctx.from.first_name, 
                ctx.from.last_name
            );
        }

        const subscribed = await checkUserSubscription(ctx);

        console.log(`DEBUG: بدء triggered | userId: ${userId} | subscribed: ${subscribed}`);

        if (subscribed) {
            if (ctx.chat.type === 'private') {
                console.log('DEBUG: Showing Dev Panel (private)');
                await showDevPanel(ctx);
            } else {
                console.log('DEBUG: Showing Main Menu (group)');
                await showMainMenu(ctx);
            }
        } else {
            console.log('DEBUG: User not subscribed, sending subscription buttons.');
            const subscriptionMessage = '⚠️ لم تشترك في جميع القنوات بعد! يرجى الاشتراك:';

            const inlineKeyboard = [
                [{ text: '📢 قناة السورس', url: 'https://t.me/sub2vea' }],
                [{ text: '📢 القناة الرسمية', url: 'https://t.me/leavemestary' }],
                [{ text: '✅ تحقق من الاشتراك', callback_data: 'check_subscription' }]
            ];

            await ctx.reply(subscriptionMessage, {
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
        }
    } catch (error) {
        console.error('Error handling "بدء" command:', error);
        ctx.reply('يرجى التواصل مع صانع البوت او المالك ');
    }
});
// Add this function to your commands.js file
async function listVIPUsers(ctx) {
    try {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        
        // Check if user has admin permissions
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isDev = await isDeveloper(ctx, userId);
        
        if (!isAdmin && !isDev) {
            return ctx.reply('❌ عذراً، هذا الأمر متاح فقط للمشرفين والمطورين.');
        }
        
        // Get the database
        const db = await ensureDatabaseInitialized();
        
        // Find all important users for this chat
        const importantUsers = await db.collection('important_users').find({
            chat_id: chatId
        }).toArray();
        
        if (!importantUsers || importantUsers.length === 0) {
            return ctx.reply('📋 لا يوجد مستخدمين مميزين (VIP) في هذه المجموعة.');
        }
        
        let message = '📋 *قائمة المستخدمين المميزين (VIP):*\n\n';
        
        // Create inline keyboard with delete buttons
        const inlineKeyboard = [];
        
        // Loop through each important user and get their info
        for (const user of importantUsers) {
            try {
                // Try to get user information from Telegram
                const chatMember = await ctx.telegram.getChatMember(chatId, user.user_id);
                const firstName = chatMember.user.first_name || 'مستخدم';
                const username = chatMember.user.username ? `@${chatMember.user.username}` : '';
                
                message += `• ${firstName} ${username} (ID: ${user.user_id})\n`;
                
                // Add a button to remove this user
                inlineKeyboard.push([{
                    text: `❌ إزالة ${firstName}`,
                    callback_data: `remove_vip:${user.user_id}`
                }]);
            } catch (error) {
                // If we can't get user info, just show the ID
                console.log(`Couldn't get info for user ${user.user_id}: ${error.message}`);
                message += `• مستخدم (ID: ${user.user_id})\n`;
                
                // Add a button to remove this user (with generic name)
                inlineKeyboard.push([{
                    text: `❌ إزالة مستخدم (${user.user_id})`,
                    callback_data: `remove_vip:${user.user_id}`
                }]);
            }
        }
        
        // Add a button to remove all VIP users at once
        inlineKeyboard.push([{
            text: '🗑️ إزالة جميع المستخدمين المميزين',
            callback_data: 'remove_all_vips'
        }]);
        
        // Add a back button
        inlineKeyboard.push([{
            text: '🔙 رجوع',
            callback_data: 'back_to_main'
        }]);
        
        // Send the message with the inline keyboard
        return ctx.replyWithMarkdown(message, {
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        });
    } catch (error) {
        console.error('Error listing VIP users:', error);
        return ctx.reply('❌ حدث خطأ أثناء محاولة عرض قائمة المستخدمين المميزين.');
    }
}
// Add this function to check if a user is a bot admin
async function isBotAdmin(ctx, userId) {
    try {
        const botId = ctx.botInfo.id;
        const chatId = ctx.chat.id;
        const db = await ensureDatabaseInitialized();
        
        console.log(`Checking if user ${userId} is a bot admin in chat ${chatId}`);
        
        const botAdmin = await db.collection('bot_admins').findOne({ 
            user_id: userId,
            chat_id: chatId,
            bot_id: botId,
            is_active: true  // Make sure to check is_active flag
        });
        
        console.log(`Bot admin check result:`, botAdmin ? true : false);
        return !!botAdmin; // Returns true if the user is an active bot admin
    } catch (error) {
        console.error('Error checking bot admin status:', error);
        return false;
    }
}
async function promoteToBotAdmin(ctx) {
    try {
        // Check if the user executing the command is an admin or owner
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        let userId, userMention;
        const args = ctx.message.text.split(' ').slice(1);
        const chatId = ctx.chat.id;
        const botId = ctx.botInfo.id;

        // Get target user from reply or mention
        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
        } else if (args.length > 0) {
            const username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChatMember(chatId, username);
                userId = user.user.id;
                userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        } else {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) لترقيته إلى مشرف بوت.');
        }

        const db = await ensureDatabaseInitialized();
        
        // Check if the user is already a bot admin
        const existingAdmin = await db.collection('bot_admins').findOne({ 
            user_id: userId,
            chat_id: chatId,
            bot_id: botId,
            is_active: true
        });
        
        if (existingAdmin) {
            return ctx.reply('هذا المستخدم مشرف بوت بالفعل في هذه المجموعة.');
        }

        // Add the user as a new bot admin
        await db.collection('bot_admins').insertOne({
            user_id: userId,
            chat_id: chatId,
            bot_id: botId,
            promoted_by: ctx.from.id,
            promoted_at: new Date(),
            is_active: true
        });

        ctx.replyWithMarkdown(`✅ تم ترقية المستخدم ${userMention} إلى مشرف بوت بنجاح.`);
    } catch (error) {
        console.error('Error in promoteToBotAdmin:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة ترقية المستخدم إلى مشرف بوت.');
    }
}
async function hasRequiredPermissions(ctx, userId) {
    const isAdmin = await isAdminOrOwner(ctx, userId);
    const isSecDev = await isSecondaryDeveloper(ctx, userId);
    const isBotAdm = await isBotAdmin(ctx, userId);
    return isAdmin || isSecDev || isBotAdm;
}
async function demoteFromBotOwner(ctx) {
    try {
        // Check if the user executing the command is an admin or owner
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        let userId, userMention;
        const args = ctx.message.text.split(' ').slice(1);
        const chatId = ctx.chat.id;
        const botId = ctx.botInfo.id;

        // Get target user from reply or mention
        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
        } else if (args.length > 0) {
            const username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChatMember(chatId, username);
                userId = user.user.id;
                userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        } else {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) لتنزيله من اساسي.');
        }

        const db = await ensureDatabaseInitialized();
        
        // Check if the user is a bot owner - CORRECTED COLLECTION NAME
        const existingOwner = await db.collection('bot_owners').findOne({ 
            user_id: userId,
            chat_id: chatId,
            bot_id: botId,
            is_active: true
        });
        
        if (!existingOwner) {
            return ctx.reply('هذا المستخدم ليس اساسي في هذه المجموعة.');
        }

        // Update the user's status to inactive
        await db.collection('bot_owners').updateOne(
            { _id: existingOwner._id },
            { 
                $set: { 
                    is_active: false,
                    demoted_by: ctx.from.id,
                    demoted_at: new Date()
                }
            }
        );

        ctx.replyWithMarkdown(`✅ تم تنزيل المستخدم ${userMention} من اساسي.`);
    } catch (error) {
        console.error('Error in demoteFromBotOwner:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تنزيل المستخدم.');
    }
}

// Add a function to get the current bot owner
async function getBotOwner(botId) {
    try {
        const db = await ensureDatabaseInitialized();
        const ownership = await db.collection('bot_ownership').findOne({ bot_id: botId });
        return ownership;
    } catch (error) {
        console.error('Error getting bot owner:', error);
        return null;
    }
}


async function promoteToBotOwner(ctx) {
    try {
        // Check if the user executing the command is an admin or owner
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        let userId, userMention;
        const args = ctx.message.text.split(' ').slice(1);
        const chatId = ctx.chat.id;
        const botId = ctx.botInfo.id;

        // Get target user from reply or mention
        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
        } else if (args.length > 0) {
            const username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChatMember(chatId, username);
                userId = user.user.id;
                userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        } else {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) لترقيته إلى اساسي.');
        }

        const db = await ensureDatabaseInitialized();
        
        // Check if the user is already a bot owner - CORRECTED COLLECTION NAME
        const existingOwner = await db.collection('bot_owners').findOne({ 
            user_id: userId,
            chat_id: chatId,
            bot_id: botId,
            is_active: true
        });
        
        if (existingOwner) {
            return ctx.reply('هذا المستخدم اساسي بالفعل في هذه المجموعة.');
        }

        // Get user details for better record-keeping
        let username, firstName, lastName;
        try {
            const userInfo = await ctx.telegram.getChat(userId);
            username = userInfo.username || null;
            firstName = userInfo.first_name || null;
            lastName = userInfo.last_name || null;
        } catch (error) {
            console.log(`Could not fetch complete user info for ${userId}: ${error.message}`);
        }

        // Check if user was previously demoted and update their record
        const previousRecord = await db.collection('bot_owners').findOne({
            user_id: userId,
            chat_id: chatId,
            bot_id: botId
        });

        if (previousRecord) {
            // Update existing record to active
            await db.collection('bot_owners').updateOne(
                { _id: previousRecord._id },
                { 
                    $set: {
                        is_active: true,
                        promoted_by: ctx.from.id,
                        promoted_at: new Date(),
                        // Clear any demotion data
                        demoted_by: null,
                        demoted_at: null
                    }
                }
            );
        } else {
            // Add the user as a new bot owner
            await db.collection('bot_owners').insertOne({
                user_id: userId,
                username: username,
                first_name: firstName,
                last_name: lastName,
                chat_id: chatId,
                bot_id: botId,
                promoted_by: ctx.from.id,
                promoted_at: new Date(),
                is_active: true
            });
        }

        ctx.replyWithMarkdown(`✅ تم ترقية المستخدم ${userMention} إلى اساسي.`);
    } catch (error) {
        console.error('Error in promoteToBotOwner:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة ترقية المستخدم.');
    }
}

async function removeBotAdmin(ctx) {
    try {
        // Check if the user executing the command is an admin or owner
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        let userId, userMention;
        const args = ctx.message.text.split(' ').slice(1);
        const chatId = ctx.chat.id;
        const botId = ctx.botInfo.id;

        // Get target user from reply or mention
        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
        } else if (args.length > 0) {
            const username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChatMember(chatId, username);
                userId = user.user.id;
                userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        } else {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) لتنزيله من مشرف بوت.');
        }

        const db = await ensureDatabaseInitialized();
        
        // Check if the user is a bot admin
        const existingAdmin = await db.collection('bot_admins').findOne({ 
            user_id: userId,
            chat_id: chatId,
            bot_id: botId,
            is_active: true
        });
        
        if (!existingAdmin) {
            return ctx.reply('هذا المستخدم ليس مشرف بوت في هذه المجموعة.');
        }

        // Update the user's status to inactive
        await db.collection('bot_admins').updateOne(
            { _id: existingAdmin._id },
            { 
                $set: { 
                    is_active: false,
                    demoted_by: ctx.from.id,
                    demoted_at: new Date()
                }
            }
        );

        ctx.replyWithMarkdown(`✅ تم تنزيل المستخدم ${userMention} من مشرف بوت بنجاح.`);
    } catch (error) {
        console.error('Error in removeBotAdmin:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تنزيل المستخدم من مشرف بوت.');
    }
}

// Add these action handlers to your bot setup
bot.action(/^remove_vip:(\d+)$/, async (ctx) => {
    try {
        const targetUserId = parseInt(ctx.match[1]);
        await ctx.answerCbQuery('جاري إزالة المستخدم من القائمة...');
        await removeVIPUser(ctx, targetUserId);
        
        // Refresh the VIP users list
        await listVIPUsers(ctx);
    } catch (error) {
        console.error('Error handling remove_vip action:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء محاولة إزالة المستخدم.');
    }
});

bot.action('remove_all_vip', async (ctx) => {
    try {
        await ctx.answerCbQuery('جاري إزالة جميع المستخدمين المميزين...');
        
        // Show confirmation dialog
        await ctx.editMessageText('⚠️ هل أنت متأكد من رغبتك في إزالة جميع المستخدمين المميزين (VIP)؟', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ نعم، إزالة الجميع', callback_data: 'confirm_remove_all_vip' },
                        { text: '❌ لا، إلغاء', callback_data: 'cancel_remove_all_vip' }
                    ]
                ]
            }
        });
    } catch (error) {
        console.error('Error handling remove_all_vip action:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء محاولة إزالة جميع المستخدمين المميزين.');
    }
});

bot.action('confirm_remove_all_vip', async (ctx) => {
    try {
        await ctx.answerCbQuery('جاري إزالة جميع المستخدمين المميزين...');
        await removeAllVIPUsers(ctx);
        
        // Return to admin menu
        await ctx.editMessageText('✅ تم إزالة جميع المستخدمين المميزين (VIP) بنجاح.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 رجوع للقائمة الرئيسية', callback_data: 'back_to_admin_menu' }]
                ]
            }
        });
    } catch (error) {
        console.error('Error handling confirm_remove_all_vip action:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء محاولة إزالة جميع المستخدمين المميزين.');
    }
});

bot.action('cancel_remove_all_vip', async (ctx) => {
    try {
        await ctx.answerCbQuery('تم إلغاء العملية');
        
        // Refresh the VIP users list
        await listVIPUsers(ctx);
    } catch (error) {
        console.error('Error handling cancel_remove_all_vip action:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء محاولة إلغاء العملية.');
    }
});

bot.action('back_to_admin_menu', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
        // Show admin menu (you'll need to implement this function)
        await showAdminMenu(ctx);
    } catch (error) {
        console.error('Error handling back_to_admin_menu action:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء محاولة العودة للقائمة الرئيسية.');
    }
});
// Add this function to check if a user is a bot admin
async function checkBotAdminPermission(ctx, userId) {
    try {
        // First check if the user is a developer or admin (higher privileges)
        if (await isDeveloper(ctx, userId) || await isAdminOrOwner(ctx, userId)) {
            return true;
        }
        
        // Then check if they're a bot admin
        return await isBotAdmin(userId);
    } catch (error) {
        console.error('Error checking bot admin permissions:', error);
        return false;
    }
}

// Add this middleware function to restrict commands to bot admins
function botAdminOnly(handler) {
    return async (ctx) => {
        try {
            const userId = ctx.from.id;
            
            // Check if the user is a bot admin, developer, or chat admin
            const hasPermission = await checkBotAdminPermission(ctx, userId);
            
            if (hasPermission) {
                return handler(ctx);
            } else {
                return ctx.reply('❌ عذراً، هذا الأمر متاح فقط لمشرفي البوت والمطورين.');
            }
        } catch (error) {
            console.error('Error in botAdminOnly middleware:', error);
            return ctx.reply('❌ حدث خطأ أثناء التحقق من الصلاحيات. يرجى المحاولة مرة أخرى لاحقًا.');
        }
    };
}

    
 // Add this function near the top of your file with other utility functions
async function updateLastInteraction(userId, username, firstName, lastName) {
    try {
        const db = await ensureDatabaseInitialized();
        
        // Update or insert the user record
        await db.collection('users').updateOne(
            { user_id: userId },
            { 
                $set: { 
                    username: username || null,
                    first_name: firstName || null,
                    last_name: lastName || null,
                    last_active: new Date()
                },
                $setOnInsert: { 
                    joined_at: new Date(),
                    is_banned: false
                }
            },
            { upsert: true }
        );
        
        console.log(`Updated last interaction for user ${userId}`);
    } catch (error) {
        console.error('Error updating user interaction:', error);
        // Don't throw the error, just log it to prevent breaking the command flow
    }
}

// Add this function to update active groups in the database
async function updateActiveGroup(chatId, chatTitle, userId) {
    try {
        const db = await ensureDatabaseInitialized();
        
        // Update or insert the group record
        await db.collection('groups').updateOne(
            { group_id: chatId },
            { 
                $set: { 
                    title: chatTitle,
                    last_activity: new Date(),
                    is_active: true
                },
                $setOnInsert: { 
                    added_by: userId,
                    added_at: new Date()
                }
            },
            { upsert: true }
        );
        
        console.log(`Updated active group: ${chatTitle} (${chatId})`);
    } catch (error) {
        console.error('Error updating active group:', error);
    }
}
   
    async function listSecondaryDevelopers(ctx) {
        try {
            const db = await ensureDatabaseInitialized();
            const secondaryDevs = await db.collection('secondary_developers').find().toArray();
    
            if (secondaryDevs.length === 0) {
                return ctx.reply('لا يوجد مطورين ثانويين حاليًا.');
            }
    
            let message = '📋 قائمة المطورين الثانويين:\n\n';
            for (const dev of secondaryDevs) {
                message += `• ${dev.username || 'مستخدم'} (ID: ${dev.user_id})\n`;
            }
    
            await ctx.reply(message);
        } catch (error) {
            console.error('Error listing secondary developers:', error);
            await ctx.reply('❌ حدث خطأ أثناء جلب قائمة المطورين الثانويين. الرجاء المحاولة مرة أخرى لاحقًا.');
        }
    }
    
   
}

async function demoteFromVIP(ctx) {
    try {
        const userId = ctx.from.id;
        const targetUser = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : null;

        if (!targetUser) {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم الذي تريد تنزيله من قائمة المميزين.');
        }

        const db = await ensureDatabaseInitialized();
        const result = await db.collection('vip_users').deleteOne({ user_id: targetUser.id });

        if (result.deletedCount > 0) {
            await ctx.reply(`✅ تم تنزيل المستخدم @${targetUser.username || targetUser.first_name} من قائمة المميزين.`);
        } else {
            await ctx.reply('❌ لم يتم العثور على المستخدم في قائمة المميزين.');
        }
    } catch (error) {
        console.error('Error in demoteFromVIP:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة تنزيل المستخدم من قائمة المميزين.');
    }
}
// Add these functions to handle enabling/disabling sticker sharing
async function disableStickerSharing(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        
        // Store restriction in database for persistence
        const db = await ensureDatabaseInitialized();
        await db.collection('chat_restrictions').updateOne(
            { chat_id: chatId },
            { $set: { stickers_restricted: true, updated_at: new Date() } },
            { upsert: true }
        );
        
        // Update in-memory cache
        stickerRestrictionStatus.set(chatId, true);
        
        ctx.reply('✅ تم تعطيل مشاركة جميع أنواع الملصقات للأعضاء العاديين. فقط المشرفين والأعضاء المميزين (VIP) يمكنهم إرسال الملصقات الآن.');
    } catch (error) {
        console.error('Error in disableStickerSharing:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تعطيل مشاركة الملصقات.');
    }
}

async function enableStickerSharing(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        
        // Update database
        const db = await ensureDatabaseInitialized();
        await db.collection('chat_restrictions').updateOne(
            { chat_id: chatId },
            { $set: { stickers_restricted: false, updated_at: new Date() } },
            { upsert: true }
        );
        
        // Update in-memory cache
        stickerRestrictionStatus.set(chatId, false);
        
        ctx.reply('✅ تم تفعيل مشاركة جميع أنواع الملصقات للجميع.');
    } catch (error) {
        console.error('Error in enableStickerSharing:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة الملصقات.');
    }
}


// Create a middleware to enforce sticker restrictions
const stickerRestrictionMiddleware = async (ctx, next) => {
    // Skip if not in a group or not a message
    if (!ctx.message || ctx.chat.type === 'private') {
        return next();
    }

    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    
    // Check if stickers are restricted in this chat
    if (stickerRestrictionStatus.get(chatId)) {
        // Check for all types of stickers
        const hasSticker = ctx.message.sticker;
        const hasAnimatedSticker = hasSticker && ctx.message.sticker.is_animated;
        const hasVideoSticker = hasSticker && ctx.message.sticker.is_video;
        const hasCustomEmoji = ctx.message.entities && 
            ctx.message.entities.some(entity => entity.type === 'custom_emoji');
        
        // If any type of sticker is detected
        if (hasSticker || hasAnimatedSticker || hasVideoSticker || hasCustomEmoji) {
            // Check if the user is an admin, VIP, or has special permissions
            const isAdmin = await isAdminOrOwner(ctx, userId);
            const isVIPUser = await isVIP(ctx, userId);
            const isPremium = await isPremiumUser(userId);
            const isBotAdm = await isBotAdmin(ctx, userId);

            if (!isAdmin && !isVIPUser && !isPremium && !isBotAdm) {
                // Delete the sticker
                try {
                    await ctx.deleteMessage();
                    
                    // Get sticker type for the message
                    let stickerType = "ملصق";
                    if (hasAnimatedSticker) stickerType = "ملصق متحرك";
                    if (hasVideoSticker) stickerType = "ملصق فيديو";
                    if (hasCustomEmoji) stickerType = "إيموجي مخصص";
                    
                    await ctx.reply(
                        `⚠️ @${ctx.from.username || ctx.from.first_name}، مشاركة ${stickerType} غير مسموحة للأعضاء العاديين في هذه المجموعة.`,
                        { reply_to_message_id: ctx.message.message_id }
                    );
                    
                    // Log the restriction
                    console.log(`Deleted ${stickerType} from user ${userId} in chat ${chatId}`);
                    
                    return; // Don't call next() to prevent further processing
                } catch (error) {
                    console.error('Error deleting restricted sticker:', error);
                }
            }
        }
    }

    return next();
};
async function loadStickerRestrictions() {
    try {
        const db = await ensureDatabaseInitialized();
        const restrictions = await db.collection('chat_restrictions').find(
            { stickers_restricted: true }
        ).toArray();
        
        // Update the in-memory cache
        restrictions.forEach(restriction => {
            stickerRestrictionStatus.set(restriction.chat_id, true);
        });
        
        console.log(`Loaded ${restrictions.length} sticker restrictions from database`);
    } catch (error) {
        console.error('Error loading sticker restrictions:', error);
    }
}

    async function updateActiveGroups(ctx) {
        try {
            const userId = ctx.from.id;
            const chatId = ctx.chat.id;
            const chatTitle = ctx.chat.title || 'Private Chat';
            const chatType = ctx.chat.type;
            
            // Only track groups and supergroups
            if (chatType === 'group' || chatType === 'supergroup') {
                const db = await ensureDatabaseInitialized();
                
                // Update or insert the active group
                await db.collection('active_groups').updateOne(
                    { chat_id: chatId },
                    { 
                        $set: { 
                            chat_title: chatTitle,
                            last_activity: new Date()
                        }
                    },
                    { upsert: true }
                );
                
                // Track user activity in this group
                await db.collection('user_groups').updateOne(
                    { user_id: userId, chat_id: chatId },
                    { 
                        $set: { last_activity: new Date() },
                        $setOnInsert: { joined_at: new Date() }
                    },
                    { upsert: true }
                );
            }
        } catch (error) {
            console.error('Error updating active groups:', error);
        }
    }
    
    async function removeLinks(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            let deletedCount = 0;
    
            // Get the message that triggered the command
            const triggerMessageId = ctx.message.message_id;
    
            // Fetch messages in reverse order (from newest to oldest)
            for (let i = triggerMessageId; i > triggerMessageId - 100 && i > 0; i--) {
                try {
                    const message = await ctx.telegram.forwardMessage(chatId, chatId, i);
                    
                    if (message.entities && message.entities.some(entity => entity.type === 'url')) {
                        await ctx.telegram.deleteMessage(chatId, i);
                        deletedCount++;
                    }
                    
                    // Delete the forwarded message
                    await ctx.telegram.deleteMessage(chatId, message.message_id);
                } catch (error) {
                    // If message not found or already deleted, continue to the next one
                    if (error.description !== "Bad Request: message to forward not found") {
                        console.error(`Error processing message ${i}:`, error);
                    }
                }
            }
    
            ctx.reply(`✅ تم حذف ${deletedCount} رسالة تحتوي على روابط.`);
        } catch (error) {
            console.error('Error in removeLinks:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة حذف الروابط.');
        }
    }
 
    async function disablePhotoSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            photoRestrictionStatus.set(chatId, true);
            ctx.reply('✅ تم تعطيل مشاركة الصور للأعضاء العاديين. فقط المشرفين والأعضاء المميزين (VIP) يمكنهم إرسال الصور الآن.');
        } catch (error) {
            console.error('Error in disablePhotoSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تعطيل مشاركة الصور.');
        }
    }
    async function enableVideoSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            videoRestrictionStatus.set(chatId, false);
            ctx.reply('✅ تم تفعيل مشاركة الفيديوهات للجميع.');
        } catch (error) {
            console.error('Error in enableVideoSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة الفيديوهات.');
        }
    }
    async function disableVideoSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            videoRestrictionStatus.set(chatId, true);
            ctx.reply('✅ تم تعطيل مشاركة الفيديوهات للأعضاء العاديين. فقط المشرفين والأعضاء المميزين (VIP) يمكنهم إرسال الفيديوهات الآن.');
        } catch (error) {
            console.error('Error in disableVideoSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تعطيل مشاركة الفيديوهات.');
        }
    }

    async function enablePhotoSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            photoRestrictionStatus.set(chatId, false);
            ctx.reply('✅ تم تفعيل مشاركة الصور للجميع.');
        } catch (error) {
            console.error('Error in enablePhotoSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة الصور.');
        }
    }
    
    async function showDevPanel(ctx) {
        try {
            if (ctx.chat.type !== 'private') {
                await ctx.reply('⚠️ يمكن استخدام لوحة التحكم في الرسائل الخاصة فقط.');
                return;
            }
    
            const userId = ctx.from.id;
    
            if (ownerId === null) {
                ownerId = userId;
                console.log(`Owner set to user ID: ${ownerId}`);
            }
    
            const isDev = await isDeveloper(ctx, userId);
            if (!isDev && userId !== ownerId) {
                await ctx.reply('⛔ عذرًا، هذه اللوحة مخصصة للمطورين فقط.');
                return;
            }
    
            if (userId === ownerId && !ownerMessageSent) {
                await ctx.reply('🎉 شكراً لتفضيل البوت! أنت الآن المالك ويمكنك الوصول إلى قائمة المطورين.');
                ownerMessageSent = true; // Set the flag to true after sending the message
            }
    
            const message = 'مرحبا عزيزي المطور\nإليك ازرار التحكم بالاقسام\nتستطيع التحكم بجميع الاقسام فقط اضغط على القسم الذي تريده';
            const keyboard = {
                inline_keyboard: [
                   [{ text: '📲 الردود ', callback_data: 'dev_replies' }],
                    [{ text: '🎙️ الإذاعة ', callback_data: 'dev_broadcast' }],
                    [{ text: '🧑‍💻 السورس', callback_data: 'dev_source' }],
                    [{ text: '🔤 اسم البوت ', callback_data: 'dev_bot_name' }],
                    [{ text: '📊 الاحصائيات', callback_data: 'dev_statistics' }],
                    [{ text: '💻 المطورين', callback_data: 'dev_developers' }],
                    [{ text: '👀 قريبا', callback_data: 'dev_welcome' }],
                    [{ text: ' ctrlsrc', url: 'https://t.me/ctrlsrc' }],
                    [{ text: '📂 عرض المجموعات النشطة', callback_data: 'show_active_groups' }],
                ]
            };
    
            await loadActiveGroupsFromDatabase();
    
            if (ctx.callbackQuery) {
                const msg = ctx.callbackQuery.message;
                if (msg.caption) {
                    await ctx.editMessageCaption(message, { reply_markup: keyboard });
                } else {
                    await ctx.editMessageText(message, { reply_markup: keyboard });
                }
            } else {
                await ctx.reply(message, { reply_markup: keyboard });
            }
        } catch (error) {
            console.error('Error in showDevPanel:', error);
            await ctx.reply('❌ حدث خطأ أثناء محاولة عرض لوحة التحكم للمطور.');
        }
    }
    async function showDevPanel(ctx) {
        try {
            // Check if the message is from a private chat (DM)
            if (ctx.chat.type !== 'private') {
                await ctx.reply('⚠️ يمكن استخدام لوحة التحكم في الرسائل الخاصة فقط.');
                return;
            }
    
            const userId = ctx.from.id;
    
            // Check if this is the first time the /start command is executed
            if (ownerId === null) {
                ownerId = userId; // Set the current user as the owner
                console.log(`Owner set to user ID: ${ownerId}`);
            }
    
            // Check if the user is a developer or the owner
            const isDev = await isDeveloper(ctx, userId);
            if (!isDev && userId !== ownerId) {
                await ctx.reply('⛔ عذرًا، هذه اللوحة مخصصة للمطورين فقط.');
                return;
            }
    
            const message = 'مرحبا عزيزي المطور\nإليك ازرار التحكم بالاقسام\nتستطيع التحكم بجميع الاقسام فقط اضغط على القسم الذي تريده';
            const keyboard = {
                inline_keyboard: [
                     [{ text: '📲 الردود ', callback_data: 'dev_replies' }],
                    [{ text: '🎙️ الإذاعة ', callback_data: 'dev_broadcast' }],
                    [{ text: '🧑‍💻 السورس', callback_data: 'dev_source' }],
                    [{ text: '🔤 اسم البوت ', callback_data: 'dev_bot_name' }],
                    [{ text: '📊 الاحصائيات', callback_data: 'dev_statistics' }],
                    [{ text: '💻 المطورين', callback_data: 'dev_developers' }],
                    [{ text: '👀 قريبا', callback_data: 'dev_welcome' }],
                    [{ text: ' ctrlsrc', url: 'https://t.me/ctrlsrc' }],
                    [{ text: '📂 عرض المجموعات النشطة', callback_data: 'show_active_groups' }],
                ]
            };
    
            await loadActiveGroupsFromDatabase();
    
            if (ctx.callbackQuery) {
                const msg = ctx.callbackQuery.message;
                if (msg.caption) {
                    // If the message has a caption (e.g., it's a photo), edit the caption
                    await ctx.editMessageCaption(message, { reply_markup: keyboard });
                } else {
                    // If it's a text message, edit the text
                    await ctx.editMessageText(message, { reply_markup: keyboard });
                }
            } else {
                // If it's a new command, just send a new message
                await ctx.reply(message, { reply_markup: keyboard });
            }
        } catch (error) {
            console.error('Error in showDevPanel:', error);
            await ctx.reply('❌ حدث خطأ أثناء محاولة عرض لوحة التحكم للمطور.');
        }   
    
    
    }  
        
    async function sendCommandList(bot, chatId, messageId = null) {
    const commandText = `📜 *قائمة الأوامر:*

*📊 أوامر المعلومات*
🔹 *ايدي* – ظهور الايدي و معرفك
🔹 *رتبتي* – ظهور رتبتك
🔹 *رابط المجموعة* – الحصول على رابط المجموعة

*👥 أوامر الإدارة*
🔹 *رفع امن مسابقات* – رفع ادمن مسابقات
🔹 *تنزيل امن مسابقات* – تنزيل ادمن مسابقات
🔹 *رفع مميز* – رفع مستخدم إلى مميز
🔹 *تنزيل مميز* – تنزيل مستخدم من مميز
🔹 *لستة مميز* – عرض قائمة المميزين
🔹 *رفع ادمن* – ترقية إلى أدمن
🔹 *تنزيل ادمن* – ترقية إلى أدمن
🔹 *رفع منشئ* – ترقية إلى منشئ
🔹 *تنزيل* – إزالة رتبة
🔹 *رفع مطور* – ترقية إلى مطور
🔹 *رفع مطور ثانوي* – ترقية إلى مطور ثانوي
🔹 *تنزيل اساسي* – تنزيل إلى اساسي
🔹 *رفع اساسي* – ترقية إلى اساسي
🔹 *تنزيل مطور* – لتنزيل مطور أول أو ثانوي، اذهب إلى خاص البوت كمطور

*🛡️ أوامر الحماية*
🔹 *كتم* – كتم مستخدم
🔹 *الغاء كتم* – إلغاء كتم مستخدم
🔹 *مسح* – حذف آخر رسالة
🔹 *تثبيت* – تثبيت رسالة
🔹 *طرد* – طرد مستخدم
🔹 *تحذير* – إصدار تحذير لمستخدم
🔹 *تحذيرات* – عرض عدد التحذيرات لمستخدم
🔹 *نداء الجميع* – مناداة جميع الأعضاء

*🖼️ أوامر الوسائط*
🔹 *مسح الصور* – حذف آخر الصور المرسلة
🔹 *منع الصور* – منع إرسال الصور
🔹 *فتح الصور* – السماح بإرسال الصور
🔹 *منع فيديو* – منع إرسال الفيديوهات
🔹 *فتح فيديو* – السماح بإرسال الفيديوهات
🔹 *منع متحركة* – منع إرسال الصور المتحركة
🔹 *فتح متحركة* – السماح بإرسال الصور المتحركة
🔹 *منع ملصقات* – منع إرسال الملصقات
🔹 *فتح ملصقات* – السماح بإرسال الملصقات

*🔗 أوامر الروابط*
🔹 *ازالة الروابط* – حذف الروابط في المجموعة
🔹 *فتح روابط* – السماح بمشاركة الروابط
🔹 *منع روابط* – منع مشاركة الروابط

*🎭 أوامر الترفيه*
🔹 *نكتة* – إرسال نكتة`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "⚡ عرض الاختصارات", callback_data: "show_shortcuts" },
                
            ],
            [
               
            ]
        ]
    };

    const options = {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    };

    try {
        if (messageId) {
            // Edit existing message
            await bot.editMessageText(commandText, {
                chat_id: chatId,
                message_id: messageId,
                ...options
            });
        } else {
            // Send new message
            await bot.sendMessage(chatId, commandText, options);
        }
    } catch (error) {
        console.error('Error sending command list:', error);
    }
}

// Async function to send shortcuts with buttons
async function sendShortcutsList(bot, chatId, messageId = null) {
    const shortcutsText = `⚡ *قائمة الاختصارات:*

*🔺 اختصارات الرفع:*
🔹 *ر م* – رفع مميز
🔹 *ر ط* – رفع مطور
🔹 *رط* – رفع مطور (بدون مسافة)
🔹 *ر ث* – رفع مطور ثانوي
🔹 *رث* – رفع مطور ثانوي (بدون مسافة)
🔹 *ر ا* – رفع ادمن
🔹 *را* – رفع ادمن (بدون مسافة)
🔹 *ر س* – رفع مطور أساسي
🔹 *رس* – رفع مطور أساسي (بدون مسافة)

*🔻 اختصارات التنزيل:*
'🔹 <b>ت س</b> – تنزيل اساسي\n' +
🔹 *ت م* – تنزيل مميز
🔹 *ت ط* – تنزيل مطور
🔹 *تط* – تنزيل مطور (بدون مسافة)
🔹 *ت ا* – تنزيل ادمن
🔹 *تا* – تنزيل ادمن (بدون مسافة)

*📋 اختصارات أخرى:*
🔹 *ر ت* – عرض رتبتي
🔹 *رت* – عرض رتبتي (بدون مسافة)`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: "📜 عرض الأوامر الكاملة", callback_data: "show_commands" },
                { text: "🔄 تحديث", callback_data: "refresh_shortcuts" }
            ],
            [
                { text: "❌ إغلاق", callback_data: "close_menu" }
            ]
        ]
    };

    const options = {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    };

    try {
        if (messageId) {
            // Edit existing message
            await bot.editMessageText(shortcutsText, {
                chat_id: chatId,
                message_id: messageId,
                ...options
            });
        } else {
            // Send new message
            await bot.sendMessage(chatId, shortcutsText, options);
        }
    } catch (error) {
        console.error('Error sending shortcuts list:', error);
    }
}

// Handle callback queries from inline buttons
async function handleCallbackQuery(bot, callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    try {
        // Answer the callback query to remove loading state
        await bot.answerCallbackQuery(callbackQuery.id);

        switch (data) {
            case 'show_shortcuts':
                await sendShortcutsList(bot, chatId, messageId);
                break;

            case 'show_commands':
                await sendCommandList(bot, chatId, messageId);
                break;

            case 'refresh_commands':
                await sendCommandList(bot, chatId, messageId);
                break;

            case 'refresh_shortcuts':
                await sendShortcutsList(bot, chatId, messageId);
                break;

            case 'close_menu':
                await bot.deleteMessage(chatId, messageId);
                break;

            default:
                console.log('Unknown callback data:', data);
        }
    } catch (error) {
        console.error('Error handling callback query:', error);
    }
}    
        

    
  
    // Add this function to get the custom bot name for a chat
    async function getCustomBotName(chatId) {
        try {
            const db = await ensureDatabaseInitialized();
            const customName = await db.collection('bot_custom_names').findOne({ chat_id: chatId });
            
            if (customName) {
                return customName.custom_name;
            }
            return null;
        } catch (error) {
            console.error('Error retrieving custom bot name:', error);
            return null;
        }
    }
    async function showUserId(ctx) {
    try {
        const userId = ctx.from.id;
        const firstName = ctx.from.first_name || 'المستخدم';
        const username = ctx.from.username ? `@${ctx.from.username}` : 'غير متوفر';
        const lastName = ctx.from.last_name || '';
        
        // Create a more visually appealing message with proper RTL support
        const message = `
┏━━━━━━━━━━━━━━━┓
┃  📋 معلومات المستخدم  ┃
┗━━━━━━━━━━━━━━━┛

👤 الاسم: ${firstName} ${lastName}
🔖 المعرف: ${username}
🆔 رقم الحساب: <code>${userId}</code>

⌯ يمكنك استخدام هذا المعرف للإشارة إلى حسابك في البوت
`;
        
        // Use Telegram's HTML formatting for better appearance
        await ctx.replyWithHTML(message, {
            disable_web_page_preview: true,
            reply_to_message_id: ctx.message.message_id
        });
        
        // Track user interaction in the database
        try {
            // Import database module if not already imported
            const database = require('./database');
            await database.updateUserActivity(userId);
            
            // Store user information if available
            if (database.addUser && typeof database.addUser === 'function') {
                await database.addUser(userId, username, firstName, lastName);
            }
        } catch (dbError) {
            console.error('Error updating user activity:', dbError);
            // Continue execution even if database update fails
        }
        
    } catch (error) {
        console.error('Error in showUserId:', error);
        ctx.reply('❌ عذراً، حدث خطأ أثناء محاولة عرض معلومات حسابك. الرجاء المحاولة مرة أخرى.');
    }
}
    // Add this function to handle link sharing toggling
    async function enableLinkSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            linkRestrictionStatus.set(chatId, false);
    
            await ctx.reply('✅ تم السماح بمشاركة الروابط للجميع في المجموعة.');
        } catch (error) {
            console.error('Error in enableLinkSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة السماح بمشاركة الروابط.');
        }
    }
    
    async function disableLinkSharing(ctx) {
        try {
            if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
                return ctx.reply('❌ هذا الأمر يعمل فقط داخل المجموعات.');
            }
    
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            linkRestrictionStatus.set(chatId, true);
    
            console.log(`✅ روابط مُنعَت في ${chatId} بواسطة ${ctx.from.id}`);
            return ctx.reply('✅ تم منع مشاركة الروابط للأعضاء العاديين في المجموعة. سيتم حذف أي روابط يتم إرسالها من قبل الأعضاء العاديين. المشرفون والأعضاء المميزون (VIP) يمكنهم مشاركة الروابط.');
        } catch (error) {
            console.error('Error in disableLinkSharing:', error);
            return ctx.reply('❌ حدث خطأ أثناء محاولة منع مشاركة الروابط.');
        }
    }
    
 

async function promoteToImportant(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        let userId, userMention;
        const args = ctx.message.text.split(' ').slice(1);
        const chatId = ctx.chat.id;
        const botId = ctx.botInfo.id;

        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
        } else if (args.length > 0) {
            const username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChatMember(chatId, username);
                userId = user.user.id;
                userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        } else {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) لترقيته إلى مميز.');
        }

        const db = await ensureDatabaseInitialized();
        
        // Check if the user is already an important person in this specific group and bot
        const existingImportant = await db.collection('important_users').findOne({ 
            user_id: userId,
            chat_id: chatId,
            bot_id: botId
        });
        
        if (existingImportant) {
            return ctx.reply('هذا المستخدم مميز (Important) بالفعل في هذه المجموعة.');
        }

        // Get user details for better record-keeping
        let username, firstName, lastName;
        try {
            const userInfo = await ctx.telegram.getChat(userId);
            username = userInfo.username || null;
            firstName = userInfo.first_name || null;
            lastName = userInfo.last_name || null;
        } catch (error) {
            console.log(`Could not fetch complete user info for ${userId}: ${error.message}`);
            // Continue with available information
        }

        // Add the user to the important collection with group and bot information
        await db.collection('important_users').insertOne({
            user_id: userId,
            username: username,
            first_name: firstName,
            last_name: lastName,
            chat_id: chatId,
            chat_title: ctx.chat.title || 'Unknown Group',
            bot_id: botId,
            promoted_at: new Date(),
            promoted_by: ctx.from.id
        });

        ctx.replyWithMarkdown(`✅ تم ترقية المستخدم ${userMention} إلى مميز (Important) بنجاح في هذه المجموعة.`);

    } catch (error) {
        console.error('Error in promoteToImportant:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة ترقية المستخدم إلى مميز (Important).');
    }
}

    
async function demoteFromImportant(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        let userId, userMention;
        const args = ctx.message.text.split(' ').slice(1);
        const chatId = ctx.chat.id;
        const botId = ctx.botInfo.id;

        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
        } else if (args.length > 0) {
            const username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChatMember(ctx.chat.id, username);
                userId = user.user.id;
                userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        } else {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) لتنزيله من مميز.');
        }

        const db = await ensureDatabaseInitialized();
        
        // Check if the user is an important person in this specific group and bot
        const existingImportant = await db.collection('important_users').findOne({ 
            user_id: userId,
            chat_id: chatId,
            bot_id: botId
        });
        
        if (!existingImportant) {
            return ctx.reply('هذا المستخدم ليس مميز (Important) في هذه المجموعة.');
        }

        // Remove the user from the important collection for this specific group and bot
        await db.collection('important_users').deleteOne({ 
            user_id: userId,
            chat_id: chatId,
            bot_id: botId
        });

        // Log the demotion for audit purposes
        await db.collection('user_role_changes').insertOne({
            user_id: userId,
            chat_id: chatId,
            bot_id: botId,
            action: 'demote',
            role: 'important',
            performed_by: ctx.from.id,
            timestamp: new Date()
        });

        ctx.replyWithMarkdown(`✅ تم تنزيل المستخدم ${userMention} من مميز (Important) بنجاح في هذه المجموعة.`);

    } catch (error) {
        console.error('Error in demoteFromImportant:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تنزيل المستخدم من مميز (Important).');
    }
}

// Add this function to list important users
// Update the listVIPUsers function to include buttons for removing users


  // Add this function to check if a user is important
async function isImportant(ctx, userId) {
    try {
        const db = await ensureDatabaseInitialized();
        const importantUser = await db.collection('important_users').findOne({ 
            user_id: userId,
            chat_id: ctx.chat.id,
            bot_id: ctx.botInfo.id
        });
        return !!importantUser;
    } catch (error) {
        console.error('Error checking important status:', error);
        return false;
    }
}
 

    // Send a joke
    async function sendJoke(ctx) {
        try {
            const jokes = [
                "واحد راح للدكتور قاله: يا دكتور صوتي راح... الدكتور: وانت جاي تدور عليه هنا؟",
                "مرة واحد راح لصاحبه البخيل، قال له: عندك شاي؟ قال: أيوة. قال: طيب ممكن كوباية ماية ساقعة؟",
                "واحد بيقول لصاحبه: تعرف إن النملة بتشيل 50 ضعف وزنها؟ صاحبه: ياه! أمال جوزها بيشيل كام؟",
                "مرة واحد بلديتنا راح يشتري تليفون، البائع قاله: دة موبايل نوكيا. قاله: لا مش عايز نوكيا، عايز واحد يرن بس",
                "واحد بيسأل صاحبه: إيه رأيك في الزواج؟ قاله: زي الحرب كده.. اللي بره نفسه يدخل واللي جوه نفسه يطلع"
            ];
            
            const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
            
            // Send the GIF
            await ctx.replyWithAnimation('https://media.giphy.com/media/fUYhyT9IjftxrxJXcE/giphy.gif?cid=ecf05e47tlilm6ghl00scnmkbgaype5bkcptjdqb0gw9flx0&ep=v1_gifs_search&rid=giphy.gif&ct=g');
            
            // Send the joke text
            await ctx.reply(`😂 إليك نكتة:\n\n${randomJoke}`);
        } catch (error) {
            console.error('Error in sendJoke:', error);
            ctx.reply('❌ عذرًا، حدث خطأ أثناء محاولة إرسال النكتة.');
        }
    }
    async function kickUser(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            let userId, userMention;
            const args = ctx.message.text.split(' ').slice(1);
    
            if (ctx.message.reply_to_message) {
                // If replying to a message, kick that user
                const target = ctx.message.reply_to_message.from;
                userId = target.id;
                userMention = `[${target.first_name}](tg://user?id=${userId})`;
            } else if (args.length > 0) {
                // If a username is provided as an argument
                const username = args[0].replace('@', '');
                
                try {
                    // Try to get user information directly from Telegram
                    const user = await ctx.telegram.getChat(username);
                    userId = user.id;
                    userMention = `[${user.first_name}](tg://user?id=${userId})`;
                } catch (error) {
                    console.error('Error getting user by username:', error);
                    
                    // Fallback to knownUsers if available
                    if (knownUsers && knownUsers.has(username.toLowerCase())) {
                        const userData = knownUsers.get(username.toLowerCase());
                        userId = userData.id;
                        userMention = `[${userData.first_name}](tg://user?id=${userId})`;
                    } else {
                        return ctx.reply('❌ لم أتمكن من العثور على هذا المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
                    }
                }
            } else if (ctx.message.entities) {
                // If there's a mention in the message
                const mentionEntity = ctx.message.entities.find(e => e.type === "mention");
                if (mentionEntity) {
                    const username = ctx.message.text.slice(mentionEntity.offset + 1, mentionEntity.offset + mentionEntity.length).toLowerCase();
                    
                    try {
                        // Try to get user information directly from Telegram
                        const user = await ctx.telegram.getChat(username);
                        userId = user.id;
                        userMention = `[${user.first_name}](tg://user?id=${userId})`;
                    } catch (error) {
                        console.error('Error getting user by mention:', error);
                        
                        // Fallback to knownUsers if available
                        if (knownUsers && knownUsers.has(username)) {
                            const userData = knownUsers.get(username);
                            userId = userData.id;
                            userMention = `[${userData.first_name}](tg://user?id=${userId})`;
                        } else {
                            return ctx.reply('❌ لم أتمكن من العثور على هذا المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
                        }
                    }
                }
            } else {
                return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) لطرده.');
            }
    
            if (!userId) {
                return ctx.reply('❌ لم أتمكن من تحديد المستخدم المراد طرده.');
            }
    
            // Check if the user is an admin
            try {
                const memberInfo = await ctx.telegram.getChatMember(ctx.chat.id, userId);
                if (memberInfo.status === 'administrator' || memberInfo.status === 'creator') {
                    return ctx.reply('❌ لا يمكن طرد المشرفين أو مالك المجموعة.');
                }
            } catch (error) {
                console.error('Error checking member status:', error);
                // Continue with kick attempt even if we can't check admin status
            }
    
            // Kick the user
            await ctx.telegram.kickChatMember(ctx.chat.id, userId);
            
            // Unban to allow rejoining (this is what makes it a "kick" rather than a "ban")
            await ctx.telegram.unbanChatMember(ctx.chat.id, userId, {
                only_if_banned: true
            });
    
            await ctx.replyWithMarkdown(`✅ تم طرد المستخدم ${userMention} من المجموعة.`);
        } catch (error) {
            console.error('❌ حدث خطأ أثناء محاولة طرد المستخدم:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة طرد المستخدم. تأكد من أن البوت لديه صلاحيات كافية.');
        }
    }
    
    
    
    async function enableVideoSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            videoRestrictionStatus.set(chatId, false);
            ctx.reply('✅ تم تفعيل مشاركة الفيديوهات للجميع.');
        } catch (error) {
            console.error('Error in enableVideoSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة الفيديوهات.');
        }
    }
    async function disableGifSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            gifRestrictionStatus.set(chatId, true);
            ctx.reply('✅ تم تعطيل مشاركة الصور المتحركة للأعضاء العاديين. فقط المشرفين يمكنهم إرسال الصور المتحركة الآن.');
        } catch (error) {
            console.error('Error in disableGifSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تعطيل مشاركة الصور المتحركة.');
        }
    }
    async function enableGifSharing(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            const chatId = ctx.chat.id;
            gifRestrictionStatus.set(chatId, false);
            ctx.reply('✅ تم تفعيل مشاركة الصور المتحركة للجميع.');
        } catch (error) {
            console.error('Error in enableGifSharing:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة الصور المتحركة.');
        }
    }
    async function promoteUser(ctx, role) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين والمالك فقط.');
        }

        let userId, userMention;
        const args = ctx.message.text.split(' ').slice(1);

        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
        } else if (args.length > 0) {
            const username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChatMember(ctx.chat.id, username);
                userId = user.user.id;
                userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        } else {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) لترقيته.');
        }

        const db = await ensureDatabaseInitialized();
        const botId = ctx.botInfo.id; // Use the bot's ID as a unique identifier
        let collection, successMessage;

        switch (role.toLowerCase()) {
            case 'مميز':
            case 'vip':
                collection = 'vip_users';
                successMessage = `✅ تم ترقية المستخدم ${userMention} إلى ادمن مسابقات (VIP).`;
                break;
            case 'verynull':
            case 'verynull':
                collection = 'verynull';
                successMessage = `✅ تم ترقية المستخدم ${userMention} إلى ادمن.`;
                // Promote the user to admin in the Telegram group
                await ctx.telegram.promoteChatMember(ctx.chat.id, userId, {
                    can_change_info: true,
                    can_delete_messages: true,
                    can_invite_users: true,
                    can_restrict_members: true,
                    can_pin_messages: true,
                    can_promote_members: false
                });
                break;
            case 'مدير':
            case 'manager':
                collection = 'managers';
                successMessage = `✅ تم ترقية المستخدم ${userMention} إلى مدير.`;
                break;
            case 'منشئ':
            case 'creator':
                collection = 'creators';
                successMessage = `✅ تم ترقية المستخدم ${userMention} إلى منشئ.`;
                break;
            case 'منشئ اساسي':
            case 'primary creator':
                collection = 'primary_creators';
                successMessage = `✅ تم ترقية المستخدم ${userMention} إلى منشئ اساسي.`;
                break;
            case 'مطور':
            case 'developer':
                collection = 'developers';
                successMessage = `✅ تم ترقية المستخدم ${userMention} إلى مطور.`;
                break;
            case 'مطور ثانوي':
            case 'secondary developer':
                collection = 'secondary_developers';
                successMessage = `✅ تم ترقية المستخدم ${userMention} إلى مطور ثانوي.`;
                break;
            default:
                return ctx.reply('❌ نوع الترقية غير صالح.');
        }

        // First check if the user already exists in the collection
        const existingUser = await db.collection(collection).findOne({ user_id: userId });
        
        if (existingUser) {
            // User already has this role, just update their information
            await db.collection(collection).updateOne(
                { user_id: userId },
                { 
                    $set: { 
                        bot_id: botId,
                        username: ctx.message.reply_to_message ? ctx.message.reply_to_message.from.username : args[0],
                        updated_at: new Date(),
                        updated_by: ctx.from.id
                    }
                }
            );
            return ctx.replyWithMarkdown(`ℹ️ المستخدم ${userMention} لديه بالفعل رتبة ${role}.`);
        } else {
            // User doesn't have this role yet, create a new entry
            await db.collection(collection).insertOne({ 
                user_id: userId, 
                bot_id: botId,
                username: ctx.message.reply_to_message ? ctx.message.reply_to_message.from.username : args[0],
                promoted_at: new Date(),
                promoted_by: ctx.from.id
            });
            
            ctx.replyWithMarkdown(successMessage);
            console.log(`User ${userId} promoted to ${role} by bot ${botId}`);
        }
    } catch (error) {
        console.error(`Error promoting user to ${role}:`, error);
        ctx.reply(`❌ حدث خطأ أثناء ترقية المستخدم إلى ${role}. الرجاء المحاولة مرة أخرى لاحقًا.`);
    }
}
    // ✅ Demote user
    // ✅ Demote user u check this
   async function demoteUser(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين والمالك فقط.');
        }

        let userId, userMention, username;
        const replyMessage = ctx.message.reply_to_message;

        if (replyMessage) {
            userId = replyMessage.from.id;
            username = replyMessage.from.username;
            userMention = `[${replyMessage.from.first_name}](tg://user?id=${userId})`;
        } else {
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length === 0) {
                return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) أو معرفه الرقمي.');
            }
            
            const identifier = args[0].replace('@', '');
            
            // Try to get user by username or ID
            try {
                // Check if it's a numeric ID
                if (/^\d+$/.test(identifier)) {
                    userId = parseInt(identifier);
                    try {
                        const user = await ctx.telegram.getChat(userId);
                        username = user.username;
                        userMention = `[${user.first_name}](tg://user?id=${userId})`;
                    } catch (error) {
                        // If we can't get the user info, just use the ID
                        userMention = `المستخدم (${userId})`;
                    }
                } else {
                    // It's a username
                    username = identifier;
                    try {
                        const user = await ctx.telegram.getChatMember(ctx.chat.id, username);
                        userId = user.user.id;
                        userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
                    } catch (error) {
                        // If we can't get the user ID, just use the username
                        userMention = `@${username}`;
                    }
                }
            } catch (error) {
                console.error('Error getting user info:', error);
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        }

        const db = await ensureDatabaseInitialized();
        const botId = ctx.botInfo?.id || 'unknown'; // Fallback if bot info is not available
        
        // Build query based on available information
        let query = {};
        if (userId) {
            query.user_id = userId;
        } else if (username) {
            query.username = username;
        } else {
            return ctx.reply('❌ لم يتم العثور على معلومات كافية عن المستخدم.');
        }

        // Check all possible roles
        const roles = [
            'developers', 
            'secondary_developers', 
            'primary_creators',
            'creators',
            'managers', 
            'admins', 
            'vip_users',
            'bot_owners',
            'bot_admins'
        ];
        
        let userRoles = [];
        let removedRoles = [];

        // Check each collection for the user
        for (const role of roles) {
            try {
                const result = await db.collection(role).findOne(query);
                if (result) {
                    userRoles.push(role);
                    // Remove the user from this collection
                    await db.collection(role).deleteOne({ _id: result._id });
                    removedRoles.push(role);
                }
            } catch (error) {
                console.error(`Error checking ${role} collection:`, error);
            }
        }

        // Special handling for "مطور" (developer) command
        const commandText = ctx.message.text.toLowerCase();
        if (commandText.includes('تنزيل مطور')) {
            // If specifically demoting a developer, check if they were removed from developers collection
            if (!removedRoles.includes('developers') && !removedRoles.includes('secondary_developers')) {
                return ctx.reply('❌ هذا المستخدم ليس مطورًا.');
            }
        }

        if (removedRoles.length === 0) {
            return ctx.reply('❌ هذا المستخدم ليس لديه أي رتبة خاصة للإزالة.');
        }

        // Generate success message based on removed roles
        let successMessage = `✅ تم إزالة الرتب التالية من المستخدم ${userMention}:\n`;
        
        for (const role of removedRoles) {
            switch (role) {
                case 'developers':
                    successMessage += '- مطور\n';
                    break;
                case 'secondary_developers':
                    successMessage += '- مطور ثانوي\n';
                    break;
                case 'primary_creators':
                    successMessage += '- منشئ اساسي\n';
                    break;
                case 'creators':
                    successMessage += '- منشئ\n';
                    break;
                case 'managers':
                    successMessage += '- مدير\n';
                    break;
                case 'admins':
                    successMessage += '- ادمن\n';
                    // Try to remove admin privileges in the Telegram group
                    try {
                        await ctx.telegram.promoteChatMember(ctx.chat.id, userId, {
                            can_change_info: false,
                            can_delete_messages: false,
                            can_invite_users: false,
                            can_restrict_members: false,
                            can_pin_messages: false,
                            can_promote_members: false
                        });
                    } catch (error) {
                        console.error('Error removing admin privileges:', error);
                    }
                    break;
                case 'vip_users':
                    successMessage += '- مميز (VIP)\n';
                    break;
                case 'bot_owners':
                    successMessage += '- مالك البوت\n';
                    break;
                case 'bot_admins':
                    successMessage += '- ادمن البوت\n';
                    break;
            }
        }

        // Add record to demotions collection for audit trail
        await db.collection('demotions').insertOne({
            user_id: userId,
            username: username,
            demoted_by: ctx.from.id,
            demoted_at: new Date(),
            removed_roles: removedRoles,
            chat_id: ctx.chat.id,
            bot_id: botId
        });

        ctx.replyWithMarkdown(successMessage);

    } catch (error) {
        console.error('Error in demoteUser:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة إزالة رتبة المستخدم.');
    }
}
    //call command
    async function callEveryone(ctx) {
        try {
            // Detailed permission check
            const botInfo = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
            console.log('Bot permissions:', JSON.stringify(botInfo, null, 2));
    
            if (!botInfo || botInfo.status !== "administrator") {
                return ctx.reply('❌ البوت ليس مشرفًا في هذه المجموعة.');
            }
    
            // Check for essential permissions
            const requiredPermissions = [
                'can_manage_chat',
                'can_delete_messages',
                'can_invite_users',
                'can_restrict_members',
                'can_pin_messages'
            ];
    
            const missingPermissions = requiredPermissions.filter(perm => !botInfo[perm]);
    
            if (missingPermissions.length > 0) {
                return ctx.reply(`❌ البوت يفتقد الصلاحيات التالية: ${missingPermissions.join(', ')}. يرجى تعديل صلاحيات البوت.`);
            }
    
            // Get chat information
            const chat = await ctx.telegram.getChat(ctx.chat.id);
    
            // Get chat administrators
            const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);
    
            if (admins.length === 0) {
                return ctx.reply('❌ لم يتم العثور على مشرفين في المجموعة.');
            }
    
            // Mention administrators
            const chunkSize = 4096;
            let message = "🚨 نداء للمشرفين:\n";
            for (const admin of admins) {
                if (admin.user.is_bot) continue; // Skip bots
                const mention = `[${admin.user.first_name}](tg://user?id=${admin.user.id})`;
                if (message.length + mention.length > chunkSize) {
                    await ctx.reply(message, { parse_mode: "Markdown" });
                    message = "🚨 متابعة النداء للمشرفين:\n";
                }
                message += ` ${mention}`;
            }
    
            if (message !== "🚨 نداء للمشرفين:\n" && message !== "🚨 متابعة النداء للمشرفين:\n") {
                await ctx.reply(message, { parse_mode: "Markdown" });
            }
    
            // Send a general message for all members
            await ctx.reply("🔔 تنبيه لجميع الأعضاء! يرجى الانتباه إلى هذا الإعلان الهام.", { parse_mode: "Markdown" });
        } catch (error) {
            console.error('Error in callEveryone:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة نداء الجميع.');
        }
    }
    // Delete latest message
    async function deleteLatestMessage(ctx) {
        try {
            if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
    
            let messageToDelete;
    
            if (ctx.message.reply_to_message) {
                // If the command is replying to a message, delete that message
                messageToDelete = ctx.message.reply_to_message.message_id;
            } else {
                // If not replying, delete the message before the command
                messageToDelete = ctx.message.message_id - 1;
            }
    
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, messageToDelete);
                console.log(`Deleted message with ID: ${messageToDelete}`);
    
                // Delete the command message itself
                await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
                console.log(`Deleted command message with ID: ${ctx.message.message_id}`);
    
                // Send a confirmation message and delete it after 3 seconds
                const confirmationMessage = await ctx.reply('✅ تم حذف الرسالة.');
                setTimeout(() => {
                    ctx.telegram.deleteMessage(ctx.chat.id, confirmationMessage.message_id)
                        .catch(error => console.error('Error deleting confirmation message:', error));
                }, 3000);
    
            } catch (deleteError) {
                console.error('Error deleting message:', deleteError);
                await ctx.reply('❌ لم أتمكن من حذف الرسالة. قد تكون قديمة جدًا أو غير موجودة.');
            }
    
        } catch (error) {
            console.error('Error in deleteLatestMessage:', error);
            await ctx.reply('❌ حدث خطأ أثناء محاولة حذف الرسالة.');
        }
    }
// Add this function to check if the chat is a group
function isGroupChat(ctx) {
    return ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
}

// Also update the isPrimaryDeveloper function to use MongoDB
async function isPrimaryDeveloper(ctx, userId) {
    try {
        console.log('DEBUG: Checking if user is primary developer:', userId);
        const { MongoClient } = require('mongodb');
        const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
        const client = new MongoClient(uri);
        
        await client.connect();
        const db = client.db("protectionBot");
        const primaryDev = await db.collection('primary_developers').findOne({ user_id: userId });
        const result = !!primaryDev;
        console.log('DEBUG: isPrimaryDeveloper result:', result);
        
        await client.close();
        return result;
    } catch (error) {
        console.error('Error in isPrimaryDeveloper:', error);
        return false;
    }
}

// Add a function to check if user is secondary developer
async function isSecondaryDeveloper(ctx, userId) {
    try {
        const db = await ensureDatabaseInitialized();

        // First try matching by user_id
        const byId = await db.collection('secondary_developers').findOne({ user_id: userId });
        if (byId) {
            console.log(`User ${userId} found as secondary developer by ID.`);
            return true;
        }

        // Fallback: try matching by username
        const username = ctx.from?.username;
        if (username) {
            const byUsername = await db.collection('secondary_developers').findOne({ username: username });
            if (byUsername) {
                console.log(`User @${username} matched as secondary developer by username.`);
                return true;
            }
        }

        console.log(`User ${userId} is not a secondary developer.`);
        return false;
    } catch (error) {
        console.error('Error checking secondary developer status:', error);
        return false;
    }
}


async function deleteLatestPhotos(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        let deletedCount = 0;
        const maxDeletions = 8;

        if (ctx.message.reply_to_message) {
            // If replying to a message, check if it contains any type of image
            if (ctx.message.reply_to_message.photo || 
                ctx.message.reply_to_message.document?.mime_type?.startsWith('image/') ||
                ctx.message.reply_to_message.sticker?.is_animated === false) {
                try {
                    await ctx.telegram.deleteMessage(chatId, ctx.message.reply_to_message.message_id);
                    deletedCount = 1;
                } catch (error) {
                    console.error(`Failed to delete replied image:`, error);
                    return ctx.reply('❌ فشل في حذف الصورة المحددة.');
                }
            } else {
                return ctx.reply('❌ الرسالة التي تم الرد عليها لا تحتوي على صورة.');
            }
        } else {
            // If not replying, delete the latest images from the tracked photos
            const photos = photoMessages.get(chatId) || [];
            while (photos.length > 0 && deletedCount < maxDeletions) {
                const latestPhoto = photos.pop();
                try {
                    await ctx.telegram.deleteMessage(chatId, latestPhoto.messageId);
                    deletedCount++;
                } catch (error) {
                    console.error(`Failed to delete image:`, error);
                }
            }
            photoMessages.set(chatId, photos);
        }

        if (deletedCount > 0) {
            ctx.reply(`✅ تم حذف ${deletedCount} صورة بنجاح.`);
        } else {
            ctx.reply('❌ لم يتم العثور على صور لحذفها.');
        }
    } catch (error) {
        console.error('Error in deleteLatestPhotos:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة حذف الصور.');
    }
}
async function enableGifSharing(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        gifRestrictionStatus.set(chatId, false);
        ctx.reply('✅ تم تفعيل مشاركة الصور المتحركة للجميع.');
    } catch (error) {
        console.error('Error in enableGifSharing:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة الصور المتحركة.');
    }
}
async function disableDocumentSharing(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        documentRestrictionStatus.set(chatId, true);
        ctx.reply('✅ تم تعطيل مشاركة المستندات للأعضاء العاديين. فقط المشرفين يمكنهم إرسال المستندات الآن.');
    } catch (error) {
        console.error('Error in disableDocumentSharing:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تعطيل مشاركة المستندات.');
    }
}

async function enableDocumentSharing(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        documentRestrictionStatus.set(chatId, false);
        ctx.reply('✅ تم تفعيل مشاركة المستندات للجميع.');
    } catch (error) {
        console.error('Error in enableDocumentSharing:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تفعيل مشاركة المستندات.');
    }
}
async function promoteToSecondaryDeveloper(ctx) {
    try {
        console.log('DEBUG: Attempting to promote to secondary developer');
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            console.log('DEBUG: User is not an admin or owner');
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين ومالك المجموعة فقط.');
        }

        let userId, userMention, username;
        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
            username = ctx.message.reply_to_message.from.username;
        } else {
            const args = ctx.message.text.split(' ').slice(1);
            if (args.length === 0) {
                console.log('DEBUG: No username provided');
                return ctx.reply('❌ يجب ذكر معرف المستخدم (@username) أو الرد على رسالته لترقيته إلى مطور ثانوي.');
            }
            username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChat(username);
                userId = user.id;
                userMention = `[${user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                console.log('DEBUG: User not found', error);
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        }

        console.log('DEBUG: Attempting to connect to database');
        const db = await ensureDatabaseInitialized();
        
        console.log('DEBUG: Checking if user is already a secondary developer');
        const existingDev = await db.collection('secondary_developers').findOne({ user_id: userId });
        if (existingDev) {
            console.log('DEBUG: User is already a secondary developer');
            return ctx.reply('هذا المستخدم مطور ثانوي بالفعل.');
        }

        console.log('DEBUG: Adding user to secondary_developers collection');
        await db.collection('secondary_developers').insertOne({
            user_id: userId,
            username: username,
            promoted_at: new Date(),
            promoted_by: ctx.from.id
        });

        console.log('DEBUG: User successfully promoted to secondary developer');
        ctx.replyWithMarkdown(`✅ تم ترقية المستخدم ${userMention} إلى مطور ثانوي بنجاح.`);
    } catch (error) {
        console.error('Error promoting user to secondary developer:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة ترقية المستخدم إلى مطور ثانوي. الرجاء المحاولة مرة أخرى لاحقًا.');
    }
}

async function disableVideoSharing(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        videoRestrictionStatus.set(chatId, true);
        ctx.reply('✅ تم تعطيل مشاركة الفيديوهات للأعضاء العاديين. فقط المشرفين والأعضاء المميزين (VIP) يمكنهم إرسال الفيديوهات الآن.');
    } catch (error) {
        console.error('Error in disableVideoSharing:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تعطيل مشاركة الفيديوهات.');
    }
}
// Pin message
async function pinMessage(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply('❌ يجب الرد على الرسالة التي تريد تثبيتها.');
        }

        await ctx.pinChatMessage(ctx.message.reply_to_message.message_id);
        ctx.reply('✅ تم تثبيت الرسالة.');
    } catch (error) {
        console.error(error);
        ctx.reply('❌ حدث خطأ أثناء محاولة تثبيت الرسالة.');
    }
}
// Mute/Unmute user
async function muteUser(ctx, mute = true) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        let userId, userMention;
        const args = ctx.message.text.split(' ').slice(1);

        if (ctx.message.reply_to_message) {
            userId = ctx.message.reply_to_message.from.id;
            userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
        } else if (args.length > 0) {
            const username = args[0].replace('@', '');
            try {
                const user = await ctx.telegram.getChatMember(ctx.chat.id, username);
                userId = user.user.id;
                userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
            } catch (error) {
                return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
            }
        } else {
            return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) لكتمه/إلغاء كتمه.');
        }

        if (mute) {
            await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
                can_send_messages: false,
                can_send_media_messages: false,
                can_send_other_messages: false,
                can_add_web_page_previews: false
            });
            ctx.replyWithMarkdown(`✅ تم كتم المستخدم ${userMention}.`);
        } else {
            await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true
            });
            ctx.replyWithMarkdown(`✅ تم إلغاء كتم المستخدم ${userMention}.`);
        }
    } catch (error) {
        console.error('Error in muteUser:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة كتم/إلغاء كتم المستخدم.');
    }
}

//call command
async function callEveryone(ctx) {
    try {
        // Detailed permission check
        const botInfo = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
        console.log('Bot permissions:', JSON.stringify(botInfo, null, 2));

        if (!botInfo || botInfo.status !== "administrator") {
            return ctx.reply('❌ البوت ليس مشرفًا في هذه المجموعة.');
        }

        // Check for essential permissions
        const requiredPermissions = [
            'can_manage_chat',
            'can_delete_messages',
            'can_invite_users',
            'can_restrict_members',
            'can_pin_messages'
        ];

        const missingPermissions = requiredPermissions.filter(perm => !botInfo[perm]);

        if (missingPermissions.length > 0) {
            return ctx.reply(`❌ البوت يفتقد الصلاحيات التالية: ${missingPermissions.join(', ')}. يرجى تعديل صلاحيات البوت.`);
        }

        // Get chat information
        const chat = await ctx.telegram.getChat(ctx.chat.id);

        // Get chat administrators
        const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);

        if (admins.length === 0) {
            return ctx.reply('❌ لم يتم العثور على مشرفين في المجموعة.');
        }

        // Mention administrators
        const chunkSize = 4096;
        let message = "🚨 نداء للمشرفين:\n";
        for (const admin of admins) {
            if (admin.user.is_bot) continue; // Skip bots
            const mention = `[${admin.user.first_name}](tg://user?id=${admin.user.id})`;
            if (message.length + mention.length > chunkSize) {
                await ctx.reply(message, { parse_mode: "Markdown" });
                message = "🚨 متابعة النداء للمشرفين:\n";
            }
            message += ` ${mention}`;
        }

        if (message !== "🚨 نداء للمشرفين:\n" && message !== "🚨 متابعة النداء للمشرفين:\n") {
            await ctx.reply(message, { parse_mode: "Markdown" });
        }

        // Send a general message for all members
        await ctx.reply("🔔 تنبيه لجميع الأعضاء! يرجى الانتباه إلى هذا الإعلان الهام.", { parse_mode: "Markdown" });
    } catch (error) {
        console.error('Error in callEveryone:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة نداء الجميع.');
    }
}

async function getGroupLink(ctx) {
    try {
        // Check if the chat is a group
        if (!isGroupChat(ctx)) {
            return ctx.reply('❌ هذا الأمر يعمل فقط في المجموعات.');
        }

        // Check if the user is an admin or owner
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        // Generate a new invite link
        const chatInviteLink = await ctx.telegram.exportChatInviteLink(ctx.chat.id);
        
        // Send the link
        ctx.reply(`🔗 رابط المجموعة: ${chatInviteLink}`);
    } catch (error) {
        console.error('Error in getGroupLink:', error);
        ctx.reply('❌ حدث خطأ أثناء محاولة جلب رابط المجموعة.');
    }














// Command handler for "ترقية_ثانوي"
bot.command('ترقية_ثانوي', promoteToSecondaryDeveloper);

// Text handler for "ترقية ثانوي" (without underscore)
bot.hears(/^رفع ثانوي/, promoteToSecondaryDeveloper);

// Additional handler for flexibility
bot.hears(/^رفع مطور ثانوي/, promoteToSecondaryDeveloper);






bot.command('تنزيل مطور', async (ctx) => {
    if (!(await isOwner(ctx, ctx.from.id))) {
        return ctx.reply('❌ هذا الأمر مخصص للمالك فقط.');
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
        return ctx.reply('❌ يجب ذكر معرف المستخدم (@username) أو الرد على رسالته لتنزيله من المطورين.');
    }

    let userId, userMention;
    if (ctx.message.reply_to_message) {
        userId = ctx.message.reply_to_message.from.id;
        userMention = `[${ctx.message.reply_to_message.from.first_name}](tg://user?id=${userId})`;
    } else {
        const username = args[0].replace('@', '');
        try {
            const user = await ctx.telegram.getChat(username);
            userId = user.id;
            userMention = `[${user.first_name}](tg://user?id=${userId})`;
        } catch (error) {
            return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
        }
    }

    try {
        const connection = await pool.getConnection();
        await connection.query('DELETE FROM developers WHERE user_id = ?', [userId]);
        connection.release();
        ctx.replyWithMarkdown(`✅ تم تنزيل المستخدم ${userMention} من قائمة المطورين.`);
    } catch (error) {
        console.error('Error demoting developer:', error);
        ctx.reply('❌ حدث خطأ أثناء تنزيل المطور. الرجاء المحاولة مرة أخرى لاحقًا.');
    }
});




// Update the /start command handler
bot.start(async (ctx) => {
    console.log('DEBUG: "/start" command triggered by user:', ctx.from.id, ctx.from.username);
    try {
        await handleStartCommand(ctx);
    } catch (error) {
        console.error('Error in /start command handler:', error);
        await ctx.reply('❌ حدث خطأ أثناء معالجة الأمر. يرجى المحاولة مرة أخرى لاحقًا.');
    }
});


   





}


module.exports = { setupCommands, isAdminOrOwner,showMainMenu,showQuizMenu,getLeaderboard,getDifficultyLevels,updateGroupActivity, getQuestionsForDifficulty,isSecondaryDeveloper,isVIP,chatBroadcastStates,awaitingBroadcastPhoto,updateActiveGroups,handleCommandCallbacks,isBotOwner,isBotAdmin,promoteUser, };

