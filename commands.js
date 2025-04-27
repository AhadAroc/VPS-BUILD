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
const { loadActiveGroupsFromDatabase } = require('./database'); // Adjust the path as necessary
const axios = require('axios');
// MongoDB connection for storing scores
let mongoClient = null;
const knownUsers = new Map();
// Map to track broadcasting state for each chat
const chatBroadcastStates = new Map();
let awaitingBroadcastPhoto = false;
   // Add this function near the top of your file, after your imports and before the bot commands
   async function getBotGroups(botId, userId) {
    try {
        const db = await ensureDatabaseInitialized();
        const groups = await db.collection('groups').find({ 
            is_active: true,
            $or: [
                { bot_id: botId },
                { members: userId }
            ]
        })
        .sort({ added_at: -1 }) // Sort by the most recently added
        .limit(5) // Limit to the 5 most recent groups, adjust as needed
        .toArray();
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
  // ✅ Function to check if the user is admin or owner
  async function isAdminOrOwner(ctx, userId) {
    try {
        if (!ctx.chat) {
            console.error('Chat context is missing');
            return false;
        }

        const chatId = ctx.chat.id;
        const chatMember = await ctx.telegram.getChatMember(chatId, userId);

        return ['creator', 'administrator'].includes(chatMember.status);
    } catch (error) {
        console.error('Error checking admin status:', error);
        // In case of an error, we'll assume the user is not an admin
        return false;
    }
}
// Add this function to check if a user is a VIP
async function isVIP(ctx, userId) {
    try {
        const db = await ensureDatabaseInitialized();
        const user = await db.collection('vip_users').findOne({ user_id: userId });
        console.log('User data for VIP check:', user);
        return !!user; // Returns true if the user is found in the vip_users collection, false otherwise
    } catch (error) {
        console.error('Error checking VIP status:', error);
        return false;
    }
}

// Add this middleware function
async function photoRestrictionMiddleware(ctx, next) {
    if (ctx.message && ctx.message.photo) {
        const chatId = ctx.chat.id;
        if (photoRestrictionStatus.get(chatId)) {
            const isAdmin = await isAdminOrOwner(ctx, ctx.from.id);
            const isVipUser = await isVIP(ctx, ctx.from.id);
            if (!isAdmin && !isVipUser) {
                try {
                    await ctx.deleteMessage();
                    await ctx.reply('❌ عذرًا، تم تعطيل إرسال الصور للأعضاء العاديين في هذه المجموعة.');
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
            const isAdmin = await isAdminOrOwner(ctx, ctx.from.id);
            const isVipUser = await isVIP(ctx, ctx.from.id);
            if (!isAdmin && !isVipUser) {
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
            const isAdmin = await isAdminOrOwner(ctx, ctx.from.id);
            const isVipUser = await isVIP(ctx, ctx.from.id);
            if (!isAdmin && !isVipUser) {
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
            const isAdmin = await isAdminOrOwner(ctx, ctx.from.id);
            if (!isAdmin) {
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
    return isAdmin || isSecDev;
}
// ✅ Display main menu
async function showMainMenu(ctx) {
    try {
        const userId = ctx.from.id;
        
        // Check if the user is an admin, owner, secondary developer, or VIP
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isSecDev = await isSecondaryDeveloper(ctx, userId);
        const isVIPUser = await isVIP(ctx, userId);

        if (!isAdmin && !isSecDev && !isVIPUser) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين والمطورين الثانويين والأعضاء المميزين فقط.');
        }

        // Get the original photo URL
        const photoUrl = 'https://i.postimg.cc/R0jjs1YY/bot.jpg';
        
        const keyboard = {
            inline_keyboard: [
                [{ text: 'test holder 1', url: 'https://t.me/ctrlsrc' }],
                [{ text: '📜 عرض الأوامر', callback_data: 'show_commands' }],
                
                [{ text: '🎮 بوت المسابقات', callback_data: 'quiz_bot' }],
                [{ text: 'ctrlsrc', url: 'https://t.me/ctrlsrc' }]
            ]
        };

        await ctx.replyWithPhoto(photoUrl, {
            caption: '🤖استخدم الامر : مساعدة للحصول على معلومات التشغيل والرفع والاستخدام  مرحبًا! أنا بوت الحماية والمسابقات ايضا اختر خيارًا:',
            reply_markup: keyboard
        });
    } catch (error) {
        console.error('Error in showMainMenu:', error);
        await ctx.reply('❌ حدث خطأ أثناء عرض القائمة الرئيسية.');
    }
}
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

async function getLeaderboard() {
    try {
        const db = await ensureDatabaseInitialized();
        const leaderboard = await db.collection('quiz_scores')
            .aggregate([
                { $group: { 
                    _id: "$userId", 
                    totalScore: { $sum: "$score" },
                    username: { $first: "$username" },
                    firstName: { $first: "$firstName" }
                }},
                { $sort: { totalScore: -1 } },
                { $limit: 10 }
            ])
            .toArray();

        let leaderboardText = "🏆 قائمة المتصدرين:\n\n";
        leaderboard.forEach((entry, index) => {
            const name = entry.firstName || entry.username || 'مستخدم مجهول';
            leaderboardText += `${index + 1}. ${name}: ${entry.totalScore} نقطة\n`;
        });

        return leaderboardText;
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return "❌ حدث خطأ أثناء جلب قائمة المتصدرين.";
    }
}
async function showQuizMenu(ctx) {
    try {
        const userId = ctx.from.id;
        
        // Check if the user is an admin, owner, or VIP
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isVIPUser = await isVIP(ctx, userId);

        if (!isAdmin && !isVIPUser) {
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
        };

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

async function checkUserRank(ctx) {
    try {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;
        let rank = 'عضو عادي'; // Default rank

        // Check if user is the owner
        if (ctx.from.username === 'Lorisiv') {
            rank = 'المطور الأساسي';
        } else {
            // Check if user is an admin or owner of the group
            const isAdmin = await isAdminOrOwner(ctx, userId);
            if (isAdmin) {
                const chatMember = await ctx.telegram.getChatMember(chatId, userId);
                rank = chatMember.status === 'creator' ? 'المالك' : 'مشرف';
            } else {
                // Check if user is a developer
                const isDev = await isDeveloper(ctx, userId);
                if (isDev) {
                    rank = 'مطور';
                } else {
                    // Check if user is a secondary developer
                    const isSecDev = await isSecondaryDeveloper(ctx, userId);
                    if (isSecDev) {
                        rank = 'مطور ثانوي';
                    } else {
                        // Check if user is VIP
                        const isVipUser = await isVIP(ctx, userId);
                        if (isVipUser) {
                            rank = 'امن مسابقا ت';
                        }
                    }
                }
            }
        }

        // Send the rank information
        await ctx.replyWithHTML(`<b>رتبتك:</b> ${rank}`);
    } catch (error) {
        console.error('Error in checkUserRank:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة التحقق من رتبتك.');
    }
}
async function checkUserSubscription(ctx) {
    try {
        const userId = ctx.from.id;
        const { isSubscribed: subscribed } = await isSubscribed(ctx, userId); // ✅ renamed here!

        if (subscribed) {
            subscriptionStatusCache.set(userId, true);

            if (ctx.chat?.type === 'private') {
                await showDevPanel(ctx);
            } else {
                await showMainMenu(ctx);
            }
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
        await ctx.answerCbQuery('❌ خطأ أثناء التحقق.', { show_alert: true }).catch(() => {});
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
function setupCommands(bot) {
    const { setupActions, activeQuizzes, endQuiz,configureQuiz,startAddingCustomQuestions,chatStates, } = require('./actions'); // these were up there
    bot.use(async (ctx, next) => {
        try {
            // allow if it's a private message without buttons
            if (ctx.chat?.type === 'private' && !ctx.callbackQuery) {
                return next();
            }
    
            const userId = ctx.from?.id;
            if (!userId) {
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
            const isDM = ctx.chat.type === 'private';
    
            console.log('DEBUG: "/start" command triggered by user:', userId, 'in chat type:', ctx.chat.type);
    
            if (ctx.from) {
                await updateLastInteraction(
                    ctx.from.id, 
                    ctx.from.username, 
                    ctx.from.first_name, 
                    ctx.from.last_name
                );
            }
    
            const isDevResult = await isDeveloper(ctx, userId);
    
            if (isDM) {
                if (isDevResult) {
                    console.log('DEBUG: Showing developer panel in DM');
                    return await showDevPanel(ctx);
                }
    
                // 📛 call the new function
                const subscribed = await checkUserSubscription(ctx);
                if (!subscribed) return; // stop if not subscribed
    
                // fallback welcome (only if necessary)
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
    
            if (isDevResult) {
                console.log('DEBUG: Showing developer panel in group');
                return await showDevPanel(ctx);
            }
    
            const isAdmin = await isAdminOrOwner(ctx, userId);
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
                        [{ text: 'test holder 1', url: 'https://t.me/ctrlsrc' }],
                        [{ text: '📜 عرض الأوامر', callback_data: 'show_commands' }],
                        
                        [{ text: '🎮 بوت المسابقات', callback_data: 'quiz_bot' }],
                        [{ text: 'ctrlsrc', url: 'https://t.me/ctrlsrc' }]
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
// Add these to your command setup function
bot.command('ترقية_ادمن', (ctx) => promoteUser(ctx, 'ادمن'));
bot.hears(/^ترقية ادمن/, (ctx) => promoteUser(ctx, 'ادمن'));

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
bot.hears(/^ترقية ثانوي/, promoteToSecondaryDeveloper);

// Additional handler for flexibility
bot.hears(/^ترقية مطور ثانوي/, promoteToSecondaryDeveloper);
bot.hears('تنزيل', (ctx) => demoteUser(ctx));
// Add these lines to your existing command handlers
bot.command('ترقية_مطور', async (ctx) => {
    await promoteUser(ctx, 'مطور');
});

bot.hears(/^ترقية مطور/, async (ctx) => {
    await promoteUser(ctx, 'مطور');
});
// Handle "نكتة" text command
bot.hears('نكتة', adminOnly((ctx) => sendJoke(ctx)));
bot.command('مسح الصور', adminOnly((ctx) => deleteLatestPhotos(ctx)));
bot.command('ازالة الروابط', adminOnly((ctx) => removeLinks(ctx)));
bot.hears('ازالة الروابط', (ctx) => removeLinks(ctx));
bot.command('معرفي', (ctx) => showUserId(ctx));
bot.hears('مسح الصور', (ctx) => deleteLatestPhotos(ctx));
bot.hears('معرفي', (ctx) => showUserId(ctx));
bot.command('تنزيل', adminOnly((ctx) => demoteUser(ctx)));
bot.hears('تنزيل', adminOnly((ctx) => demoteUser(ctx)));
bot.hears('فتح روابط', adminOnly((ctx) => enableLinkSharing(ctx)));
bot.hears('غلق روابط', adminOnly((ctx) => disableLinkSharing(ctx)));
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
bot.hears('سماح الصور', adminOnly((ctx) => enablePhotoSharing(ctx)));
// Add command handlers for promoting and demoting VIP users
bot.command('ترقية_مميز', (ctx) => promoteUser(ctx, 'مميز'));
bot.command('تنزيل_مميز', demoteUser);

// Add hears handlers for promoting and demoting VIP users
bot.hears(/^رفع امن مسابقات/, (ctx) => promoteUser(ctx, 'مميز'));
bot.hears(/^تنزيل امن مسابقات/, demoteUser);

bot.command('معرفي', (ctx) => showUserId(ctx));

bot.hears('معرفي', (ctx) => showUserId(ctx));
bot.command('تنزيل', adminOnly((ctx) => demoteUser(ctx)));
bot.hears('تنزيل', adminOnly((ctx) => demoteUser(ctx)));

bot.command('كتم', adminOnly((ctx) => muteUser(ctx, true)));
bot.command('الغاء_كتم', adminOnly((ctx) => muteUser(ctx, false)));

bot.command('منع فيديو', adminOnly((ctx) => disableVideoSharing(ctx)));
bot.command('تفعيل فيديو', adminOnly((ctx) => enableVideoSharing(ctx)));

// Also add handlers for text commands without the slash
bot.hears('منع فيديو', adminOnly((ctx) => disableVideoSharing(ctx)));
bot.hears('تفعيل فيديو', adminOnly((ctx) => enableVideoSharing(ctx)));
bot.command('منع_متحركة', adminOnly((ctx) => disableGifSharing(ctx)));
bot.command('تفعيل_متحركة', adminOnly((ctx) => enableGifSharing(ctx)));

// Also add handlers for text commands without the underscore
bot.hears('منع متحركة', adminOnly((ctx) => disableGifSharing(ctx)));
bot.hears('تفعيل متحركة', adminOnly((ctx) => enableGifSharing(ctx)));
bot.command('ترقية_مطور', (ctx) => promoteUser(ctx, 'مطور'));
bot.hears(/^ترقية مطوسر/, (ctx) => promoteUser(ctx, 'مطور'));
bot.command('ترقية_اساسي', (ctx) => promoteUser(ctx, 'مطور أساسي'));
bot.hears(/^ترقية اساسي/, (ctx) => promoteUser(ctx, 'مطور أساسي'));

bot.command('منع_مستندات', adminOnly((ctx) => disableDocumentSharing(ctx)));
bot.command('تفعيل_مستندات', adminOnly((ctx) => enableDocumentSharing(ctx)));
bot.command('رتبتي', checkUserRank);
    bot.hears('رتبتي', checkUserRank);
// Also add handlers for text commands without the underscore
bot.hears('منع مستندات', adminOnly((ctx) => disableDocumentSharing(ctx)));
bot.hears('تفعيل مستندات', adminOnly((ctx) => enableDocumentSharing(ctx)));

// Make sure to use this middleware
bot.use(photoRestrictionMiddleware);
bot.use(linkRestrictionMiddleware);
bot.use(videoRestrictionMiddleware);
bot.use(gifRestrictionMiddleware);
bot.use(documentRestrictionMiddleware);


bot.hears('الاوامر', (ctx) => {
    ctx.reply(getCommandList());
});

// Add this near your other command handlers
bot.command('stop', async (ctx) => {
    const chatId = ctx.chat.id;
    if (activeQuizzes.has(chatId)) {
        await endQuiz(ctx, chatId);
        await ctx.reply('تم إيقاف المسابقة.');
    } else {
        await ctx.reply('لا توجد مسابقة نشطة حالياً.');
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
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.answerCbQuery('❌ هذا الأمر مخصص للمشرفين فقط.');
        }
        await ctx.answerCbQuery();
        await startAddingCustomQuestions(ctx);
    } catch (error) {
        console.error('Error handling add_custom_questions action:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة إضافة أسئلة مخصصة.');
    }
});

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
// Update the "بدء" command handler
bot.hears('بدء', async (ctx) => {
    console.log(`DEBUG بدء triggered in chat type: ${ctx.chat.type}, userId: ${userId}, subscribed: ${subscribed}`);

    try {
        const userId = ctx.from.id;

        // ✅ Use the cached/fresh isSubscribed function (not manual axios)
        const { isSubscribed: subscribed } = await isSubscribed(ctx, userId);

        if (subscribed) {
            if (ctx.chat.type === 'private') {
                await showDevPanel(ctx);
            } else {
                await showMainMenu(ctx);
            }
            return;
        } else {
            const subscriptionMessage = '⚠️ لم تشترك في جميع القنوات بعد! لاستخدام البوت بشكل كامل، يرجى الاشتراك في القنوات التالية:';

            const inlineKeyboard = [
                [{ text: '📢 قناة السورس', url: 'https://t.me/sub2vea' }],
                [{ text: '📢 القناة الرسمية', url: 'https://t.me/leavemestary' }],
                [{ text: '✅ تحقق من الاشتراك مرة أخرى', callback_data: 'check_subscription' }]
            ];

            await ctx.reply(subscriptionMessage, {
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
            return;
        }

    } catch (error) {
        console.error('Error handling "بدء" command:', error);
        ctx.reply('❌ حدث خطأ أثناء معالجة الأمر. يرجى المحاولة مرة أخرى لاحقًا.');
    }
});


// Add this function to list VIP users
async function listVIPUsers(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const db = await ensureDatabaseInitialized();
        const vipUsers = await db.collection('vip_users').find().toArray();

        if (vipUsers.length === 0) {
            return ctx.reply('لا يوجد مستخدمين مميزين (VIP) حاليًا.');
        }

        let message = '📋 قائمة المستخدمين المميزين (VIP):\n\n';
        for (const user of vipUsers) {
            const userMention = user.username ? 
                `@${user.username}` : 
                `[المستخدم](tg://user?id=${user.user_id})`;
            message += `• ${userMention} (ID: ${user.user_id})\n`;
        }

        await ctx.replyWithMarkdown(message);
    } catch (error) {
        console.error('Error listing VIP users:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة عرض قائمة المستخدمين المميزين.');
    }
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
            // Check if the message is from a private chat (DM)
            if (ctx.chat.type !== 'private') {
                await ctx.reply('⚠️ يمكن استخدام لوحة التحكم في الرسائل الخاصة فقط.');
                return;
            }
        
            // Check if the user is a developer (including main developer and promoted developers)
            const isDev = await isDeveloper(ctx, ctx.from.id);
            if (!isDev) {
                await ctx.reply('⛔ عذرًا، هذه اللوحة مخصصة للمطورين فقط.');
                return;
            }
        
            const message = 'مرحبا عزيزي المطور\nإليك ازرار التحكم بالاقسام\nتستطيع التحكم بجميع الاقسام فقط اضغط على القسم الذي تريده';
            const keyboard = {
                inline_keyboard: [
                    [{ text: '• الردود •', callback_data: 'dev_replies' }],
                    [{ text: '• الإذاعة •', callback_data: 'dev_broadcast' }],
                    [{ text: 'السورس', callback_data: 'dev_source' }],
                    [{ text: '• اسم البوت •', callback_data: 'dev_bot_name' }],
                    [{ text: 'الاحصائيات', callback_data: 'dev_statistics' }],
                    [{ text: 'المطورين', callback_data: 'dev_developers' }],
                    [{ text: 'قريبا', callback_data: 'dev_welcome' }],
                    [{ text: 'ctrlsrc', url: 'https://t.me/ctrlsrc' }],
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
    function getCommandList() {
        return `📜 *قائمة الأوامر:*
    
    🔹 /معرفي – ظهور الايدي و معرفك
    🔹 /ترقية مميز – رفع مميز
    🔹 /تنزيل مميز – تنزيل مميز
    🔹 /لستة مميز – عرض قائمة المميزين
    🔹 /ترقية ادمن – ترقية إلى أدمن
    🔹 /ترقية منشئ – ترقية إلى منشئ
    🔹 /تنزيل – إزالة رتبة الأدمن
    🔹 /ترقية مطور – ترقية إلى مطور
    🔹 /ترقية مطور ثانوي – ترقية إلى مطور ثانوي
    🔹 /تنزيل مطور – لتنزيل مطور أول أو ثانوي، اذهب إلى خاص البوت كمطور
    🔹 /رابط المجموعة – الحصول على رابط المجموعة
    🔹 /نداء الجميع – مناداة جميع الأعضاء
    🔹 /كتم – كتم مستخدم
    🔹 /الغاء كتم – إلغاء كتم مستخدم
    🔹 /مسح – حذف آخر رسالة
    🔹 /تثبيت – تثبيت رسالة
    🔹 /نكتة – إرسال نكتة
    🔹 /طرد – طرد مستخدم
    🔹 /مسح الصور – حذف آخر الصور المرسلة
    🔹 /منع الصور – منع إرسال الصور
    🔹 /سماح الصور – السماح بإرسال الصور
    🔹 /ازالة الروابط – حذف الروابط في المجموعة
    🔹 /فتح روابط – السماح بمشاركة الروابط
    🔹 /غلق روابط – منع مشاركة الروابط
    🔹 /منع فيديو – منع إرسال الفيديوهات
    🔹 /تفعيل فيديو – السماح بإرسال الفيديوهات
    🔹 /منع متحركة – منع إرسال الصور المتحركة
    🔹 /تفعيل متحركة – السماح بإرسال الصور المتحركة`;
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
            const firstName = ctx.from.first_name || 'User';
            const username = ctx.from.username ? `@${ctx.from.username}` : 'N/A';
            
            const message = `${firstName}\nمعرفي\n${username} ↫ معرفك ↓\n${userId}`;
            
            await ctx.replyWithHTML(`<code>${message}</code>`);
        } catch (error) {
            console.error('Error in showUserId:', error);
            ctx.reply('❌ حدث خطأ أثناء محاولة عرض معرف المستخدم.');
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
            let collection, successMessage;
    
            switch (role.toLowerCase()) {
                case 'مميز':
                case 'vip':
                    collection = 'vip_users';
                    successMessage = `✅ تم ترقية المستخدم ${userMention} إلى من مسابقات (VIP).`;
                    break;
                case 'ادمن':
                case 'admin':
                    collection = 'admins';
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
    
            await db.collection(collection).updateOne(
                { user_id: userId },
                { 
                    $set: { 
                        user_id: userId, 
                        username: ctx.message.reply_to_message ? ctx.message.reply_to_message.from.username : args[0],
                        promoted_at: new Date(),
                        promoted_by: ctx.from.id
                    }
                },
                { upsert: true }
            );
            
            ctx.replyWithMarkdown(successMessage);
    
            console.log(`User ${userId} promoted to ${role}`);
    
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
    
            let userId, userMention;
            const replyMessage = ctx.message.reply_to_message;
    
            if (replyMessage) {
                userId = replyMessage.from.id;
                userMention = `[${replyMessage.from.first_name}](tg://user?id=${userId})`;
            } else {
                const args = ctx.message.text.split(' ').slice(1);
                if (args.length === 0) {
                    return ctx.reply('❌ يجب الرد على رسالة المستخدم أو ذكر معرفه (@username) أو معرفه الرقمي.');
                }
                const username = args[0].replace('@', '');
                try {
                    const user = await ctx.telegram.getChatMember(ctx.chat.id, username);
                    userId = user.user.id;
                    userMention = `[${user.user.first_name}](tg://user?id=${userId})`;
                } catch (error) {
                    return ctx.reply('❌ لم يتم العثور على المستخدم. تأكد من المعرف أو قم بالرد على رسالة المستخدم.');
                }
            }
    
            const db = await ensureDatabaseInitialized();
            let collection, successMessage;
    
            // Check all possible roles
            const roles = ['developers', 'secondary_developers', 'primary_developers', 'admins', 'vip_users'];
            let userRole = null;
    
            for (const role of roles) {
                const user = await db.collection(role).findOne({ user_id: userId });
                if (user) {
                    userRole = role;
                    break;
                }
            }
    
            if (!userRole) {
                return ctx.reply('❌ هذا المستخدم ليس لديه أي رتبة خاصة للإزالة.');
            }
    
            // Remove the user from the corresponding collection
            await db.collection(userRole).deleteOne({ user_id: userId });
    
            switch (userRole) {
                case 'developers':
                    successMessage = `✅ تم إزالة رتبة المطور من المستخدم ${userMention}.`;
                    break;
                case 'secondary_developers':
                    successMessage = `✅ تم إزالة رتبة المطور الثانوي من المستخدم ${userMention}.`;
                    break;
                case 'primary_developers':
                    successMessage = `✅ تم إزالة رتبة المطور الأساسي من المستخدم ${userMention}.`;
                    break;
                case 'admins':
                    successMessage = `✅ تم إزالة رتبة الادمن من المستخدم ${userMention}.`;
                    // Remove admin privileges in the Telegram group
                    await ctx.telegram.promoteChatMember(ctx.chat.id, userId, {
                        can_change_info: false,
                        can_delete_messages: false,
                        can_invite_users: false,
                        can_restrict_members: false,
                        can_pin_messages: false,
                        can_promote_members: false
                    });
                    break;
                case 'vip_users':
                    successMessage = `✅ تم إزالة رتبة امن المسابقات (VIP) من المستخدم ${userMention}.`;
                    // Reset user permissions to default
                    await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
                        can_send_messages: true,
                        can_send_media_messages: true,
                        can_send_polls: true,
                        can_send_other_messages: true,
                        can_add_web_page_previews: true,
                        can_change_info: false,
                        can_invite_users: false,
                        can_pin_messages: false
                    });
                    break;
            }
    
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
        const secondaryDev = await db.collection('secondary_developers').findOne({ user_id: userId });
        return !!secondaryDev; // Returns true if the user is found in the secondary_developers collection, false otherwise
    } catch (error) {
        console.error('Error checking secondary developer status:', error);
        return false; // Return false in case of any error
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
bot.hears(/^ترقية ثانوي/, promoteToSecondaryDeveloper);

// Additional handler for flexibility
bot.hears(/^ترقية مطور ثانوي/, promoteToSecondaryDeveloper);






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


module.exports = { setupCommands, isAdminOrOwner,showMainMenu,showQuizMenu,getLeaderboard,getDifficultyLevels, getQuestionsForDifficulty,isSecondaryDeveloper,isVIP,chatBroadcastStates,awaitingBroadcastPhoto,updateActiveGroups };

