
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

//there was a bot .on('message', async (ctx) => { here
bot.on('video', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const isRestricted = videoRestrictionStatus.get(chatId);

        if (isRestricted) {
            const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
            
            if (chatMember.status !== 'administrator' && chatMember.status !== 'creator') {
                await ctx.deleteMessage();
                await ctx.reply('❌ عذرًا، إرسال الفيديوهات غير مسموح حاليًا للأعضاء العاديين في هذه المجموعة.');
                return;
            }
        }

        // Handle video reply if awaiting response
        if (awaitingReplyResponse) {
            const userId = ctx.from.id;
            const username = ctx.from.username;
            let replyText;

            if (ctx.chat.username) {
                replyText = `https://t.me/${ctx.chat.username}/${ctx.message.message_id}`;
            } else {
                replyText = ctx.message.video.file_id;
            }

            try {
                const connection = await pool.getConnection();
                await connection.query(
                    'INSERT INTO replies (user_id, username, trigger_word, reply_text, media_type) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE reply_text = ?, media_type = ?',
                    [userId, username, tempReplyWord.trim(), replyText, 'video', replyText, 'video']
                );
                connection.release();
                await ctx.reply(`✅ تم إضافة الرد بنجاح!\nالكلمة: ${tempReplyWord}\nنوع الرد: فيديو`);
            } catch (error) {
                console.error('❌ خطأ أثناء حفظ الرد:', error);
                await ctx.reply('❌ حدث خطأ أثناء حفظ الرد.');
            }

            awaitingReplyResponse = false;
            tempReplyWord = '';
        }

        // Continue with any existing video handling logic...
    } catch (error) {
        console.error('Error handling video message:', error);
    }
});
// Register the text handler
bot.on('text', async (ctx) => {
    console.log('Received text:', ctx.message.text);

    const userId = ctx.from.id;
    const username = ctx.from.username;
    const text = ctx.message.text.toLowerCase();

    if (awaitingReplyWord) {
        tempReplyWord = text;
        ctx.reply(`تم استلام الكلمة: "${tempReplyWord}". الآن أرسل الرد الذي تريد إضافته لهذه الكلمة:`);
        awaitingReplyWord = false;
        awaitingReplyResponse = true;
    } else if (awaitingReplyResponse) {
        const replyResponse = ctx.message.text;
        try {
            const db = await ensureDatabaseInitialized();
            await db.collection('replies').updateOne(
                { trigger_word: tempReplyWord },
                { $set: { trigger_word: tempReplyWord, reply_type: 'text', reply_content: replyResponse } },
                { upsert: true }
            );
            
            ctx.reply(`تم إضافة الرد بنجاح!\nالكلمة: ${tempReplyWord}\nالرد: ${replyResponse}`);
            awaitingReplyResponse = false;
        } catch (error) {
            console.error('Error saving reply:', error);
            ctx.reply('حدث خطأ أثناء حفظ الرد. الرجاء المحاولة مرة أخرى.');
            awaitingReplyResponse = false;
        }
    } else if (awaitingDeleteReplyWord) {
        try {
            const db = await ensureDatabaseInitialized();
            const result = await db.collection('replies').deleteOne({ trigger_word: text });
            
            if (result.deletedCount > 0) {
                ctx.reply(`تم حذف الرد للكلمة "${text}" بنجاح.`);
            } else {
                ctx.reply(`لم يتم العثور على رد للكلمة "${text}".`);
            }
            awaitingDeleteReplyWord = false;
        } catch (error) {
            console.error('Error deleting reply:', error);
            ctx.reply('حدث خطأ أثناء حذف الرد. الرجاء المحاولة مرة أخرى.');
            awaitingDeleteReplyWord = false;
        }
    } else if (awaitingBotName) {
        try {
            await ctx.telegram.setMyName(text);
            ctx.reply(`تم تغيير اسم البوت بنجاح إلى: ${text}`);
            awaitingBotName = false;
        } catch (error) {
            console.error('Error changing bot name:', error);
            ctx.reply('حدث خطأ أثناء تغيير اسم البوت. الرجاء المحاولة مرة أخرى.');
            awaitingBotName = false;
        }
    } else {
        // Check if the message matches any reply trigger
        try {
            const db = await ensureDatabaseInitialized();
            const reply = await db.collection('replies').findOne({ trigger_word: text });
            
            if (reply) {
                switch (reply.reply_type) {
                    case 'text':
                        await ctx.reply(reply.reply_content);
                        break;
                    case 'gif':
                        await ctx.replyWithAnimation(reply.reply_content);
                        break;
                    case 'photo':
                        await ctx.replyWithPhoto(reply.reply_content);
                        break;
                    case 'video':
                        await ctx.replyWithVideo(reply.reply_content);
                        break;
                    default:
                        await ctx.reply('نوع الرد غير معروف.');
                }
            }
        } catch (error) {
            console.error('Error checking for reply:', error);
        }
    }

    // Update last interaction for the user
    updateLastInteraction(userId);
    
    // If in a group, update the group's active status
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        updateActiveGroups(ctx);
    }
});


    









    bot.on('photo', async (ctx) => {
        try {
            const chatId = ctx.chat.id;
            const isRestricted = photoRestrictionStatus.get(chatId);
    
            if (isRestricted) {
                const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
                
                if (chatMember.status !== 'administrator' && chatMember.status !== 'creator') {
                    await ctx.deleteMessage();
                    await ctx.reply('❌ عذرًا، إرسال الصور غير مسموح حاليًا للأعضاء العاديين في هذه المجموعة.');
                    return;
                }
            }
    
            // Continue with existing photo handling logic...
            if (!photoMessages.has(chatId)) {
                photoMessages.set(chatId, []);
            }
            photoMessages.get(chatId).push({
                messageId: ctx.message.message_id,
                timestamp: Date.now()
            });
    
            // Keep only the last 100 photos
            const photos = photoMessages.get(chatId);
            if (photos.length > 100) {
                photos.shift();
            }
        } catch (error) {
            console.error('Error handling photo message:', error);
        }
    });
    
    
    // Add this to your existing message handler for GIFs
    bot.on('animation', async (ctx) => {
        if (awaitingReplyResponse) {
            const gifFileId = ctx.message.animation.file_id;
            try {
                const db = await ensureDatabaseInitialized();
                await db.collection('replies').updateOne(
                    { trigger_word: tempReplyWord },
                    { $set: { trigger_word: tempReplyWord, reply_type: 'gif', reply_content: gifFileId } },
                    { upsert: true }
                );
                
                ctx.reply(`تم إضافة الرد بنجاح!\nالكلمة: ${tempReplyWord}\nالرد: GIF`);
                awaitingReplyResponse = false;
            } catch (error) {
                console.error('Error saving GIF reply:', error);
                ctx.reply('حدث خطأ أثناء حفظ الرد. الرجاء المحاولة مرة أخرى.');
                awaitingReplyResponse = false;
            }
        }
        try {
            const chatId = ctx.chat.id;
            const isRestricted = gifRestrictionStatus.get(chatId);
    
            if (isRestricted) {
                const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
                
                if (chatMember.status !== 'administrator' && chatMember.status !== 'creator') {
                    await ctx.deleteMessage();
                    await ctx.reply('❌ عذرًا، إرسال الصور المتحركة غير مسموح حاليًا للأعضاء العاديين في هذه المجموعة.');
                    return;
                }
            }
    
            // Continue with any existing GIF handling logic...
        } catch (error) {
            console.error('Error handling GIF message:', error);
        }
    });

   


    bot.on('photo', (ctx) => {
        const chatId = ctx.chat.id;
        if (!photoMessages.has(chatId)) {
            photoMessages.set(chatId, []);
        }
        photoMessages.get(chatId).push({
            messageId: ctx.message.message_id,
            timestamp: Date.now()
        });
    
        // Keep only the last 100 photos
        const photos = photoMessages.get(chatId);
        if (photos.length > 100) {
            photos.shift();
        }
    });

    // Add this closing brace to end the setupHandlers function
}



module.exports = { 
    setupHandlers,
    developerIds  // Add this line to export developerIds
};
