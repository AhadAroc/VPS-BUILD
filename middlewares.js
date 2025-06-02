const { developerIds } = require('./config');
const { getDb, pool } = require('./database');
const axios = require('axios');
// Add this at the top of the file with other imports
const SUBSCRIPTION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Add this new Map to store last check times
const lastSubscriptionCheckTime = new Map();
const subscriptionStatusCache = new Map(); // cache to remember users
// Create a Map to cache subscription status
const subscriptionCache = new Map();
async function isAdminOrOwner(ctx, userId) {
    try {
        if (ctx.chat.type === 'private') return false;
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        return ['administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
        console.error('خطأ في التحقق من المشرف:', error);
        return false;
    }
}

async function getDevelopers() {
    try {
        // First, check MongoDB for developers
        const db = getDb();
        if (db) {
            const devsCollection = db.collection('developers');
            const mongoDevs = await devsCollection.find({}).toArray();
            
            // If MongoDB has developers, return them
            if (mongoDevs && mongoDevs.length > 0) {
                return mongoDevs;
            }
        }
        
        // If no MongoDB developers or MongoDB is not available, check MySQL
        if (pool) {
            const connection = await pool.getConnection();
            const [rows] = await connection.query('SELECT user_id, username FROM developers');
            connection.release();
            return rows;
        }
        
        // If neither database has developers, return the hardcoded ones from config
        return Array.from(developerIds).map(id => ({ user_id: id }));
    } catch (error) {
        console.error('Error fetching developers:', error);
        // Fallback to hardcoded developers from config
        return Array.from(developerIds).map(id => ({ user_id: id }));
    }
}

async function isDeveloper(ctx, userId) {
    console.log(`Checking if user ${userId} is a developer`);
    
    // First check hardcoded developer IDs
    if (developerIds.has(userId.toString())) {
        console.log(`User ${userId} is a hardcoded developer`);
        return true;
    }
    
    // Then check database
    try {
        const developers = await getDevelopers();
        console.log(`Retrieved ${developers.length} developers from database:`, developers);
        
        const isDev = developers.some(dev => {
            const devId = dev.user_id.toString();
            const checkId = userId.toString();
            const isMatch = devId === checkId;
            console.log(`Comparing dev ID ${devId} with user ID ${checkId}: ${isMatch}`);
            return isMatch;
        });
        
        console.log(`Final result for user ${userId}: isDeveloper = ${isDev}`);
        return isDev;
    } catch (error) {
        console.error('Error checking if user is developer:', error);
        return false;
    }
}


function setupMiddlewares(bot) {
 // Add a middleware to check subscription for all commands in private chats
     bot.use(async (ctx, next) => {
         try {
             // Skip for non-private chats
             if (ctx.chat && ctx.chat.type !== 'private') {
                 return next();
             }
             
             const userId = ctx.from.id;
             
             // For private chats, check subscription - EVEN FOR DEVELOPERS
             const { isSubscribed: isUserSubscribed } = await isSubscribed(ctx, userId);
             
             // If user is subscribed, allow them to proceed
             if (isUserSubscribed) {
                 return next();
             }
             
             // If this is a callback query for checking subscription, allow it
             if (ctx.callbackQuery && ctx.callbackQuery.data === 'check_subscription') {
                 return next();
             }
             
             // If user is not subscribed, show subscription message
             console.log(`User ${userId} is not subscribed, showing subscription message`);
             
             let subscriptionMessage = 'لاستخدام البوت بشكل كامل، يرجى الاشتراك في القنوات التالية:';
             
             // Create inline keyboard with subscription buttons directly
             const inlineKeyboard = [
                 [{ text: '📢 قناة السورس', url: 'https://t.me/sub2vea' }],
                 [{ text: '📢 القناة الرسمية', url: 'https://t.me/leavemestary' }],
                 [{ text: '✅ تحقق من الاشتراك', callback_data: 'check_subscription' }]
             ];
             
             // If it's a callback query, answer it and edit the message
             if (ctx.callbackQuery) {
                 await ctx.answerCbQuery('يرجى الاشتراك في جميع القنوات المطلوبة');
                 await ctx.editMessageText(subscriptionMessage, {
                     reply_markup: { inline_keyboard: inlineKeyboard }
                 });
             } else {
                 // Otherwise send a new message
                 await ctx.reply(subscriptionMessage, {
                     reply_markup: { inline_keyboard: inlineKeyboard }
                 });
             }
             
             // Don't proceed to the next middleware
             return;
         } catch (error) {
             console.error('Error in subscription middleware:', error);
             // On error, allow the user to proceed
             return next();
         }
     });
 }    

// Add the check_subscription function directly in this file
async function check_subscription(ctx) {
    try {
        const userId = ctx.from.id;
        await ctx.answerCbQuery('جاري التحقق من اشتراكك...');
        
        const { isSubscribed, statusChanged } = await isSubscribed(ctx, userId);
        
        if (isSubscribed) {
            // User is now subscribed
            await ctx.editMessageText('✅ تم التحقق من اشتراكك بنجاح! يمكنك الآن استخدام البوت بشكل كامل.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 بدء استخدام البوت', callback_data: 'start_using_bot' }]
                    ]
                }
            });
        } else {
            // User is still not subscribed
            await ctx.answerCbQuery('❌ لم يتم الاشتراك في جميع القنوات المطلوبة بعد.', { show_alert: true });
        }
    } catch (error) {
        console.error('Error in check_subscription:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء التحقق من الاشتراك.', { show_alert: true });
    }
}
function adminOnly(handler) {
    return async (ctx) => {
        try {
            const userId = ctx.from.id;
            
            // Check if the user is the owner by username
            if (ctx.from.username === 'Lorisiv') {
                return handler(ctx);
            }
            
            // Check if user is a developer
            if (await isDeveloper(ctx, userId)) {
                return handler(ctx);
            }
            
            // For group chats, check admin status
            if (ctx.chat.type !== 'private') {
                try {
                    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
                    if (member.status === 'creator' || member.status === 'administrator') {
                        return handler(ctx);
                    } else {
                        return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
                    }
                } catch (adminError) {
                    console.error('Error checking admin status:', adminError);
                    return ctx.reply('❌ حدث خطأ أثناء التحقق من صلاحيات المستخدم.');
                }
            } else {
                // In private chats, only developers and the owner can use admin commands
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
        } catch (error) {
            console.error('Error in adminOnly wrapper:', error);
            ctx.reply('❌ حدث خطأ أثناء التحقق من صلاحيات المستخدم.');
        }
    };
}

async function getDevelopersList() {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT user_id, username FROM developers');
        connection.release();
        return rows;
    } catch (error) {
        console.error('Error fetching developers list:', error);
        return [];
    }
}

module.exports = { 
    isAdminOrOwner, 
    isDeveloper, 
   
    adminOnly,
    setupMiddlewares,
    getDevelopers,
    getDevelopersList
};
