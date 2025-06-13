const { developerIds } = require('./config');
//const { isSubscribed } = require('./commands');
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

    const db = await ensureDatabaseInitialized();

    try {
        // First check by user_id
        const byId = await db.collection('developers').findOne({ user_id: userId });
        if (byId) {
            console.log(`User ${userId} found as developer by ID.`);
            return true;
        }

        // Fallback: check by username
        const username = ctx.from?.username;
        if (username) {
            const byUsername = await db.collection('developers').findOne({ username: username });
            if (byUsername) {
                console.log(`User ${username} matched as developer by username.`);
                return true;
            }
        }

        console.log(`User ${userId} is not a developer.`);
        return false;
    } catch (error) {
        console.error('Error checking if user is developer:', error);
        return false;
    }
}



function setupMiddlewares(bot) {
 // Add a middleware to check subscription for all commands in private chats
    
 }    

// Add the check_subscription function directly in this file
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
