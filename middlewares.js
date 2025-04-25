const { developerIds } = require('./config');
const { getDb, pool } = require('./database');

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
    // First check hardcoded developer IDs
    if (developerIds.has(userId.toString())) {
        return true;
    }
    
    // Then check database
    try {
        const developers = await getDevelopers();
        return developers.some(dev => dev.user_id.toString() === userId.toString());
    } catch (error) {
        console.error('Error checking if user is developer:', error);
        return false;
    }
}

async function isSubscribed(ctx, userId) {
    try {
        // Check if we have a cached result that's still valid (cache for 5 minutes)
        const cachedResult = subscriptionCache.get(userId);
        if (cachedResult && (Date.now() - cachedResult.timestamp < 5 * 60 * 1000)) {
            console.log(`Using cached subscription status for user ${userId}: ${cachedResult.isSubscribed}`);
            return { 
                isSubscribed: cachedResult.isSubscribed, 
                statusChanged: false 
            };
        }

        console.log(`Checking subscription status for user ${userId}`);
        
        // Define the channels that require subscription
        const requiredChannels = [
            { username: 'ctrlsrc', title: 'قناة السورس' },
            { username: 'T0_B7', title: 'القناة الرسمية' }
        ];
        
        let allSubscribed = true;
        let notSubscribedChannels = [];
        
        // Check each channel
        for (const channel of requiredChannels) {
            try {
                // Verify the bot is an admin in the channel first
                const botMember = await ctx.telegram.getChatMember(`@${channel.username}`, ctx.botInfo.id);
                if (!['administrator', 'creator'].includes(botMember.status)) {
                    console.warn(`Bot is not an admin in @${channel.username}. Status: ${botMember.status}`);
                    // Continue checking anyway, but log the warning
                }
                
                const member = await ctx.telegram.getChatMember(`@${channel.username}`, userId);
                const isSubbed = ['member', 'administrator', 'creator'].includes(member.status);
                
                if (!isSubbed) {
                    allSubscribed = false;
                    notSubscribedChannels.push(channel);
                }
                
                console.log(`User ${userId} subscription status for @${channel.username}: ${isSubbed}`);
            } catch (error) {
                console.error(`Error checking subscription for @${channel.username}:`, error);
                // If we can't check, assume not subscribed for safety
                allSubscribed = false;
                notSubscribedChannels.push(channel);
            }
        }
        
        // Store the result in cache
        const previousStatus = subscriptionCache.get(userId)?.isSubscribed || false;
        subscriptionCache.set(userId, { 
            isSubscribed: allSubscribed, 
            timestamp: Date.now(),
            notSubscribedChannels: notSubscribedChannels
        });
        
        // Return the result with status change indicator
        return { 
            isSubscribed: allSubscribed, 
            statusChanged: previousStatus !== allSubscribed,
            notSubscribedChannels: notSubscribedChannels
        };
    } catch (error) {
        console.error(`Error in isSubscribed check for user ${userId}:`, error);
        // Default to false on error
        return { isSubscribed: false, statusChanged: false };
    }
}

function setupMiddlewares(bot) {
    bot.use(async (ctx, next) => {
        try {
            // Skip subscription check for non-command messages
            if (!ctx.message || !ctx.message.text || !ctx.message.text.startsWith('/')) {
                return next();
            }
            
            // Skip subscription check for groups and channels
            if (ctx.chat && ctx.chat.type !== 'private') {
                return next();
            }
            
            const userId = ctx.from.id;
            
            // Check if user is a developer
            if (await isDeveloper(ctx, userId)) {
                return next();
            }
            
            // For private chats with commands, check subscription
            try {
                const { isSubscribed } = await isSubscribed(ctx, userId);
                if (isSubscribed) {
                    return next();
                } else {
                    return ctx.reply('يرجى الاشتراك بقناة البوت للاستخدام', {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'اشترك الآن', url: 'https://t.me/ctrlsrc' }],
                                [{ text: 'تحقق من الاشتراك', callback_data: 'check_subscription' }]
                            ]
                        }
                    });
                }
            } catch (subError) {
                // If subscription check fails, allow the user to proceed
                console.error('Error checking subscription:', subError);
                return next();
            }
        } catch (error) {
            console.error('Error in middleware:', error);
            return next(); // Always proceed on error
        }
    });
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
    isSubscribed, 
    adminOnly,
    setupMiddlewares,
    getDevelopers,
    getDevelopersList
};
