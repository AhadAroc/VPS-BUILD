




const { MongoClient } = require('mongodb');
const { mongoUri, dbName } = require('./config');
const { getDevelopers, getReplies, addReply, updateReply } = require('./database');

const developerIds = new Set(['7308214106']);
const gifRestrictionStatus = new Map();
const subscriptionCache = new Map();
const linkRestrictionStatus = new Map();
let photoMessages = new Map(); // chatId -> Set of message IDs
const photoRestrictionStatus = new Map();
let activeGroups = new Map();
const videoRestrictionStatus = new Map();

let generalReplies = new Map();
let awaitingReplyWord = false;
let awaitingReplyResponse = false;
let tempReplyWord = '';






 







function setupHandlers(bot) {
    

    
    
    // ✅ Function to check if the user is admin or owner
async function isAdminOrOwner(ctx, userId) {
    try {
        if (ctx.chat.type === 'private') {
            return false; // Not a group chat
        }
        const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        return ['administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
        console.error('Error checking user role:', error);
        return false;
    }
}// ✅ Wrapper function to check permissions before executing commands
function adminOnly(commandFunction) {
    return async (ctx) => {
        if (await isAdminOrOwner(ctx, ctx.from.id)) {
            return commandFunction(ctx);
        } else {
            return ctx.reply('❌ عذرًا، هذا الأمر مخصص للمشرفين فقط.');
        }
    };
}

    // ✅ Update active groups
function updateActiveGroups(ctx) {
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        activeGroups.set(ctx.chat.id, { title: ctx.chat.title, id: ctx.chat.id });
    }
}

// ✅ Show list of active groups
function getActiveGroups() {
    if (activeGroups.size === 0) return '❌ لا توجد مجموعات نشطة.';
    let message = '🚀 قائمة المجموعات النشطة:\n\n';
    activeGroups.forEach((group) => {
        message += `🔹 ${group.title}\n`;
    });
    return message;
}

// ✅ Display main menu
function showMainMenu(ctx) {
    ctx.replyWithPhoto('https://postimg.cc/QBJ4V7hg/5c655f5c', {
        caption: '🤖 مرحبًا! أنا بوت الحماية. اختر خيارًا:',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📜 عرض الأوامر', callback_data: 'show_commands' }],
                [{ text: '📂 عرض المجموعات النشطة', callback_data: 'show_active_groups' }]
            ]
        }
    });
}


// Register the text handler



    









   
    // Add this closing brace to end the setupHandlers function
}



module.exports = { 
    setupHandlers,
    developerIds  // Add this line to export developerIds
};
