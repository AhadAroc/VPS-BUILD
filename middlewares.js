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
        const chatMember = await ctx.telegram.getChatMember('@ctrlsrc', userId);
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
        console.error('خطأ في التحقق من الاشتراك:', error);
        return false;
    }
}

function setupMiddlewares(bot) {
    bot.use(async (ctx, next) => {
        try {
            console.log('Received message:', ctx.message);

            if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
                const userId = ctx.from.id;
                const isSubbed = await isSubscribed(ctx, userId);
                if (!isSubbed && !await isDeveloper(ctx, userId)) {
                    return ctx.reply('يرجى الاشتراك بقناة البوت للاستخدام', {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'اشترك الآن', url: 'https://t.me/ctrlsrc' }],
                                [{ text: 'تحقق من الاشتراك', callback_data: 'check_subscription' }]
                            ]
                        }
                    });
                }
            }

            await next();
        } catch (error) {
            console.error('Error in middleware:', error);
        }
    });
}

function adminOnly(handler) {
    return async (ctx) => {
        try {
            const userId = ctx.from.id;
            const chatId = ctx.chat.id;

            // Check if the user is the owner
            if (ctx.from.username === 'Lorisiv') {
                return handler(ctx);
            }

            // Check subscription
            const { isSubscribed, statusChanged } = await isSubscribed(ctx, userId);
            if (!isSubscribed) {
                return ctx.reply('يرجى الاشتراك بقناة البوت للاستخدام', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'اشترك الآن', url: 'https://t.me/ctrlsrc' }],
                            [{ text: 'تحقق من الاشتراك', callback_data: 'check_subscription' }]
                        ]
                    }
                });
            }

            if (statusChanged) {
                // User just subscribed, show the new prompt
                await ctx.reply('شكراً لاشتراكك! يمكنك الآن استخدام البوت.', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'أضفني إلى مجموعتك', url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }],
                            [{ text: 'قناة السورس', url: 'https://t.me/ctrlsrc' }]
                        ]
                    }
                });
            }

            const member = await ctx.telegram.getChatMember(chatId, userId);
            if (member.status === 'creator' || member.status === 'administrator') {
                return handler(ctx);
            } else {
                ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
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
