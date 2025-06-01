//glock chigga   
let awaitingReplyWord = false;
let awaitingReplyResponse = false;  // Add this line
let tempReplyWord = '';
let tempBotId = null;
const userStates = new Map();
const pendingReplies = new Map(); // { userId: { triggerWord, botId } }
// Declare ownerId at the top of your file
let ownerId = null;
const mongoose = require('mongoose');
// Make sure this is at the top of your file
const activeGroups = new Map();
// Add these variables at the top of your file
let awaitingBotName = false;
// Add these variables at the top of your file
let awaitingDeleteReplyWord = false;
const cloudinary = require('cloudinary').v2;
const { getLeaderboard,getUserStatistics, getDifficultyLevels, getQuestionsForDifficulty,isSecondaryDeveloper  } = require('./commands');
const chatStates = new Map();
// Add these global variables at the top of your file
const activeQuizzes = new Map(); // Map to store active quizzes by chat ID
const userScores = new Map(); // Map to store user scores
// Cloudinary configuration
cloudinary.config({
  cloud_name: 'dpxowt5m5',
  api_key: '248273337268518',
  api_secret: 'SihooJWz6cMi5bNDAU26Tmf-tIw' // Replace with your actual API secret
});
// Add this to your global variables
const quizSettings = new Map();
const { isDeveloper,isSubscribed } = require('./middlewares');
const { addQuizQuestion } = require('./database');
// Add this at the top of your file
const database = require('./database');
const { Markup } = require('telegraf');
const { updateActiveGroup } = require('./database');
// Quiz state constants
const QUIZ_STATE = {
    INACTIVE: 0,
    SELECTING_DIFFICULTY: 1,
    SELECTING_QUESTION_COUNT: 2,
    ACTIVE: 3
};


const {isAdminOrOwner,isVIP,} = require('./commands');    
const axios = require('axios');
const fs = require('fs');
const path = require('path');    
// Ensure the directory for saving media exists
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir);
}

const premiumUserSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    notified: { type: Boolean, default: false }
});

const PremiumUser = mongoose.model('PremiumUser', premiumUserSchema);


// Function to download and save file
// Function to download and save file
async function saveFile(fileLink, fileName) {
    try {
        console.log(`Attempting to save file from ${fileLink} as ${fileName}`);
        
        // Ensure the media directory exists
        const mediaDir = path.join(__dirname, 'media');
        if (!fs.existsSync(mediaDir)) {
            console.log(`Creating media directory: ${mediaDir}`);
            fs.mkdirSync(mediaDir, { recursive: true });
        }
        
        // Generate a unique filename with timestamp while keeping the original extension
        const timestamp = Date.now();
        const fileExtension = path.extname(fileName);
        const fileNameWithoutExt = path.basename(fileName, fileExtension);
        const newFileName = `${fileNameWithoutExt}_${timestamp}${fileExtension}`;
        
        const filePath = path.join(mediaDir, newFileName);
        console.log(`Full file path: ${filePath}`);
        
        // Use axios to download the file
        const response = await axios({
            method: 'GET',
            url: fileLink.toString(),
            responseType: 'stream'
        });
        
        // Create a write stream and pipe the response data to it
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        
        // Return a promise that resolves when the file is fully written
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`File successfully saved to ${filePath}`);
                resolve({ filePath, fileName: newFileName });
            });
            writer.on('error', (err) => {
                console.error(`Error writing file to ${filePath}:`, err);
                reject(err);
            });
        });
    } catch (error) {
        console.error(`Error in saveFile function:`, error);
        throw error;
    }
}


 
async function broadcastMessage(ctx, mediaType, mediaId, caption) {
    try {
        const db = await getDatabaseForBot('replays');
        const groups = await db.collection('groups').find({ is_active: true }).toArray();

        for (const group of groups) {
            try {
                if (mediaType && mediaId) {
                    // Send media with caption
                    await ctx.telegram.sendMediaGroup(group.group_id, [{
                        type: mediaType,
                        media: mediaId,
                        caption: caption || ''
                    }]);
                } else if (caption) {
                    // Send caption only
                    await ctx.telegram.sendMessage(group.group_id, caption);
                }
            } catch (error) {
                console.error(`Error sending message to group ${group.group_id}:`, error);
            }
        }

        await ctx.reply('✅ تم إرسال الرسالة إلى جميع المجموعات النشطة.');
    } catch (error) {
        console.error('Error in broadcastMessage:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة إرسال الرسالة.');
    }
}
// Consolidated media handler function
async function handleMediaMessage(ctx, mediaType) {
    try {
        if (!awaitingReplyResponse || !tempReplyWord) {
            console.log('Not awaiting a reply response or no temp word set');
            return false;
        }

        console.log(`Handling ${mediaType} message for trigger word: ${tempReplyWord}`);
        const userId = ctx.from.id;
        const username = ctx.from.username || '';
        let fileId, fileUrl;

        // Extract the file ID based on media type
        switch (mediaType) {
            case 'photo':
                if (ctx.message.photo && ctx.message.photo.length > 0) {
                    fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                    console.log(`Extracted photo file_id: ${fileId}`);
                } else {
                    throw new Error('Invalid photo message structure');
                }
                break;
            case 'blank':
                if (ctx.message.blank) {
                    fileId = ctx.message.blank.file_id;
                    console.log(`Extracted video file_id: ${fileId}`);
                } else {
                    throw new Error('Invalid video message structure');
                }
                break;
            case 'animation':
                if (ctx.message.animation) {
                    fileId = ctx.message.animation.file_id;
                    console.log(`Extracted animation file_id: ${fileId}`);
                } else {
                    throw new Error('Invalid animation message structure');
                }
                break;
            case 'document':
                if (ctx.message.document) {
                    fileId = ctx.message.document.file_id;
                    console.log(`Extracted document file_id: ${fileId}`);
                } else {
                    throw new Error('Invalid document message structure');
                }
                break;
            case 'sticker':
                if (ctx.message.sticker) {
                    fileId = ctx.message.sticker.file_id;
                    console.log(`Extracted sticker file_id: ${fileId}`);
                } else {
                    throw new Error('Invalid sticker message structure');
                }
                break;
            default:
                throw new Error('Unsupported media type');
        }

        // Create a URL if possible
        if (ctx.chat.username) {
            fileUrl = `https://t.me/${ctx.chat.username}/${ctx.message.message_id}`;
        } else {
            fileUrl = fileId;
        }

        try {
            // Get the file link from Telegram
            const fileLink = await ctx.telegram.getFileLink(fileId);
            console.log(`Got file link: ${fileLink}`);
            
            // Generate a unique filename
            const fileName = `${mediaType}_${Date.now()}_${userId}.${getFileExtension(mediaType)}`;
            console.log(`Generated filename: ${fileName}`);
            
            // Save the file locally
            const savedFilePath = await saveFile(fileLink, fileName);
            console.log(`File saved locally at: ${savedFilePath}`);
            
            // Save to database
            const db = await getDatabaseForBot('replays');
            const replyData = {
                user_id: userId,
                username: username,
                trigger_word: tempReplyWord.trim(),
                type: 'media',
                media_type: mediaType,
                file_id: fileId,
                file_path: savedFilePath,
                created_at: new Date(),
                bot_id: ctx.botInfo.id // 🔥 add this!
              };
              await db.collection('replies').insertOne(replyData);
              
            
            console.log('Saving reply data:', JSON.stringify(replyData, null, 2));
            
            await db.collection('replies').insertOne(replyData);
            
            console.log(`Saved ${mediaType} reply to database for trigger word: ${tempReplyWord}`);
            
            // Get Arabic media type name for the response
            const mediaTypeArabic = getMediaTypeInArabic(mediaType);
            await ctx.reply(`✅ تم إضافة الرد بنجاح!\nالكلمة: ${tempReplyWord}\nنوع الرد: ${mediaTypeArabic}`);
            
            // Reset the awaiting state
            awaitingReplyResponse = false;
            tempReplyWord = '';
            
            return true; // Successfully handled
        } catch (error) {
            console.error(`❌ خطأ أثناء حفظ الرد (${mediaType}):`, error);
            await ctx.reply('❌ حدث خطأ أثناء حفظ الرد.');
            
            // Reset the awaiting state
            awaitingReplyResponse = false;
            tempReplyWord = '';
            
            return true; // We handled it, even though there was an error
        }
    } catch (error) {
        console.error(`Error in handleMediaMessage (${mediaType}):`, error);
        return false; // Error occurred, didn't handle it
    }
}

   



// Add this function to handle quiz answers
// Add this after the showQuizMenu function
async function handleTextMessage(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const userText = ctx.message.text.trim().toLowerCase();

    console.log(`Processing text message: "${userText}" from user ${userId} in chat ${chatId}`);

    // Handle state-based operations first
    if (awaitingReplyWord) {
        tempReplyWord = userText;
        await ctx.reply(`تم استلام الكلمة: "${tempReplyWord}". الآن أرسل الرد الذي تريد إضافته لهذه الكلمة:`);
        awaitingReplyWord = false;
        awaitingReplyResponse = true;
        return;
    }
    
    if (awaitingReplyResponse) {
        await handleAwaitingReplyResponse(ctx);
        return;
    }
    
    if (awaitingDeleteReplyWord) {
        await handleAwaitingDeleteReplyWord(ctx);
        return;
    }
    
    if (awaitingBotName) {
        await handleAwaitingBotName(ctx);
        return;
    }

    // Check for active quiz
    if (activeQuizzes.has(chatId) && activeQuizzes.get(chatId).state === QUIZ_STATE.ACTIVE) {
        await handleQuizAnswer(ctx, chatId, userId, userText);
        return;
    }
// Check for custom bot name
const customBotName = await getCustomBotName(chatId);
if (customBotName) {
    const loweredName = customBotName.toLowerCase();
    if (userText.includes(loweredName)) {
        await ctx.reply(`عيونه 😘: ${customBotName}`);
        return;
    }
}
console.log(`[BOT_NAME_CHECK] userText: "${userText}" | botName: "${customBotName}"`);


    // Check for user state
    if (userStates.has(userId)) {
        const userState = userStates.get(userId);
        if (userState.action === 'adding_reply') {
            if (userState.step === 'awaiting_trigger') {
                userState.triggerWord = userText; // ✅ correct
                userState.step = 'awaiting_response';
                await ctx.reply('الآن أرسل الرد الذي تريد إضافته لهذه الكلمة:');
                return;
            } else if (userState.step === 'awaiting_response') {
                try {
                    const db = await getDatabaseForBot('replays');
                    await db.collection('replies').insertOne({
                        bot_id: userState.botId,
                        trigger_word: userState.triggerWord,
                        word: userState.triggerWord, // Add this for consistency
                        type: 'text',
                        text: ctx.message.text,
                        reply_text: ctx.message.text, // Add this for backward compatibility
                        created_at: new Date(),
                        created_by: userId
                    });
                    
                    await ctx.reply(`تم إضافة الرد بنجاح!\nالكلمة: ${userState.triggerWord}\nالرد: ${ctx.message.text}`);
                    userStates.delete(userId);
                    return;
                } catch (error) {
                    console.error('Error saving reply:', error);
                    await ctx.reply('حدث خطأ أثناء حفظ الرد. الرجاء المحاولة مرة أخرى.');
                    userStates.delete(userId);
                    return;
                }
            }
        }
    }

    // Check for automatic replies - this should work in both private and group chats
    const reply = await checkForAutomaticReply(ctx);
    if (reply) {
        console.log('Found matching reply:', reply);
        const sent = await sendReply(ctx, reply);
        if (sent) return;
    } else {
        console.log('No matching reply found for:', userText);
    }

    // If we reach here in a private chat, it means we didn't handle the message
    if (ctx.chat.type === 'private') {
        // Only send the "I don't understand" message in private chats
        // await ctx.reply('عذرًا، لم أفهم هذه الرسالة. هل يمكنك توضيح طلبك؟');
    }
}
async function updateReplyTexts(triggerWord, texts) {
    try {
        const db = await getDatabaseForBot('replays');
        await db.collection('replies').updateOne(
            { trigger_word: triggerWord },
            { 
                $set: { 
                    reply_texts: texts,
                    cycle_index: 0
                }
            },
            { upsert: true }
        );
        console.log(`Updated reply texts for trigger word: ${triggerWord}`);
    } catch (error) {
        console.error('Error updating reply texts:', error);
    }
}

async function setReplyTypeToCycle(triggerWord) {
    try {
        const db = await getDatabaseForBot('replays');
        await db.collection('replies').updateOne(
            { trigger_word: triggerWord },
            { 
                $set: { 
                    type: 'text_cycle'
                }
            }
        );
        console.log(`Set reply type to text_cycle for trigger word: ${triggerWord}`);
    } catch (error) {
        console.error('Error setting reply type:', error);
    }
}
async function setupCyclingReply(ctx, triggerWord, texts) {
    try {
        // Update the reply texts and initialize the cycle index
        await updateReplyTexts(triggerWord, texts);

        // Set the reply type to 'text_cycle'
        await setReplyTypeToCycle(triggerWord);

        await ctx.reply(`✅ تم إعداد الردود الدورية للكلمة: ${triggerWord}`);
    } catch (error) {
        console.error('Error setting up cycling reply:', error);
        await ctx.reply('❌ حدث خطأ أثناء إعداد الردود الدورية.');
    }
}


// Add this function to check subscription status directly
async function checkSubscriptionStatus(ctx, userId) {
    try {
        const channelUsername = 'ctrlsrc'; // Your channel username without @
        
        // Try to get the user's status in the channel
        const member = await ctx.telegram.getChatMember(`@${channelUsername}`, userId);
        
        // Check if the user is a member of the channel
        const status = member.status;
        if (status === 'member' || status === 'administrator' || status === 'creator') {
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error checking subscription status:', error);
        return false;
    }
}
async function isPremiumUser(userId) {
    try {
        // Use the PremiumUser model directly
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
        
        return false; // Subscription expired
    } catch (err) {
        console.error("❌ isPremiumUser error:", err.message);
        return false; // Return false on error
    }
}
// Replace your forceCheckSubscription function with this
async function forceCheckSubscription(ctx) {
    try {
        await ctx.answerCbQuery('جاري التحقق من الاشتراك...');
        
        // Instead of checking directly, we'll ask the user to join and then click a button
        await ctx.reply('للاستمرار في استخدام البوت، يرجى:',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '1. اشترك في القناة', url: 'https://t.me/ctrlsrc' }],
                        [{ text: '2. تحقق من الاشتراك', callback_data: 'confirm_subscription' }]
                    ]
                }
            }
        );
    } catch (error) {
        console.error('Error in forceCheckSubscription:', error);
        await ctx.answerCbQuery('❌ حدث خطأ. يرجى المحاولة مرة أخرى لاحقًا.', { show_alert: true });
    }
}
async function confirmSubscription(ctx) {
    try {
        // Here we assume the user has subscribed since they clicked the button
        // This is more reliable than checking membership which often fails
        
        await ctx.answerCbQuery('✅ شكراً لاشتراكك في القناة!', { show_alert: true });
        await ctx.reply('شكراً لاشتراكك! يمكنك الآن استخدام البوت.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'أضفني إلى مجموعتك', url: 'https://t.me/' + ctx.botInfo.username + '?startgroup=true' }],
                    [{ text: 'قناة السورس', url: 'https://t.me/ctrlsrc' }]
                ]
            }
        });
        
        // You can store this user as subscribed in your database if needed
        
    } catch (error) {
        console.error('Error in confirmSubscription:', error);
        await ctx.answerCbQuery('❌ حدث خطأ. يرجى المحاولة مرة أخرى لاحقًا.', { show_alert: true });
    }
}

async function handleCorrectQuizAnswer(ctx, chatId, userId) {
    const quiz = activeQuizzes.get(chatId);
    const currentQuestion = quiz.questions[quiz.currentQuestionIndex];

    // Initialize attempts tracking for this question if it doesn't exist
    if (!quiz.attempts.has(quiz.currentQuestionIndex)) {
        quiz.attempts.set(quiz.currentQuestionIndex, new Set());
    }

    const questionAttempts = quiz.attempts.get(quiz.currentQuestionIndex);

    // Check if the user has already answered correctly
    if (!questionAttempts.has(userId)) {
        // Mark this user as having answered correctly
        questionAttempts.add(userId);

        // Update user's score
        if (!quiz.scores.has(userId)) {
            quiz.scores.set(userId, 0);
        }

        // Add points based on difficulty
        let points = 1;
        if (quiz.difficulty === 'medium') points = 2;
        if (quiz.difficulty === 'hard') points = 3;

        quiz.scores.set(userId, quiz.scores.get(userId) + points);

        // Reply to the user
        await ctx.reply(`✅ إجابة صحيحة! حصلت على ${points} نقطة.`, {
            reply_to_message_id: ctx.message.message_id
        });

        // Move to the next question after a short delay
        setTimeout(async () => {
            quiz.currentQuestionIndex++;

            // Check if we've reached the end of the quiz
            if (quiz.currentQuestionIndex >= quiz.questions.length) {
                await endQuiz(ctx, chatId);
            } else {
                // Show the next question
                await askNextQuestion(chatId, ctx.telegram);
            }
        }, 2000);
    }
}
// Add this function to show a question
async function showQuestion(ctx, chatId) {
    try {
        const quiz = activeQuizzes.get(chatId);
        const currentQuestion = quiz.questions[quiz.currentQuestionIndex];
        
        // Create the question message
        const questionNumber = quiz.currentQuestionIndex + 1;
        const totalQuestions = quiz.questions.length;
        
        const message = `❓ السؤال ${questionNumber}/${totalQuestions}:\n\n${currentQuestion.question}\n\nالخيارات:\n`;
        
        // Send the question
        await ctx.telegram.sendMessage(chatId, message);
        
        // Set a timeout for this question
        const timeout = setTimeout(async () => {
            // Check if the quiz is still active and on the same question
            if (activeQuizzes.has(chatId) && 
                activeQuizzes.get(chatId).currentQuestionIndex === quiz.currentQuestionIndex) {
                
                await ctx.telegram.sendMessage(chatId, `⏱ انتهى الوقت! الإجابة الصحيحة هي: ${currentQuestion.correctAnswer}`);
                
                // Move to the next question
                quiz.currentQuestionIndex++;
                
                // Check if we've reached the end of the quiz
                if (quiz.currentQuestionIndex >= quiz.questions.length) {
                    await endQuiz(ctx, chatId);
                } else {
                    // Show the next question
                    await showQuestion(ctx, chatId);
                }
            }
        }, 30000); // 30 seconds per question
        
        // Store the timeout so we can clear it if needed
        quiz.timeouts.push(timeout);
    } catch (error) {
        console.error('Error showing question:', error);
    }
}    
async function startAddingCustomQuestions(ctx) {
    try {
        const chatId = ctx.chat.id;
        await ctx.reply('لإضافة سؤال جديد، أرسل نص السؤال:');
        
        // Set the chat state to 'ADDING_QUESTION'
        chatStates.set(chatId, 'ADDING_QUESTION');
    } catch (error) {
        console.error('Error in startAddingCustomQuestions:', error);
        await ctx.reply('❌ حدث خطأ أثناء بدء إضافة السؤال المخصص.');
    }
}
// Add this function to end the quiz and show results
async function endQuiz(ctx, chatId) {
    try {
        const quiz = activeQuizzes.get(chatId);
        if (!quiz) return;
        
        // Clear all timeouts
        for (const timeout of quiz.timeouts) {
            clearTimeout(timeout);
        }
        
        // Sort scores to find the winner
        const sortedScores = [...quiz.scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10); // Top 10 players
        
        let resultsMessage = '🏁 انتهت المسابقة! إليكم النتائج:\n\n';
        
        if (sortedScores.length === 0) {
            resultsMessage += '😔 لم يشارك أحد في هذه الجولة.';
        } else {
            // Save scores to database and build results message
            for (let i = 0; i < sortedScores.length; i++) {
                const [userId, score] = sortedScores[i];
                let userName = 'مستخدم';
                let firstName = '';
                
                try {
                    const chatMember = await ctx.telegram.getChatMember(chatId, userId);
                    userName = chatMember.user.username || 'مستخدم';
                    firstName = chatMember.user.first_name || 'مستخدم';
                    
                    // Save the score to the database
                    await database.saveQuizScore(chatId, userId, firstName, '', userName, score);

                    
                } catch (error) {
                    console.error('Error getting chat member or saving score:', error);
                }
                
                resultsMessage += `${i + 1}. ${firstName}: ${score} نقطة\n`;
            }
        }
        
        await ctx.telegram.sendMessage(chatId, resultsMessage);
        
        // Add a button to view the global leaderboard
        await ctx.telegram.sendMessage(chatId, 'لعرض قائمة المتصدرين العامة:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏆 عرض قائمة المتصدرين', callback_data: 'show_leaderboard' }]
                ]
            }
        });
        
        // Remove the quiz from active quizzes
        activeQuizzes.delete(chatId);
    } catch (error) {
        console.error('Error ending quiz:', error);
    }
}

// Define quiz questions with different difficulty levels
const difficulties = {
    easy: [
        { question: "ما هو 2 + 2؟", answer: "1" },
        { question: "ما هو لون السماء؟", answer: "1" },
        { question: "كم عدد حروف كلمة 'بيت'؟", answer: "1" },
        { question: "ما هو اسم اليوم الذي يأتي بعد الأربعاء؟", answer: "1" },
        { question: "كم عدد أيام الأسبوع؟", answer: "1" },
        { question: "ما هو لون الشمس؟", answer: "1" },
        { question: "ما هو عكس كلمة 'كبير'؟", answer: "1" },
        { question: "كم عدد أرجل القطة؟", answer: "1" },
        { question: "ما هو الشهر الذي يأتي بعد يناير؟", answer: "1" },
        { question: "ما هو اسم الكوكب الذي نعيش عليه؟", answer: "1" },
        { question: "ما هو الحيوان الذي يقول موو؟", answer: "1" },
        { question: "ما اسم الحيوان الذي يحب الجزر؟", answer: "1" },
        { question: "ما هو صوت القطة؟", answer: "1" },
        { question: "ما هو الشيء الذي نشربه كل يوم؟", answer: "1" },
        { question: "ما هو لون العشب؟", answer: "1" },
        { question: "كم أصبع في اليد الواحدة؟", answer: "1" },
        { question: "ما هو الحيوان الذي ينام في الشتاء؟", answer: "1" },
        { question: "كم عدد العيون عند الإنسان؟", answer: "1" },
        { question: "ما هو الشيء الذي نقرأ منه؟", answer: "1" },
        { question: "ما اسم أداة الكتابة؟", answer: "1" },
       { question: "ما هو عدد أصابع القدم الواحدة؟", answer: "1" },
    { question: "ما هو الحيوان الذي يصدر صوت نقيق؟", answer: "1" },
    { question: "ما هو الشيء الذي نستخدمه لنأكل الطعام؟", answer: "1" },
    { question: "ما هو لون الحليب؟", answer: "1" },
    { question: "كم عدد عجلات الدراجة؟", answer: "1" },
    { question: "أين ننام في الليل؟", answer: "1" },
    { question: "ما اسم الطائر الذي لا يطير؟", answer: "1" },
    { question: "ما هو الحيوان الذي يزأر؟", answer: "1" },
    { question: "ما اسم الشهر الأول من السنة؟", answer: "1" },
    { question: "ما هو اسم الفاكهة الصفراء الطويلة؟", answer: "1" },
    { question: "ما اسم الفاكهة الحمراء الصغيرة التي تكون حلوة؟", answer: "1" },
    { question: "كم جناح للطائر؟", answer: "1" },
    { question: "ما هو اليوم الذي يأتي بعد الأحد؟", answer: "1" },
    { question: "ما هو الشيء الذي نسمع من خلاله؟", answer: "1" },
    { question: "ما اسم المكان الذي نذهب إليه لشراء الطعام؟", answer: "1" },
    { question: "ما هو الشيء الذي نلبسه في أقدامنا؟", answer: "1" },
    { question: "ما هو الشيء الذي نضعه على الرأس للحماية من الشمس؟", answer: "1" },
    { question: "ما هو الحيوان الذي يعيش في الماء وله زعانف؟", answer: "1" },
    { question: "ما اسم وسيلة النقل التي تطير في السماء؟", answer: "1" },
    { question: "كم عدد أرجل الإنسان؟", answer: "1" },
    { question: "ما اسم الفاكهة التي تكون برتقالية اللون؟", answer: "1" },
    { question: "أين نذهب عندما نمرض؟", answer: "1" },
    { question: "ما هو الحيوان الذي يقول 'نعامة'؟", answer: "1" },
    { question: "كم عين للإنسان؟", answer: "1" },
    { question: "ما هو الشيء الذي نستخدمه لنشرب الماء؟", answer: "1" }
    ],
    medium: [
        { question: "ما هي عاصمة أندونيسيا؟", answer: "1" },
        { question: "ما هو الغاز الذي تمتصه النباتات من الجو؟", answer: "1" },
        { question: "ما هي أكبر قارة في العالم؟", answer: "1" },
        { question: "كم عدد الأحرف في اللغة الإنجليزية؟", answer: "1" },
        { question: "ما هو أطول نهر في العالم؟", answer: "1" },
        { question: "ما هي عاصمة فرنسا؟", answer: "1" },
        { question: "من هو مخترع المصباح الكهربائي؟", answer: "1" },
        { question: "ما هو أكبر محيط في العالم؟", answer: "1" },
        { question: "ما هي اللغة الرسمية في البرازيل؟", answer: "1" },
        { question: "كم عدد القارات في العالم؟", answer: "1" },
        { question: "ما هي عاصمة كندا؟", answer: "1" },
        { question: "في أي قارة تقع مصر؟", answer: "1" },
        { question: "ما هو الحيوان الذي يُعرف بسفينة الصحراء؟", answer: "1" },
        { question: "ما اسم الجهاز الذي يستخدمه الطبيب لسماع نبضات القلب؟", answer: "1" },
        { question: "من هو مخترع الهاتف؟", answer: "1" },
        { question: "ما هو اسم العملية التي يتم فيها تحويل الماء إلى بخار؟", answer: "1" },
        { question: "ما هي اللغة الرسمية في اليابان؟", answer: "1" },
        { question: "ما هو اسم الكوكب الأحمر؟", answer: "1" },
        { question: "في أي قارة تقع الأرجنتين؟", answer: "1" },
        { question: "ما اسم البحر الذي يقع بين السعودية ومصر؟", answer: "1" },
       { question: "ما هو أول حرف في الأبجدية؟", answer: "1" },
    { question: "ما هو الشيء الذي نأكله ونستطيع تقشيره؟", answer: "1" },
    { question: "ما هو الحيوان الذي يصدر صوت 'نهيق'؟", answer: "1" },
    { question: "ما هو اسم الطائر الذي لا يطير ويعيش في القطب الجنوبي؟", answer: "1" },
    { question: "كم إصبع في القدم الواحدة؟", answer: "1" },
    { question: "ما هو الحيوان الذي يبيض؟", answer: "1" },
    { question: "ما هو الحيوان الذي يعيش في الماء وله زعانف؟", answer: "1" },
    { question: "ما هو الشيء الذي تكتبه ولا تقرأه؟", answer: "1" },
    { question: "ما هو الحيوان الذي يعيش في الصحراء؟", answer: "1" },
    { question: "ما هو لون الحليب؟", answer: "1" },
    { question: "ما اسم الخضار التي تبكينا عند تقطيعها؟", answer: "1" },
    { question: "ما هو الحيوان الذي له خرطوم؟", answer: "1" },
    { question: "كم عدد أذني الإنسان؟", answer: "1" },
    { question: "ما هو الشيء الذي نكتبه في المدرسة؟", answer: "1" },
    { question: "ما اسم الحشرة التي تصدر صوتاً في الليل؟", answer: "1" },
    { question: "ما هو لون الموز؟", answer: "1" },
    { question: "في أي مكان نضع الطعام لنحفظه بارداً؟", answer: "1" },
    { question: "ما هو اسم الجهاز الذي يعرض الصور في التلفاز؟", answer: "1" },
    { question: "ما هو اسم الشيء الذي نضعه في أرجلنا عند المشي؟", answer: "1" },
    { question: "ما هو عدد أجنحة الطائرة؟", answer: "1" }
    ],
    hard: [
        { question: "ما هو الرمز الكيميائي للذهب؟", answer: "1" },
        { question: "من هو مؤسس علم الجبر؟", answer: "1" },
        { question: "ما هو اسم أكبر كويكب في النظام الشمسي؟", answer: "1" },
        { question: "ما هي أصغر دولة في العالم؟", answer: "1" },
        { question: "من هو مؤلف كتاب 'الأمير'؟", answer: "1" },
        { question: "ما هو العنصر الأكثر وفرة في الكون؟", answer: "1" },
        { question: "ما هو اسم أعمق نقطة في المحيطات؟", answer: "1" },
        { question: "من هو مكتشف نظرية النسبية؟", answer: "1" },
        { question: "ما هو اسم أعلى قمة جبلية تحت الماء؟", answer: "1" },
        { question: "ما هو عدد العظام في جسم الإنسان البالغ؟", answer: "1" },
        { question: "ما اسم العالم الذي طور قانون الجاذبية؟", answer: "1" },
        { question: "ما هو عدد الكواكب في النظام الشمسي؟", answer: "1" },
        { question: "ما هو أصل كلمة 'كيمياء'؟", answer: "1" },
        { question: "من هو مكتشف الدورة الدموية؟", answer: "1" },
        { question: "ما هو الجهاز المسؤول عن إنتاج الأنسولين في الجسم؟", answer: "1" },
        { question: "ما اسم المجرة التي تنتمي إليها الأرض؟", answer: "1" },
        { question: "ما هو العنصر الذي رمزه الكيميائي Fe؟", answer: "1" },
        { question: "من كتب كتاب 'الأصل'؟", answer: "1" },
        { question: "ما اسم النظرية التي تفسر تطور الأنواع؟", answer: "1" },
        { question: "ما هو الغاز الذي يتكون منه معظم الغلاف الجوي للأرض؟", answer: "1" },
        { question: "ما هو اسم أول قمر صناعي أُطلق إلى الفضاء؟", answer: "1" },
    { question: "في أي سنة تأسست منظمة الأمم المتحدة؟", answer: "1" },
    { question: "ما اسم العالم الذي اكتشف البنسلين؟", answer: "1" },
    { question: "ما هو العنصر الكيميائي الذي رمزه Hg؟", answer: "1" },
    { question: "من هو أول من دار حول الأرض؟", answer: "1" },
    { question: "ما هو اسم الأداة التي تقيس شدة الزلازل؟", answer: "1" },
    { question: "في أي دولة تقع جامعة هارفارد؟", answer: "1" },
    { question: "ما اسم أول رواية في التاريخ؟", answer: "1" },
    { question: "ما اسم القمر التابع لكوكب المريخ؟", answer: "1" },
    { question: "ما اسم أكبر صحراء في العالم؟", answer: "1" },
    { question: "من هو أول عالم وضع جدولاً دورياً للعناصر؟", answer: "1" },
    { question: "في أي سنة هبط الإنسان على سطح القمر لأول مرة؟", answer: "1" },
    { question: "ما هو اسم أضخم عضلة في جسم الإنسان؟", answer: "1" },
    { question: "ما اسم المادة المسؤولة عن نقل الأوكسجين في الدم؟", answer: "1" },
    { question: "من هو مؤلف كتاب 'الجمهورية'؟", answer: "1" },
    { question: "ما اسم أكبر بركان نشط في العالم؟", answer: "1" },
    { question: "ما اسم أعمق بحيرة في العالم؟", answer: "1" },
    { question: "في أي قارة يقع جبل إيفرست؟", answer: "1" },
    { question: "من هو مكتشف الإلكترون؟", answer: "1" },
    { question: "ما اسم العالم الذي وضع قوانين الحركة الثلاثة؟", answer: "1" }
    ]
};


// Make sure to initialize the database before using it
async function ensureDatabaseInitialized() {
    let db = database.getDb();
    if (!db) {
        console.log('Database not initialized, connecting now...');
        db = await database.connectToMongoDB();
    }
    return db;
}


async function configureQuiz(ctx) {
    try {
        if (!(await isAdminOrOwner(ctx, ctx.from.id))) {
            return ctx.answerCbQuery('❌ هذا الأمر مخصص للمشرفين فقط.');
        }

        const chatId = ctx.chat.id;
        const settings = quizSettings.get(chatId) || { timer: 30 };

        const keyboard = {
            inline_keyboard: [
                [{ text: 'اختر وقت السؤال للمسابقة:', callback_data: 'dummy' }],
                [
                    { text: '10 ثوان', callback_data: 'set_timer_10' },
                    { text: '20 ثانية', callback_data: 'set_timer_20' },
                    { text: '30 ثانية', callback_data: 'set_timer_30' }
                ],
                [
                    { text: '40 ثانية', callback_data: 'set_timer_40' },
                    { text: '50 ثانية', callback_data: 'set_timer_50' }
                ],
                [{ text: `عرض الوقت الحالي: ${settings.timer} ثانية`, callback_data: 'show_current_timer' }],
                [{ text: '🔙 العودة', callback_data: 'back_to_quiz_menu' }]
            ]
        };

        const message = `اختر وقت السؤال للمسابقة:\n\nالوقت الحالي: ${settings.timer} ثانية`;

        if (ctx.callbackQuery) {
            const msg = ctx.callbackQuery.message;
            if (msg.photo) {
                // If the message has a photo, edit the caption
                await ctx.editMessageCaption(message, { reply_markup: keyboard });
            } else if (msg.text) {
                // If it's a text message, edit the text
                await ctx.editMessageText(message, { reply_markup: keyboard });
            } else {
                // If it's neither photo nor text, send a new message
                await ctx.reply(message, { reply_markup: keyboard });
            }
        } else {
            // Send a new message if it's a direct command
            await ctx.reply(message, { reply_markup: keyboard });
        }
    } catch (error) {
        console.error('Error in configureQuiz:', error);
        ctx.answerCbQuery('❌ حدث خطأ أثناء تكوين المسابقة.');
    }
}


// ... (rest of the existing imports and variables)
function setupActions(bot) {

    // Add this function to handle quiz configuration
    
    const userStates = new Map();
    const { Scenes, session } = require('telegraf');


    // Initialize session middleware
    bot.use(session());

    // Create a new stage for scenes
    const stage = new Scenes.Stage([/* your scenes here */]);

    // Use the stage middleware
    bot.use(stage.middleware());

 // Set up media handlers
 (bot);
    const { setupCommands, showMainMenu, showQuizMenu,chatBroadcastStates, awaitingBroadcastPhoto,updateActiveGroups, } = require('./commands');
// Add this middleware to handle curfew restrictions
bot.use(async (ctx, next) => {
    try {
        // Skip if not in a group chat or if it's not a message
        if (!ctx.chat || ctx.chat.type === 'private' || !ctx.message) {
            return next();
        }

        const chatId = ctx.chat.id;
        const userId = ctx.from.id;

        // Check if the user is an admin, owner, or has special privileges
        const isAdminOrOwnerUser = await isAdminOrOwner(ctx, userId);
        const isVIPUser = await isVIP(ctx, userId);
        const isImportantUser = await isImportant(ctx, userId);

        // Skip curfew checks for privileged users
        if (isAdminOrOwnerUser || isVIPUser || isImportantUser) {
            return next();
        }

        // Check for overall curfew first
        const overallCurfewActive = await isCurfewActive(chatId, 'overall');
        if (overallCurfewActive) {
            console.log(`🚫 Deleting message due to overall curfew in chat ${chatId}`);
            await ctx.deleteMessage().catch(err => {
                console.error(`Failed to delete message in overall curfew: ${err.message}`);
            });
            return; // Stop processing
        }

        // Check for message curfew for text messages
        if (ctx.message.text && await isCurfewActive(chatId, 'messages')) {
            console.log(`🚫 Deleting text message due to message curfew in chat ${chatId}`);
            await ctx.deleteMessage().catch(err => {
                console.error(`Failed to delete text message in message curfew: ${err.message}`);
            });
            return; // Stop processing
        }

        // Check for media curfew - FIX: Safely check for media types
        const hasMedia = ctx.message.photo || 
                         ctx.message.video || 
                         ctx.message.animation || 
                         ctx.message.document || 
                         ctx.message.audio;
                         
        if (hasMedia && await isCurfewActive(chatId, 'media')) {
            const mediaType = ctx.message.photo ? 'photo' : 
                             ctx.message.video ? 'video' : 
                             ctx.message.animation ? 'animation' : 
                             ctx.message.document ? 'document' : 'audio';
                             
            console.log(`🚫 Deleting ${mediaType} due to media curfew in chat ${chatId}`);
            
            // Use a more robust approach to delete the message
            try {
                await ctx.telegram.deleteMessage(chatId, ctx.message.message_id);
                console.log(`✅ Successfully deleted ${mediaType} message ${ctx.message.message_id}`);
            } catch (deleteErr) {
                console.error(`❌ Failed to delete ${mediaType} message: ${deleteErr.message}`);
                
                // If direct deletion fails, try with ctx.deleteMessage as fallback
                try {
                    await ctx.deleteMessage();
                    console.log(`✅ Fallback deletion successful for message ${ctx.message.message_id}`);
                } catch (fallbackErr) {
                    console.error(`❌ Fallback deletion also failed: ${fallbackErr.message}`);
                }
            }
            return; // Stop processing
        }

        // Continue to next middleware if no curfew applies
        return next();
    } catch (error) {
        console.error('Error in curfew middleware:', error);
        return next(); // Continue to next middleware on error
    }
});
// Add this BEFORE any other message handlers
bot.on(['text', 'photo', 'video', 'document', 'audio'], async (ctx, next) => {
    try {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;

        // Skip processing for private chats
        if (ctx.chat.type === 'private') {
            return next();
        }

        // Check if the user is an admin or owner
        const isAdminOrOwnerUser = await isAdminOrOwner(ctx, userId);

        if (!isAdminOrOwnerUser) {
            // Check for overall curfew first
            const overallCurfewActive = await isCurfewActive(chatId, 'overall');
            if (overallCurfewActive) {
                console.log(`🚫 Deleting message due to overall curfew in chat ${chatId}`);
                await ctx.deleteMessage();
                return; // Stop processing
            }

            // Check for message curfew
            if (ctx.message.text && await isCurfewActive(chatId, 'messages')) {
                console.log(`🚫 Deleting text message due to message curfew in chat ${chatId}`);
                await ctx.deleteMessage();
                return; // Stop processing
            }

            // Check for media curfew - FIX: Safely check for updateSubTypes
            // The error is here - ctx.updateSubTypes might be undefined
            let messageType = null;
            if (ctx.updateSubTypes && ctx.updateSubTypes.length > 0) {
                messageType = ctx.updateSubTypes[0];
            } else if (ctx.message) {
                // Fallback: determine message type from message object
                if (ctx.message.photo) messageType = 'photo';
                else if (ctx.message.video) messageType = 'video';
                else if (ctx.message.document) messageType = 'document';
                else if (ctx.message.audio) messageType = 'audio';
                else if (ctx.message.animation) messageType = 'animation';
            }

            if (messageType && ['photo', 'video', 'document', 'audio', 'animation'].includes(messageType) && 
                await isCurfewActive(chatId, 'media')) {
                console.log(`🚫 Deleting ${messageType} due to media curfew in chat ${chatId}`);
                await ctx.deleteMessage();
                return; // Stop processing
            }
        }

        // If we get here, no curfew applies or user is exempt
        return next();
    } catch (error) {
        console.error('Error in curfew middleware:', error);
        return next(); // Continue to next middleware even if there's an error
    }
});
// Photo handler

// Example usage: Call this function when a specific command is received
bot.command('setup_cycle', async (ctx) => {
    const triggerWord = '8anader';
    const texts = ["عيونه 😘", "وت ", "بعدين 😒"];
    await setupCyclingReply(ctx, triggerWord, texts);
});
bot.on('new_chat_members', async (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    if (newMembers.some(member => member.id === ctx.botInfo.id)) {
        // Bot was added to a new group
        await updateActiveGroup(ctx.chat.id, ctx.chat.title, ctx.from.id);
    }
});
// Add this new action handler
bot.action('confirm_subscription', confirmSubscription);
// Add these action handlers for timer settings
bot.action(/^set_timer_(\d+)$/, async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const newTimer = parseInt(ctx.match[1]);
        
        // Update the quiz settings for this chat
        const settings = quizSettings.get(chatId) || {};
        settings.timer = newTimer;
        quizSettings.set(chatId, settings);
        
        await ctx.answerCbQuery(`تم تحديث وقت السؤال إلى ${newTimer} ثانية`);
        
        // Refresh the configuration menu
        await configureQuiz(ctx);
    } catch (error) {
        console.error('Error updating quiz timer:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء تحديث الإعدادات.');
    }
});
bot.action('set_custom_chat_name', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery();
        await ctx.reply('الرجاء إرسال الاسم المحلي الجديد للبوت في هذه المجموعة:');
        ctx.session.awaitingCustomChatName = true;
    } else {
        await ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});

bot.action('remove_custom_chat_name', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery();
        const chatId = ctx.chat.id;
        try {
            const db = await getDatabaseForBot('replays');
            await db.collection('bot_custom_names').deleteOne({ chat_id: chatId });
            await ctx.reply('تم إزالة الاسم المحلي للبوت في هذه المجموعة.');
        } catch (error) {
            console.error('Error removing custom chat name:', error);
            await ctx.reply('حدث خطأ أثناء إزالة الاسم المحلي للبوت.');
        }
    } else {
        await ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});
bot.action('show_current_timer', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const currentTimer = quizSettings.get(chatId)?.timer || 30; // Default to 30 seconds if not set
        await ctx.answerCbQuery(`الوقت الحالي للسؤال: ${currentTimer} ثانية`, { show_alert: true });
    } catch (error) {
        console.error('Error showing current timer:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء عرض الوقت الحالي.');
    }
});
  
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
    async function showStatisticsMenu(ctx) {
        const message = 'قائمة الإحصائيات - اختر الإجراء المطلوب:';
        const keyboard = {
            inline_keyboard: [
                [{ text: '• الإحصائيات العامة •', callback_data: 'overall_stats' }],
                [{ text: '• المشتركين •', callback_data: 'subscribers_stats' }],
                [{ text: '• المجموعات •', callback_data: 'groups_stats' }],
                [{ text: '• جلب نسخة احتياطية •', callback_data: 'backup_data' }],
                [{ text: '• تنظيف المشتركين •', callback_data: 'clean_subscribers' }],
                [{ text: '• تنظيف المجموعات •', callback_data: 'clean_groups' }],
                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
            ]
        };
    
        await ctx.editMessageText(message, { reply_markup: keyboard });
    }
    async function showSourceMenu(ctx) {
        const message = 'قائمة السورس - اختر الإجراء المطلوب:';
        const keyboard = {
            inline_keyboard: [
                [{ text: '• تاريخ اشتراك البوت •', callback_data: 'bot_subscription' }],
                [{ text: '• تحديث السورس •', callback_data: 'source_update' }],
                [{ text: '• مطور البوت الأساسي •', callback_data: 'main_bot_dev' }],
                [{ text: '• مبرمج السورس •', callback_data: 'source_programmer' }],
                [{ text: '• قناة السورس •', callback_data: 'source_channel' }],
                [{ text: 'ctrlsrc', url: 'https://t.me/ctrlsrc' }],
                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
            ]
        };
    
        await ctx.editMessageText(message, { reply_markup: keyboard });
    }
    async function getDevelopersList() {
        try {
            const db = await getDatabaseForBot('replays');
            const developers = await db.collection('developers').find().toArray();
            return developers;
        } catch (error) {
            console.error('Error fetching developers list:', error);
            return [];
        }
    }

    
// Function to shuffle array (for randomizing questions)
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}
    // Similarly update other functions that use pool directly
    async function createSecondaryDevelopersTable() {
        try {
            const db = await getDatabaseForBot('replays');
            // In MongoDB, collections are created automatically when documents are inserted
            console.log('secondary_developers collection ready to use');
        } catch (error) {
            console.error('Error ensuring secondary_developers collection:', error);
        }
    }
 
    
    
    
    async function populateActiveGroups(bot) {
        console.log('Populating active groups...');
        const chats = await bot.telegram.getMyCommands();
        for (const chat of chats) {
            try {
                const chatInfo = await bot.telegram.getChat(chat.chat.id);
                if (chatInfo.type === 'group' || chatInfo.type === 'supergroup') {
                    activeGroups.set(chatInfo.id, { title: chatInfo.title, id: chatInfo.id });
                    console.log(`Added group: ${chatInfo.title} (${chatInfo.id})`);
                }
            } catch (error) {
                console.error(`Error getting chat info for ${chat.chat.id}:`, error);
            }
        }
        console.log(`Populated ${activeGroups.size} active groups`);
    }
    
    // Call this function when your bot starts
    populateActiveGroups(bot);
    // Call this function when your bot starts
    createSecondaryDevelopersTable();



    async function createBotCustomNamesTable() {
        try {
            const db = await getDatabaseForBot('replays');
            // In MongoDB, collections are created automatically when documents are inserted
            console.log('bot_custom_names collection ready to use');
        } catch (error) {
            console.error('Error ensuring bot_custom_names collection:', error);
        }
    }
    // Add this function at the beginning of your file or before it's used
    async function fetchRepliesFromDatabase() {
        try {
            const db = await getDatabaseForBot('replays');
            return await db.collection('replies').find().toArray();
        } catch (error) {
            console.error('Error fetching replies:', error);
            return [];
        }
    }
// Add this function to create the groups table
async function createGroupsTable() {
    try {
        const db = await getDatabaseForBot('replays');
        // In MongoDB, collections are created automatically
        console.log('groups collection ready to use');
    } catch (error) {
        console.error('Error ensuring groups collection:', error);
    }
}
// Update this function to use MongoDB
async function markGroupAsInactive(groupId) {
    try {
        const db = await getDatabaseForBot('replays');
        await db.collection('groups').updateOne(
            { group_id: groupId },
            { $set: { is_active: false } }
        );

        activeGroups.delete(groupId);
        console.log(`Marked group ${groupId} as inactive`);
    } catch (error) {
        console.error('Error marking group as inactive:', error);
    }
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

            // Check if the user is an admin or owner
            const isAdmin = await isAdminOrOwner(ctx, userId);
            if (isAdmin) {
                return handler(ctx);
            } else {
                return ctx.reply('❌ هذا الأمر مخصص للمشرفين فقط.');
            }
        } catch (error) {
            console.error('Error in adminOnly wrapper:', error);
            return ctx.reply('❌ حدث خطأ أثناء التحقق من صلاحيات المستخدم. يرجى المحاولة مرة أخرى لاحقًا.');
        }
    };
}
 // Update this function to use MongoDB
 async function getOverallStats() {
    try {
        const db = await getDatabaseForBot('replays');
        const subscribers = await db.collection('users').countDocuments({ is_active: true });
        const groups = await db.collection('groups').countDocuments({ is_active: true });
        const total = subscribers + groups;

        return { subscribers, groups, total };
    } catch (error) {
        console.error('Error getting overall stats:', error);
        return { subscribers: 0, groups: 0, total: 0 };
    }
}

async function getSubscribersCount() {
    try {
        const db = await getDatabaseForBot('replays');
        return await db.collection('users').countDocuments({ is_active: true });
    } catch (error) {
        console.error('Error getting subscribers count:', error);
        return 0;
    }
}

async function getGroupsCount() {
    try {
        const db = await getDatabaseForBot('replays');
        return await db.collection('groups').countDocuments({ is_active: true });
    } catch (error) {
        console.error('Error getting groups count:', error);
        return 0;
    }
}

async function generateBackup() {
    try {
        const db = await getDatabaseForBot('replays');
        const users = await db.collection('users').find().toArray();
        const groups = await db.collection('groups').find().toArray();
        const developers = await db.collection('developers').find().toArray();
        const replies = await db.collection('replies').find().toArray();

        return {
            botId: bot.botInfo.id,
            botName: bot.botInfo.username,
            users,
            groups,
            developers,
            replies,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error generating backup:', error);
        return null;
    }
}

async function cleanSubscribers() {
    try {
        const db = await getDatabaseForBot('replays');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const result = await db.collection('users').updateMany(
            { last_interaction: { $lt: thirtyDaysAgo } },
            { $set: { is_active: false } }
        );
        
        return result.modifiedCount;
    } catch (error) {
        console.error('Error cleaning subscribers:', error);
        return 0;
    }
}
// Add this function to fix null trigger words in the database
async function fixNullTriggerWords() {
    try {
        const db = await getDatabaseForBot('replays');
        
        // Find all replies with null trigger_word
        const nullTriggerReplies = await db.collection('replies').find({ 
            trigger_word: null 
        }).toArray();
        
        console.log(`Found ${nullTriggerReplies.length} replies with null trigger_word`);
        
        // Process each reply with null trigger_word
        for (const reply of nullTriggerReplies) {
            try {
                // Generate a unique trigger word based on timestamp
                const uniqueTrigger = `auto_generated_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                
                // Update the reply with the unique trigger word
                await db.collection('replies').updateOne(
                    { _id: reply._id },
                    { $set: { trigger_word: uniqueTrigger } }
                );
                
                console.log(`Updated reply ${reply._id} with trigger word: ${uniqueTrigger}`);
            } catch (updateError) {
                console.error(`Error updating reply ${reply._id}:`, updateError);
            }
        }
        
        // Check if there are any remaining null trigger words
        const remainingNullTriggers = await db.collection('replies').countDocuments({ 
            trigger_word: null 
        });
        
        console.log(`Remaining replies with null trigger_word: ${remainingNullTriggers}`);
        
        return {
            processed: nullTriggerReplies.length,
            remaining: remainingNullTriggers
        };
    } catch (error) {
        console.error('Error fixing null trigger words:', error);
        return {
            processed: 0,
            remaining: -1,
            error: error.message
        };
    }
}


// Helper function to get file extension based on media type
function getFileExtension(mediaType) {
    switch (mediaType) {
        case 'photo':
            return 'jpg';
        case 'wzes':
            return 'mp4';
        case 'animation':
            return 'mp4';
        case 'document':
            return 'file';
        case 'sticker':
            return 'webp';
        default:
            return 'bin';
    }
}

// Add this to your initialization code
async function initializeDatabase() {
    try {
        // Connect to MongoDB
        await database.connectToMongoDB();
        
        // Ensure unique index on trigger_word
        await ensureUniqueIndexOnTriggerWord();
        
        // Fix any existing null trigger words
        await fixNullTriggerWords();
        
        console.log('Database initialization completed successfully');
    } catch (error) {
        console.error('Error during database initialization:', error);
    }
}

// Call the initialization function
initializeDatabase();
// Add this function to create a unique index on trigger_word if it doesn't exist
async function ensureUniqueIndexOnTriggerWord() {
    try {
        const db = await getDatabaseForBot('replays');
        
        // Check if the index already exists
        const indexes = await db.collection('replies').indexes();
        const hasUniqueIndex = indexes.some(index => 
            index.key && index.key.trigger_word === 1 && index.unique === true
        );
        
        if (!hasUniqueIndex) {
            // Create a unique index on trigger_word, but allow null values
            await db.collection('replies').createIndex(
                { trigger_word: 1 }, 
                { 
                    unique: true,
                    partialFilterExpression: { trigger_word: { $type: "string" } }
                }
            );
            console.log('Created unique index on trigger_word field (excluding null values)');
        } else {
            console.log('Unique index on trigger_word already exists');
        }
        
        return true;
    } catch (error) {
        console.error('Error ensuring unique index on trigger_word:', error);
        return false;
    }
}
async function cleanGroups() {
    try {
        const db = await getDatabaseForBot('replays');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const result = await db.collection('groups').updateMany(
            { last_activity: { $lt: thirtyDaysAgo } },
            { $set: { is_active: false } }
        );
        
        return result.modifiedCount;
    } catch (error) {
        console.error('Error cleaning groups:', error);
        return 0;
    }
}
// Update this function to use MongoDB
async function updateLastInteraction(userId, username, firstName, lastName) {
    try {
        await database.addUser(userId, username, firstName, lastName);
    } catch (error) {
        console.error('Error updating last interaction for user:', error);
    }
}



async function handleCustomQuestionInput(ctx) {
    const chatId = ctx.chat.id;
    const state = chatStates.get(chatId);
    
    if (!ctx.session) {
        ctx.session = {};
    }
    
    if (state === 'ADDING_QUESTION') {
        // Save the question and ask for the answer
        ctx.session.tempQuestion = ctx.message.text;
        await ctx.reply('تم استلام السؤال. الآن أرسل الإجابة:');
        chatStates.set(chatId, 'ADDING_ANSWER');
    } else if (state === 'ADDING_ANSWER') {
        // Save the answer and add the question to the database
        const question = ctx.session.tempQuestion;
        const answer = ctx.message.text;
        
        try {
            await saveCustomQuestion(chatId, question, answer);
            await ctx.reply('✅ تم إضافة السؤال والإجابة بنجاح.');
            
            // Ask if they want to add another question
            await ctx.reply('هل تريد إضافة سؤال آخر؟', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'نعم', callback_data: 'add_another_question' }],
                        [{ text: 'لا، العودة للقائمة', callback_data: 'back_to_quiz_menu' }]
                    ]
                }
            });
        } catch (error) {
            console.error('Error adding custom question:', error);
            await ctx.reply('❌ حدث خطأ أثناء إضافة السؤال والإجابة.');
        }
        
        // Clear the temporary storage
        delete ctx.session.tempQuestion;
    }
}

// Add this function to save the custom question to the database
async function saveCustomQuestion(chatId, question, answer) {
    try {
        const db = await getDatabaseForBot('replays');
        await db.collection('custom_questions').insertOne({
            chatId: chatId,
            question: question,
            answer: answer,
            createdAt: new Date()
        });
    } catch (error) {
        console.error('Error saving custom question:', error);
        throw error;
    }
}
// Handle the reply response
async function handleAwaitingReplyResponse(ctx) {
    if (!awaitingReplyResponse) return false;

    try {
        const userState = userStates.get(ctx.from.id);
        const botId = userState?.botId;

        if (!botId) {
            await ctx.reply('❌ حدث خطأ في تحديد معرف البوت. يرجى المحاولة مرة أخرى.');
            awaitingReplyResponse = false;
            return true;
        }

        // Ensure tempReplyWord is defined
        if (!tempReplyWord) {
            await ctx.reply('❌ الكلمة المفتاحية غير محددة. يرجى المحاولة مرة أخرى.');
            awaitingReplyResponse = false;
            return true;
        }

        // Continue with the reply saving process
        let mediaType = 'text';
        let replyText = null;
        let mediaUrl = null;
        let fileId = null;

        if (ctx.message.text) {
            mediaType = 'text';
            replyText = ctx.message.text.trim();
        } else {
            await ctx.reply('❌ نوع الرسالة غير مدعوم. يرجى إرسال نص.');
            awaitingReplyResponse = false;
            return true;
        }

        const db = await getDatabaseForBot('replays');

        // Check if trigger word already exists
        const existingReply = await db.collection('replies').findOne({ 
            trigger_word: tempReplyWord,
            bot_id: botId
        });
        
        if (existingReply) {
            await ctx.reply(`❌ الكلمة المفتاحية "${tempReplyWord}" موجودة بالفعل. يرجى اختيار كلمة أخرى.`);
            awaitingReplyResponse = false;
            return true;
        }

        // Add the reply to the database
        await db.collection('replies').insertOne({
            trigger_word: tempReplyWord,
            type: mediaType,
            text: replyText,
            media_url: mediaUrl,
            file_id: fileId,
            created_at: new Date(),
            created_by: ctx.from.id,
            bot_id: botId
        });

        await ctx.reply(`✅ تم إضافة الرد للكلمة "${tempReplyWord}" بنجاح.`);

        // Reset state
        tempReplyWord = '';
        awaitingReplyResponse = false;
        return true;
    } catch (error) {
        console.error('Error adding reply:', error);
        await ctx.reply('❌ حدث خطأ أثناء إضافة الرد. يرجى المحاولة مرة أخرى لاحقًا.');
        awaitingReplyResponse = false;
        return true;
    }
}
// Add these action handlers
bot.action('add_another_question', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('لإضافة سؤال جديد، أرسل نص السؤال:');
    chatStates.set(ctx.chat.id, 'ADDING_QUESTION');
});

bot.action('back_to_quiz_menu', async (ctx) => {
    await ctx.answerCbQuery();
    chatStates.delete(ctx.chat.id);
    await showQuizMenu(ctx);
});


async function setUserAsVIP(userId) {
    try {
        const db = await getDatabaseForBot('replays');
        const result = await db.collection('users').updateOne(
            { user_id: userId },
            { $set: { role: 'vip', is_vip: true } },
            { upsert: true }
        );
        console.log(`Set user ${userId} as VIP. Result:`, result);
        return result.modifiedCount > 0 || result.upsertedCount > 0;
    } catch (error) {
        console.error('Error setting user as VIP:', error);
        return false;
    }
}
// Add this function to ask the next question
async function askNextQuestion(chatId, telegram) {
    const quiz = activeQuizzes.get(chatId);
    if (!quiz || quiz.state !== QUIZ_STATE.ACTIVE) return;
    
    const currentQuestion = quiz.questions[quiz.currentQuestionIndex];
    const questionNumber = quiz.currentQuestionIndex + 1;
    const totalQuestions = quiz.questions.length;
    
    // Get the timer setting for this chat, default to 30 seconds if not set
    const timer = quizSettings.get(chatId)?.timer || 30;
    
    await telegram.sendMessage(
        chatId,
        `السؤال ${questionNumber}/${totalQuestions}:\n\n${currentQuestion.question}\n\n⏱️ لديك ${timer} ثانية للإجابة!`
    );
    
    // Clear any existing timeouts for this quiz
    while (quiz.timeouts.length) {
        clearTimeout(quiz.timeouts.pop());
    }
    
    // Set a timeout to move to the next question if no one answers correctly
    const timeout = setTimeout(async () => {
        if (activeQuizzes.has(chatId) && 
            activeQuizzes.get(chatId).state === QUIZ_STATE.ACTIVE &&
            activeQuizzes.get(chatId).currentQuestionIndex === quiz.currentQuestionIndex) {
            
            await telegram.sendMessage(
                chatId,
                `⏱️ انتهى الوقت! الإجابة الصحيحة هي: ${currentQuestion.answer}`
            );
            
            // Move to the next question
            quiz.currentQuestionIndex++;
            
            // Check if we've reached the end of the quiz
            if (quiz.currentQuestionIndex >= quiz.questions.length) {
                await endQuiz({ telegram, chat: { id: chatId } }, chatId);
            } else {
                // Ask the next question
                await askNextQuestion(chatId, telegram);
            }
        }
    }, timer * 1000); // Convert seconds to milliseconds
    
    // Store the timeout so we can clear it if someone answers correctly
    quiz.timeouts.push(timeout);
}
// Call this function when initializing the database
createGroupsTable();
   
    async function hasRequiredPermissions(ctx, userId) {
        const isAdmin = await isAdminOrOwner(ctx, userId);
        const isSecDev = await isSecondaryDeveloper(ctx, userId);
        return isAdmin || isSecDev;
    }
    async function loadActiveGroupsFromDatabase() {
        try {
            const db = await getDatabaseForBot('replays');
            
            const groups = await db.collection('groups').find({ is_active: true }).toArray();
            
            activeGroups.clear();
            for (const group of groups) {
                activeGroups.set(group.group_id, { title: group.title, id: group.group_id });
            }
            console.log(`Loaded ${activeGroups.size} active groups from database`);
        } catch (error) {
            console.error('Error loading active groups from database:', error);
        }
    }
// Add this function to handle the list replies button
async function listAllReplies(ctx, botId) {
    try {
        const replies = await getAllReplies(botId);
        
        if (!replies || replies.length === 0) {
            await ctx.editMessageText('الردود العامة:\n\nلا توجد ردود عامة حالياً', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'رجوع', callback_data: 'dev_replies' }]
                    ]
                }
            });
            return;
        }
        
        // Format the replies list
        let message = 'الردود العامة:\n\n';
        replies.forEach((reply, index) => {
            const triggerWord = reply.trigger_word || reply.word || 'غير معروف';
            let responseText = reply.reply_text || reply.text || '[محتوى وسائط]';
            
            // Truncate long responses
            if (responseText.length > 30) {
                responseText = responseText.substring(0, 27) + '...';
            }
            
            message += `${index + 1}. "${triggerWord}" ➡️ "${responseText}"\n`;
        });
        
        // Add pagination if the list is too long
        if (message.length > 4000) {
            message = message.substring(0, 3900) + '\n\n... والمزيد من الردود';
        }
        
        await ctx.editMessageText(message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'إضافة رد', callback_data: 'add_reply' }, { text: 'حذف رد', callback_data: 'delete_reply' }],
                    [{ text: 'رجوع', callback_data: 'dev_replies' }]
                ]
            }
        });
    } catch (error) {
        console.error('Error listing replies:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء محاولة عرض الردود');
        await ctx.editMessageText('حدث خطأ أثناء محاولة عرض الردود. الرجاء المحاولة مرة أخرى.', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'رجوع', callback_data: 'dev_replies' }]
                ]
            }
        });
    }
}
// Add this action handler for adding a new reply
bot.action('add_reply', async (ctx) => {
    const userId = ctx.from.id;
    const botId = ctx.botInfo.id;

    pendingReplies.set(userId, { step: 'awaiting_trigger', botId });
    await ctx.reply('أرسل الكلمة التي تريد إضافة رد لها:');
});

// Add this to your callback query handler
// Add this to your callback query handler
bot.action('list_replies', async (ctx) => {
    const botId = ctx.botInfo.id;
    await listAllReplies(ctx, botId);
});
// Update the dev_replies handler to include the list option
bot.action('dev_replies', async (ctx) => {
    try {
        await ctx.editMessageText('قسم الردود التلقائية: يرجى عدم اضافة كلمة كابتل للغة الانجليزية 🧐', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'عرض الردود', callback_data: 'list_replies' }],
                    [{ text: 'إضافة رد', callback_data: 'add_reply' }],
                    [{ text: 'حذف رد', callback_data: 'delete_reply' }],
                    [{ text: 'رجوع', callback_data: 'back_to_dev_panel' }]
                ]
            }
        });
    } catch (error) {
        console.error('Error in dev_replies handler:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء تحميل قسم الردود');
    }
});
async function getAllReplies(botId) {
    try {
        const db = await getDatabaseForBot('replays');
        return await db.collection('replies').find({ bot_id: botId }).toArray();
    } catch (error) {
        console.error('Error fetching all replies:', error);
        return [];
    }
}
    function showRepliesMenu(ctx) {
        const botId = ctx.botInfo.id;
        const message = 'قسم الردود - اختر الإجراء المطلوب:';
        const keyboard = {
            inline_keyboard: [
                [{ text: '• اضف رد عام •', callback_data: `add_general_reply:${botId}` }],
                [{ text: '• حذف رد عام •', callback_data: `delete_general_reply:${botId}` }],
                [{ text: '• عرض الردود العامة •', callback_data: `list_general_replies:${botId}` }],
                [{ text: '❌ حذف جميع الردود', callback_data: `delete_all_replies:${botId}` }],
                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
            ]
        };
    
        ctx.editMessageText(message, { reply_markup: keyboard });
    }
// Add this callback handler for returning to the main menu
bot.action('back_to_main', async (ctx) => {
    try {
        await ctx.answerCbQuery();

        // Check if the user is an admin, owner, or secondary developer
        const isAdmin = await isAdminOrOwner(ctx, ctx.from.id);
        const isSecDev = await isSecondaryDeveloper(ctx, ctx.from.id);
        const isVIPUser = await isVIP(ctx, ctx.from.id);

        // New check for secondary developer in the database
        const db = await getDatabaseForBot('replays');
        const secDevInDb = await db.collection('secondary_developers').findOne({ user_id: ctx.from.id });

        if (!isAdmin && !isSecDev && !isVIPUser && !secDevInDb) {
            return ctx.answerCbQuery('❌ هذا الأمر مخصص للمشرفين والمطورين الثانويين والمستخدمين المميزين فقط.', { show_alert: true });
        }

        // Get the original photo URL
        const photoUrl = 'https://i.postimg.cc/R0jjs1YY/bot.jpg';
        
        // Edit the message to show the main menu again
        await ctx.editMessageMedia(
            {
                type: 'photo',
                media: photoUrl,
                caption: '🤖 مرحبًا! أنا بوت الحماية والمسابقات ايضا . اختر خيارًا:'


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
 
// Add this callback handler for the quiz_bot button
// Update the quiz-related commands to check for VIP status
bot.action('quiz_bot', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const hasPermissions = await hasRequiredPermissions(ctx, userId);
        const isUserVIP = await isVIP(ctx, userId);
        
        console.log(`User ${userId} permissions check:`, { hasPermissions, isUserVIP });

        if (!hasPermissions && !isUserVIP) {
            console.log(`User ${userId} denied access to quiz_bot`);
            return ctx.answerCbQuery('❌ هذا الأمر مخصص للمشرفين والمطورين والمميزين فقط.', { show_alert: true });
        }

        await ctx.answerCbQuery();
        await showQuizMenu(ctx);
    } catch (error) {
        console.error('Error handling quiz_bot action:', error);
        await ctx.reply('❌ حدث خطأ أثناء فتح قائمة المسابقات.');
    }
});

bot.action('show_commands', async (ctx) => {
    try {
        if (!await hasRequiredPermissions(ctx, ctx.from.id)) {
            return ctx.answerCbQuery('❌ هذا الأمر مخصص للمشرفين والمطورين الثانويين فقط.', { show_alert: true });
        }

        // First part of the message
        const commandsPart1 = 
            '📜 *قائمة الأوامر:*\n\n' +
            '🔹 */ معرفي , رتبتي* –  ظهور رتبتك - ظهور الايدي و معرفك\n' +
            '🔹 */رفع امن مسابقات* – رفع ادمن مسابقات\n' +
            '🔹 */تنزيل امن مسابقات* – تنزيل ادمن مسابقات\n' +
            '🔹 */رفع مميز* – رفع مستخدم إلى مميز\n' +
            '🔹 */تنزيل مميز* – تنزيل مستخدم من مميز\n' +
            '🔹 */لستة مميز* – عرض قائمة المميزين\n' +
            '🔹 */ترقية ادمن* – ترقية إلى أدمن\n' +
            '🔹 */تنزيل* – إزالة رتبة الأدمن\n' +
            '🔹 */ترقية مطور* – ترقية إلى مطور\n' +
            '🔹 */ترقية مطور ثانوي* – ترقية إلى مطور ثانوي\n' +
            '🔹 */تنزيل مطور* – لتنزيل مطور أول أو ثانوي، اذهب إلى خاص البوت كمطور\n' +
            '🔹 */رابط المجموعة* – الحصول على رابط المجموعة\n' +
            '🔹 */نداء الجميع* – مناداة جميع الأعضاء\n' +
            '🔹 */كتم* – كتم مستخدم\n' +
            '🔹 */الغاء كتم* – إلغاء كتم مستخدم\n' +
            '🔹 */مسح* – حذف آخر رسالة\n' +
            '🔹 */تثبيت* – تثبيت رسالة\n' +
            '🔹 */نكتة* – إرسال نكتة\n' +
            '🔹 */طرد* – طرد مستخدم\n' +
            '🔹 */تحذير 🔴* – إصدار تحذير لمستخدم\n' +
            '🔹 */تحذيرات* – 🔴 عرض عدد التحذيرات لمستخدم\n';

         // Send the first part with buttons
        await ctx.editMessageCaption(commandsPart1, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔴 شرح نظام التحذيرات', callback_data: 'explain_warnings' }],
                    [{ text: '⚠️ منع التجوال او spam', callback_data: 'check_premium_for_warnings' }],
                    [{ text: '🔜 التالي', callback_data: 'show_commands_part2' }],
                    [{ text: '🔙 رجوع', callback_data: 'back' }]
                ]
            }
        });

    } catch (error) {
        console.error('Error in show_commands action:', error);
        ctx.answerCbQuery('❌ حدث خطأ أثناء عرض الأوامر. يرجى المحاولة مرة أخرى لاحقًا.', { show_alert: true });
    }
});

bot.action('explain_warnings', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        
        // For non-admins, check premium status
        let isPremium = false;
        try {
            isPremium = await isPremiumUser(userId);
        } catch (error) {
            console.error('Error checking premium status:', error);
            // Continue with isPremium as false if there's an error
        }
        
        const isSpecificUser = userId === 7308214106;

        if (!isPremium && !isSpecificUser) {
            return ctx.answerCbQuery('⭐ هذه الميزة متاحة فقط للمستخدمين المميزين. يرجى الاشتراك للوصول إليها.', { show_alert: true });
        }

        // If user is premium or the specific user, show the warning explanation
        await ctx.answerCbQuery();
        await showWarningExplanation(ctx);
        
    } catch (error) {
        console.error('Error in explain_warnings action:', error);
        ctx.answerCbQuery('❌ حدث خطأ أثناء عرض شرح نظام التحذيرات. يرجى المحاولة مرة أخرى لاحقًا.', { show_alert: true });
    }
});
// Create a separate function to handle manage_warnings after premium check
async function handleManageWarnings(ctx) {
    try {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id;

        // Check if any curfew is active
        const mediaCurfewActive = await isCurfewActive(chatId, 'media');
        const messagesCurfewActive = await isCurfewActive(chatId, 'messages');
        const overallCurfewActive = await isCurfewActive(chatId, 'overall');

        // Display the curfew options
        const message = `🕰️ إعدادات حظر التجول:\n\n` +
                        `اختر نوع الحظر:`;

        const replyMarkup = {
            inline_keyboard: [
                [{ text: 'حظر الوسائط', callback_data: 'curfew_media' }],
                [{ text: 'حظر الرسائل', callback_data: 'curfew_messages' }],
                [{ text: 'حظر شامل', callback_data: 'curfew_overall' }],
            ]
        };

        // Add disable button if any curfew is active
        if (mediaCurfewActive || messagesCurfewActive || overallCurfewActive) {
            replyMarkup.inline_keyboard.push([{ text: '❌ إلغاء الحظر الحالي', callback_data: 'disable_current_curfew' }]);
        }

        replyMarkup.inline_keyboard.push([{ text: '🔙 رجوع', callback_data: 'show_commands' }]);

        // Check if the message to be edited is a photo with a caption
        if (ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(message, { reply_markup: replyMarkup });
        } else {
            // If it's a text message, edit the text
            await ctx.editMessageText(message, { reply_markup: replyMarkup });
        }
    } catch (error) {
        console.error('Error in handleManageWarnings:', error);
        await ctx.reply('❌ حدث خطأ أثناء إدارة حظر التجول.');
    }
}

// Update the manage_warnings handler to use the new premium checking approach
bot.action('manage_warnings', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        // Check if user is admin or has required permissions first
        const hasPermissions = await hasRequiredPermissions(ctx, userId);
        
        // If user has admin permissions, allow access regardless of premium status
        if (hasPermissions) {
            await ctx.answerCbQuery();
            await handleManageWarnings(ctx);
            return;
        }
        
        // For non-admins, check premium status
        let isPremium = false;
        try {
            isPremium = await isPremiumUser(userId);
        } catch (error) {
            console.error('Error checking premium status:', error);
            // Continue with isPremium as false if there's an error
        }
        
        const isSpecificUser = userId === 7308214106;

        if (!isPremium && !isSpecificUser) {
            return ctx.answerCbQuery('⭐ هذه الميزة متاحة فقط للمستخدمين المميزين. يرجى الاشتراك للوصول إليها.', { show_alert: true });
        }

        // If user is premium or the specific user, proceed to manage warnings
        await ctx.answerCbQuery();
        await handleManageWarnings(ctx);
        
    } catch (error) {
        console.error('Error in manage_warnings action:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء إدارة حظر التجول.', { show_alert: true });
    }
});

//  action handler to check premium status before accessing manage_warnings
bot.action('check_premium_for_warnings', async (ctx) => {
    try {
        const userId = ctx.from.id;

       

        // Premium check
        let isPremium = false;

        try {
            isPremium = await isPremiumUser(userId); // ✅ MUST await this!
            console.log(`[DEBUG] Premium check for ${userId}:`, isPremium);
        } catch (error) {
            console.error(`[ERROR] Failed to check premium status for ${userId}:`, error);
            isPremium = false;
        }

        const isSpecificUser = userId === 7308214106;

        if (!isPremium && !isSpecificUser) {
            return ctx.answerCbQuery(
                '⭐ هذه الميزة متاحة فقط للمستخدمين المميزين. يرجى الاشتراك للوصول إليها.',
                { show_alert: true }
            );
        }

        // ✅ Allowed: premium or specific user
        await ctx.answerCbQuery();
        await handleManageWarnings(ctx);

    } catch (error) {
        console.error('❌ Error in check_premium_for_warnings:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء التحقق من حالة العضوية.', { show_alert: true });
    }
});

// Handle the "Next" button to show the second part
bot.action('show_commands_part2', async (ctx) => {
    try {
        const commandsPart2 = 
            '🔹 */مسح الصور* – حذف آخر الصور المرسلة\n' +
            '🔹 */منع الصور* – منع إرسال الصور\n' +
            '🔹 */سماح الصور* – السماح بإرسال الصور\n' +
            '🔹 */ازالة الروابط* – حذف الروابط في المجموعة\n' +
            '🔹 */فتح روابط* – السماح بمشاركة الروابط\n' +
            '🔹 */غلق روابط* – منع مشاركة الروابط\n' +
            '🔹 */منع فيديو* – منع إرسال الفيديوهات\n' +
            '🔹 */تفعيل فيديو* – السماح بإرسال الفيديوهات\n' +
            '🔹 */منع متحركة* – منع إرسال الصور المتحركة\n' +
            '🔹 */تفعيل متحركة* – السماح بإرسال الصور المتحركة';

        await ctx.editMessageCaption(commandsPart2, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 رجوع', callback_data: 'show_commands' }]
                ]
            }
        });

    } catch (error) {
        console.error('Error in show_commands_part2 action:', error);
        ctx.answerCbQuery('❌ حدث خطأ أثناء عرض الأوامر. يرجى المحاولة مرة أخرى لاحقًا.', { show_alert: true });
    }
});
bot.action('explain_warnings', async (ctx) => {
    try {
        const warningExplanation = 
            '*📌 شرح نظام التحذيرات:*\n\n' +
            '1️⃣ *الاستخدام:* يستخدم المشرفون أمر "تحذير" بالرد على رسالة المستخدم المخالف.\n\n' +
            '2️⃣ *آلية العمل:*\n' +
            '   • كل تحذير يزيد من عداد تحذيرات المستخدم.\n' +
            '   • يتم تخزين التحذيرات لكل مستخدم في كل مجموعة بشكل منفصل.\n' +
            '   • يمكن ضبط إعدادات التحذيرات لكل مجموعة.\n\n' +
            '3️⃣ *الإجراءات التلقائية:*\n' +
            '   • بعد 2 تحذيرات: منع إرسال الوسائط لمدة 30 دقيقة.\n' +
            '   • بعد 3 تحذيرات: كتم المستخدم لمدة ساعة.\n' +
            '   • بعد 5 تحذيرات: طرد المستخدم من المجموعة.\n\n' +
            '4️⃣ *مراقبة التحذيرات:*\n' +
            '   • استخدم أمر "تحذيرات" للاطلاع على عدد تحذيرات مستخدم معين.\n' +
            '   • يتم عرض عدد التحذيرات الحالية عند إصدار تحذير جديد.\n\n' +
            '5️⃣ *إعادة ضبط التحذيرات:*\n' +
            '   • تُعاد التحذيرات للصفر تلقائياً بعد الطرد.\n' +
            '   • يمكن للمشرفين إعادة ضبط التحذيرات يدوياً.\n\n' +
            '6️⃣ *الحماية من إساءة الاستخدام:*\n' +
            '   • فقط المشرفون يمكنهم استخدام أمر التحذير.\n' +
            '   • لا يمكن تحذير المشرفين أو المالكين.\n\n' +
            '7️⃣ *تخصيص الإعدادات:*\n' +
            '   • يمكن للمشرفين تعديل عدد التحذيرات اللازمة لكل إجراء.\n' +
            '   • يمكن تفعيل أو تعطيل بعض الإجراءات حسب احتياجات المجموعة.\n\n' +
            '⚠️ استخدم هذا النظام بحكمة للحفاظ على نظام المجموعة وتجنب إساءة استخدامه!';

        await ctx.editMessageCaption(warningExplanation, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔙 رجوع', callback_data: 'show_commands' }]
                ]
            }
        });
    } catch (error) {
        console.error('Error in explain_warnings action:', error);
        ctx.answerCbQuery('❌ حدث خطأ أثناء عرض شرح نظام التحذيرات. يرجى المحاولة مرة أخرى لاحقًا.', { show_alert: true });
    }
});



bot.action('disable_current_curfew', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;

        // Check if the user has the required permissions
        if (!await hasRequiredPermissions(ctx, userId)) {
            return ctx.answerCbQuery('❌ هذا الأمر مخصص للمشرفين والمطورين الثانويين فقط.', { show_alert: true });
        }

        // Disable all types of curfews
        await removeCurfew(chatId, 'media');
        await removeCurfew(chatId, 'messages');
        await removeCurfew(chatId, 'overall');

        await ctx.answerCbQuery('✅ تم إلغاء جميع أنواع الحظر بنجاح.');

        // Update the message to reflect the changes
        const message = '🕰️ تم إلغاء جميع أنواع الحظر. اختر إجراءً:';
        const replyMarkup = {
            inline_keyboard: [
                [{ text: 'حظر الوسائط', callback_data: 'curfew_media' }],
                [{ text: 'حظر الرسائل', callback_data: 'curfew_messages' }],
                [{ text: 'حظر شامل', callback_data: 'curfew_overall' }],
                [{ text: '🔙 رجوع', callback_data: 'show_commands' }]
            ]
        };

        if (ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(message, { reply_markup: replyMarkup });
        } else {
            await ctx.editMessageText(message, { reply_markup: replyMarkup });
        }
    } catch (error) {
        console.error('Error disabling current curfew:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء محاولة إلغاء الحظر الحالي.', { show_alert: true });
    }
});
// Extract the warning explanation to a separate function
async function showWarningExplanation(ctx) {
    try {
        const userId = ctx.from.id;

        // Check if the user has the required permissions (admin/dev)
        const hasPermissions = await hasRequiredPermissions(ctx, userId);
        if (!hasPermissions) {
            // Check if the user is a premium user
            const isPremium = await isPremiumUser(userId);
            if (!isPremium) {
                return ctx.answerCbQuery(
                    '⭐ هذه الميزة متاحة فقط للمستخدمين المميزين. يرجى الاشتراك للوصول إليها.',
                    { show_alert: true }
                );
            }
        }

        // Check if the message to be edited is a photo with a caption
        if (ctx.callbackQuery.message.photo) {
            // For photos, we need to split the explanation into shorter parts due to caption length limits
            const warningExplanationPart1 = 
                '*📌 شرح نظام التحذيرات:*\n\n' +
                '1️⃣ *الاستخدام:* يستخدم المشرفون أمر "تحذير" بالرد على رسالة المستخدم المخالف.\n\n' +
                '2️⃣ *آلية العمل:*\n' +
                '   • كل تحذير يزيد من عداد تحذيرات المستخدم.\n' +
                '   • يتم تخزين التحذيرات لكل مستخدم في كل مجموعة.\n\n' +
                '3️⃣ *الإجراءات التلقائية:*\n' +
                '   • بعد 2 تحذيرات: منع الوسائط (30 دقيقة).\n' +
                '   • بعد 3 تحذيرات: كتم المستخدم (ساعة).\n' +
                '   • بعد 5 تحذيرات: طرد المستخدم.';

            await ctx.editMessageCaption(warningExplanationPart1, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⬇️ المزيد من التفاصيل', callback_data: 'warning_explanation_part2' }],
                        [{ text: '🔙 رجوع', callback_data: 'show_commands' }]
                    ]
                }
            });
        } else {
            // For text messages, we can show the full explanation
            const warningExplanation = 
                '*📌 شرح نظام التحذيرات:*\n\n' +
                '1️⃣ *الاستخدام:* يستخدم المشرفون أمر "تحذير" بالرد على رسالة المستخدم المخالف.\n\n' +
                '2️⃣ *آلية العمل:*\n' +
                '   • كل تحذير يزيد من عداد تحذيرات المستخدم.\n' +
                '   • يتم تخزين التحذيرات لكل مستخدم في كل مجموعة بشكل منفصل.\n' +
                '   • يمكن ضبط إعدادات التحذيرات لكل مجموعة.\n\n' +
                '3️⃣ *الإجراءات التلقائية:*\n' +
                '   • بعد 2 تحذيرات: منع إرسال الوسائط لمدة 30 دقيقة.\n' +
                '   • بعد 3 تحذيرات: كتم المستخدم لمدة ساعة.\n' +
                '   • بعد 5 تحذيرات: طرد المستخدم من المجموعة.\n\n' +
                '4️⃣ *مراقبة التحذيرات:*\n' +
                '   • استخدم أمر "تحذيرات" للاطلاع على عدد تحذيرات مستخدم معين.\n' +
                '   • يتم عرض عدد التحذيرات الحالية عند إصدار تحذير جديد.\n\n' +
                '5️⃣ *إعادة ضبط التحذيرات:*\n' +
                '   • تُعاد التحذيرات للصفر تلقائياً بعد الطرد.\n' +
                '   • يمكن للمشرفين إعادة ضبط التحذيرات يدوياً.\n\n' +
                '6️⃣ *الحماية من إساءة الاستخدام:*\n' +
                '   • فقط المشرفون يمكنهم استخدام أمر التحذير.\n' +
                '   • لا يمكن تحذير المشرفين أو المالكين.\n\n' +
                '7️⃣ *تخصيص الإعدادات:*\n' +
                '   • يمكن للمشرفين تعديل عدد التحذيرات اللازمة لكل إجراء.\n' +
                '   • يمكن تفعيل أو تعطيل بعض الإجراءات حسب احتياجات المجموعة.\n\n' +
                '⚠️ استخدم هذا النظام بحكمة للحفاظ على نظام المجموعة وتجنب إساءة استخدامه!';

            await ctx.editMessageText(warningExplanation, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 رجوع', callback_data: 'show_commands' }]
                    ]
                }
            });
        }
    } catch (error) {
        console.error('Error in showWarningExplanation:', error);
        ctx.answerCbQuery('❌ حدث خطأ أثناء عرض شرح نظام التحذيرات.', { show_alert: true });
    }
}
// Add a handler for the second part of the warning explanation
bot.action('warning_explanation_part2', async (ctx) => {
    try {
        const warningExplanationPart2 = 
            '*📌 شرح نظام التحذيرات (تابع):*\n\n' +
            '4️⃣ *مراقبة التحذيرات:*\n' +
            '   • استخدم أمر "تحذيرات" للاطلاع على تحذيرات مستخدم.\n\n' +
            '5️⃣ *إعادة ضبط التحذيرات:*\n' +
            '   • تُعاد للصفر تلقائياً بعد الطرد.\n' +
            '   • يمكن للمشرفين إعادة ضبطها يدوياً.\n\n' +
            '6️⃣ *الحماية:*\n' +
            '   • فقط المشرفون يمكنهم استخدام التحذير.\n' +
            '   • لا يمكن تحذير المشرفين أو المالكين.';

        await ctx.editMessageCaption(warningExplanationPart2, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⬆️ العودة للجزء الأول', callback_data: 'explain_warnings' }],
                    [{ text: '🔙 رجوع للقائمة', callback_data: 'show_commands' }]
                ]
            }
        });
    } catch (error) {
        console.error('Error showing warning explanation part 2:', error);
        ctx.answerCbQuery('❌ حدث خطأ أثناء عرض الجزء الثاني من الشرح.', { show_alert: true });
    }
});
// Extract the manage_warnings logic to a separate function so it can be reused
async function handleManageWarnings(ctx) {
    try {
        const chatId = ctx.chat.id;
        
        // Check if any curfew is active
        const mediaCurfewActive = await isCurfewActive(chatId, 'media');
        const messagesCurfewActive = await isCurfewActive(chatId, 'messages');
        const overallCurfewActive = await isCurfewActive(chatId, 'overall');

        // Display the curfew options
        const message = `🕰️ إعدادات حظر التجول:\n\n` +
                      `اختر نوع الحظر:`;

        const replyMarkup = {
            inline_keyboard: [
                [{ text: 'حظر الوسائط', callback_data: 'curfew_media' }],
                [{ text: 'حظر الرسائل', callback_data: 'curfew_messages' }],
                [{ text: 'حظر شامل', callback_data: 'curfew_overall' }],
            ]
        };

        // Add disable button if any curfew is active
        if (mediaCurfewActive || messagesCurfewActive || overallCurfewActive) {
            replyMarkup.inline_keyboard.push([{ text: '❌ إلغاء الحظر الحالي', callback_data: 'disable_current_curfew' }]);
        }

        replyMarkup.inline_keyboard.push([{ text: '🔙 رجوع', callback_data: 'show_commands' }]);

        // Check if the message to be edited is a photo with a caption
        if (ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(message, { reply_markup: replyMarkup });
        } else {
            // If it's a text message, edit the text
            await ctx.editMessageText(message, { reply_markup: replyMarkup });
        }
    } catch (error) {
        console.error('Error in handleManageWarnings:', error);
        throw error;
    }
}
async function removeCurfew(chatId, type) {
    try {
        const db = await ensureDatabaseInitialized();
        await db.collection('curfews').updateOne(
            { chatId: chatId },
            { 
                $set: { 
                    [`${type}Curfew`]: false,
                    [`${type}CurfewExpiry`]: null
                }
            }
        );
        console.log(`Curfew ${type} removed for chat ${chatId}`);
    } catch (error) {
        console.error('Error removing curfew:', error);
        throw error;
    }
}
// Implement the setCurfew function
async function setCurfew(chatId, type, hours) {
    try {
        const db = await ensureDatabaseInitialized();
        const expiryTime = new Date(Date.now() + hours * 60 * 60 * 1000);

        await db.collection('curfews').updateOne(
            { chatId: chatId },
            { 
                $set: { 
                    [`${type}Curfew`]: true,
                    [`${type}CurfewExpiry`]: expiryTime
                }
            },
            { upsert: true }
        );

        // Schedule a task to remove the curfew after the specified duration
        setTimeout(async () => {
            await removeCurfew(chatId, type);
        }, hours * 60 * 60 * 1000);

    } catch (error) {
        console.error('Error setting curfew in database:', error);
        throw error;
    }
}

async function removeCurfew(chatId, type) {
    try {
        const db = await ensureDatabaseInitialized();
        await db.collection('curfews').updateOne(
            { chatId: chatId },
            { 
                $set: { 
                    [`${type}Curfew`]: false,
                    [`${type}CurfewExpiry`]: null
                }
            }
        );
        console.log(`Curfew ${type} removed for chat ${chatId}`);
    } catch (error) {
        console.error('Error removing curfew:', error);
    }
}

// Add this function to check if a curfew is active
async function isCurfewActive(chatId, type) {
    try {
        const db = await ensureDatabaseInitialized();
        const curfew = await db.collection('curfews').findOne({ chatId: chatId });
        
        if (curfew && curfew[`${type}Curfew`]) {
            const expiryTime = curfew[`${type}CurfewExpiry`];
            return expiryTime > new Date();
        }
        return false;
    } catch (error) {
        console.error('Error checking curfew status:', error);
        return false;
    }
}


// Add new action handlers for curfew options
bot.action(/^curfew_(media|messages|overall)$/, async (ctx) => {
    try {
        const type = ctx.match[1];
        let typeText;
        
        switch(type) {
            case 'media':
                typeText = 'الوسائط';
                break;
            case 'messages':
                typeText = 'الرسائل';
                break;
            case 'overall':
                typeText = 'شامل';
                break;
        }
        
        const message = `اختر مدة حظر ${typeText}:`;

        const durations = [1, 2, 3, 6, 12];
        const keyboard = durations.map(hours => [{
            text: `${hours} ساعة`,
            callback_data: `set_curfew:${type}:${hours}`
        }]);

        keyboard.push([{ text: '🔙 رجوع', callback_data: 'manage_warnings' }]);

        const replyMarkup = { inline_keyboard: keyboard };

        if (ctx.callbackQuery.message.photo) {
            // If the message has a photo, edit the caption
            await ctx.editMessageCaption(message, { reply_markup: replyMarkup });
        } else {
            // If it's a text message, edit the text
            await ctx.editMessageText(message, { reply_markup: replyMarkup });
        }
    } catch (error) {
        console.error('Error in curfew action:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء تحديد مدة الحظر.', { show_alert: true });
    }
});

bot.action(/^set_curfew:(media|messages|overall):(\d+)$/, async (ctx) => {
    try {
        const [type, hours] = ctx.match.slice(1);
        const chatId = ctx.chat.id;
        
        // Set the appropriate text based on the curfew type
        let typeText;
        switch(type) {
            case 'media':
                typeText = 'الوسائط';
                break;
            case 'messages':
                typeText = 'الرسائل';
                break;
            case 'overall':
                typeText = 'شامل';
                break;
        }

        await setCurfew(chatId, type, parseInt(hours));

        await ctx.answerCbQuery(`✅ تم تفعيل حظر ${typeText} لمدة ${hours} ساعة.`);
        
        const message = `تم تفعيل حظر ${typeText} لمدة ${hours} ساعة. سيتم رفع الحظر تلقائياً بعد انتهاء المدة.`;
        const replyMarkup = {
            inline_keyboard: [[{ text: '🔙 رجوع للإعدادات', callback_data: 'manage_warnings' }]]
        };

        if (ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(message, { reply_markup: replyMarkup });
        } else {
            await ctx.editMessageText(message, { reply_markup: replyMarkup });
        }
    } catch (error) {
        console.error('Error setting curfew:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء تفعيل حظر التجول.', { show_alert: true });
    }
});
// Add action handlers for editing warning settings with predefined options
bot.action(/edit_warning_kick:\d+:-?\d+/, async (ctx) => {
    const dataParts = ctx.callbackQuery.data.split(':');
    const botId = dataParts[1];
    const chatId = dataParts[2];

    console.log('[ACTION] Handling edit_warning_kick', { botId, chatId });

    await ctx.answerCbQuery();

    // Define options for the number of warnings
    const options = [1, 2, 3, 4, 5].map(num => ({
        text: `${num} تحذير`,
        callback_data: `set_warning_kick:${botId}:${chatId}:${num}`
    }));

    const messageText = 'اختر عدد التحذيرات قبل الطرد:';
    const replyMarkup = {
        reply_markup: {
            inline_keyboard: [options, [{ text: '🔙 رجوع', callback_data: 'manage_warnings' }]]
        }
    };

    // Check if the message to be edited is a photo with a caption
    if (ctx.callbackQuery.message.photo) {
        await ctx.editMessageCaption(messageText, replyMarkup);
    } else {
        // If it's a text message, edit the text
        await ctx.editMessageText(messageText, replyMarkup);
    }
});

// Action handler for editing mute warnings
bot.action(/^edit_warning_mute:(\d+):(\d+)$/, async (ctx) => {
    const [botId, chatId] = ctx.match.slice(1);
    console.log('[ACTION] Handling edit_warning_mute', { botId, chatId }); // Add logging
    await ctx.answerCbQuery();

    const options = [1, 2, 3, 4, 5].map(num => ({
        text: `${num} تحذير`,
        callback_data: `set_warning_mute:${botId}:${chatId}:${num}`
    }));

    const messageText = 'اختر عدد التحذيرات قبل الكتم:';
    const replyMarkup = {
        reply_markup: {
            inline_keyboard: [options, [{ text: '🔙 رجوع', callback_data: 'manage_warnings' }]]
        }
    };

    if (ctx.callbackQuery.message.photo) {
        await ctx.editMessageCaption(messageText, replyMarkup);
    } else {
        await ctx.editMessageText(messageText, replyMarkup);
    }
});

// Action handler for editing restrict media warnings
bot.action(/^edit_warning_restrict_media:(\d+):(\d+)$/, async (ctx) => {
    const [botId, chatId] = ctx.match.slice(1);
    console.log('[ACTION] Handling edit_warning_restrict_media', { botId, chatId }); // Add logging
    await ctx.answerCbQuery();

    const options = [1, 2, 3, 4, 5].map(num => ({
        text: `${num} تحذير`,
        callback_data: `set_warning_restrict_media:${botId}:${chatId}:${num}`
    }));

    const messageText = 'اختر عدد التحذيرات قبل منع الوسائط:';
    const replyMarkup = {
        reply_markup: {
            inline_keyboard: [options, [{ text: '🔙 رجوع', callback_data: 'manage_warnings' }]]
        }
    };

    if (ctx.callbackQuery.message.photo) {
        await ctx.editMessageCaption(messageText, replyMarkup);
    } else {
        await ctx.editMessageText(messageText, replyMarkup);
    }
});
bot.action('edit_mute_settings', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🚫 إعدادات الكتم هنا (لم تتم إضافتها بعد).');
    // Or your actual mute settings logic here
  } catch (error) {
    console.error('Error in mute settings:', error);
    await ctx.answerCbQuery('❌ حدث خطأ أثناء تحميل إعدادات الكتم.', { show_alert: true });
  }
});

bot.action('edit_media_settings', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🖼 إعدادات الوسائط هنا (لم تتم إضافتها بعد).');
    // Or your actual media settings logic here
  } catch (error) {
    console.error('Error in media settings:', error);
    await ctx.answerCbQuery('❌ حدث خطأ أثناء تحميل إعدادات الوسائط.', { show_alert: true });
  }
});

const { getLeaderboard } = require('./database');

// ... other code ...

bot.action('show_leaderboard', async (ctx) => {
    try {
        await ctx.answerCbQuery();

        // Get the chat ID from the callback context
        const chatId = ctx.chat?.id || ctx.callbackQuery.message.chat.id;
        
        console.log(`Fetching leaderboard for chat ID: ${chatId}`);

        // Fetch leaderboard data for this specific group
        const leaderboardData = await database.getLeaderboard(chatId);
        
        console.log(`Leaderboard data received, entries: ${leaderboardData.length}`);
        
        let leaderboardText = "🏆 قائمة المتصدرين في هذه المجموعة:\n\n";

        if (leaderboardData && leaderboardData.length > 0) {
            // Add medals for top 3
            const medals = ['🥇', '🥈', '🥉'];
            
            leaderboardData.forEach((entry, index) => {
                const name = entry.firstName || entry.username || 'مستخدم مجهول';
                const prefix = index < 3 ? medals[index] : `${index + 1}.`;
                leaderboardText += `${prefix} ${name}: ${entry.totalScore} نقطة\n`;
            });
        } else {
            leaderboardText += "لا توجد نتائج بعد.";
        }

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '🔙 العودة لقائمة المسابقات', callback_data: 'back_to_quiz_menu' }]
            ]
        };

        // Edit the message with the leaderboard
        if (ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(leaderboardText, {
                reply_markup: replyMarkup
            });
        } else {
            await ctx.editMessageText(leaderboardText, {
                reply_markup: replyMarkup
            });
        }
    } catch (error) {
        console.error('Error showing leaderboard:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء عرض قائمة المتصدرين.');
        await ctx.reply('عذرًا، حدث خطأ أثناء محاولة عرض قائمة المتصدرين. الرجاء المحاولة مرة أخرى لاحقًا.');
    }
})


 // Register session middleware
//bot.use(Scenes.session());
 

// Add a button in the quiz menu for adding questions
bot.action('add_quiz_question', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
        // Check if user is admin or developer
        const isAdmin = await isAdminOrOwner(ctx, ctx.from.id);
        const isDev = await isDeveloper(ctx, ctx.from.id);
        
        if (!isAdmin && !isDev) {
            return ctx.reply('❌ هذا الأمر متاح فقط للمشرفين والمطورين.');
        }
        
        await ctx.scene.enter('add_question_wizard');
    } catch (error) {
        console.error('Error entering add question wizard:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة إضافة سؤال جديد.');
    }
});
bot.action('back_to_quiz_menu', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await showQuizMenu(ctx);
    } catch (error) {
        console.error('Error returning to quiz menu:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء العودة لقائمة المسابقات.');
    }
});
// Implement other helper functions similarly...
 
bot.action(/^add_general_reply:(\d+)$/, async (ctx) => {
    const botId = parseInt(ctx.match[1]);
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery('إضافة رد عام');
        ctx.reply('أرسل الكلمة التي تريد إضافة رد لها:');
        
        // Use userStates instead of userState
        userStates.set(ctx.from.id, {
            action: 'adding_reply',
            step: 'awaiting_trigger',
            botId: botId
        });
    } else {
        ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});
          

bot.action('cancel_add_reply', async (ctx) => {
    try {
        await ctx.answerCbQuery('تم إلغاء إضافة الرد');
        userStates.delete(ctx.from.id);
        await ctx.editMessageText('تم إلغاء عملية إضافة الرد. يمكنك بدء العملية من جديد في أي وقت.');
    } catch (error) {
        console.error('Error canceling add reply:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء إلغاء العملية.', { show_alert: true });
    }
});
    // Modify the delete_general_reply action handler
    bot.action(/^delete_general_reply:(\d+)$/, async (ctx) => {
        try {
            const botId = ctx.match[1];
            const userId = ctx.from.id;
    
            if (await isDeveloper(ctx, userId)) {
                const db = await getDatabaseForBot('replays');
                
                // Fetch all replies for this bot
                const replies = await db.collection('replies').find({ bot_id: botId }).toArray();
                
                if (replies.length === 0) {
                    await ctx.answerCbQuery('لا توجد ردود لحذفها.', { show_alert: true });
                    return;
                }
    
                // Create inline keyboard with reply options
                const keyboard = replies.map(reply => [{
                    text: reply.trigger_word,
                    callback_data: `confirm_delete_reply:${botId}:${reply._id}`
                }]);
    
                keyboard.push([{ text: 'إلغاء', callback_data: `cancel_delete_reply:${botId}` }]);
    
                await ctx.editMessageText('اختر الرد الذي تريد حذفه:', {
                    reply_markup: { inline_keyboard: keyboard }
                });
            } else {
                await ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
            }
        } catch (error) {
            console.error('Error in delete_general_reply action:', error);
            await ctx.answerCbQuery('حدث خطأ أثناء محاولة حذف الرد. الرجاء المحاولة مرة أخرى.', { show_alert: true });
        }
    });
    bot.action(/^delete_all_replies:(\d+)$/, async (ctx) => {
        try {
            const botId = ctx.match[1];
            const userId = ctx.from.id;
    
            if (await isDeveloper(ctx, userId)) {
                await ctx.answerCbQuery();
                await ctx.editMessageText('هل أنت متأكد أنك تريد حذف جميع الردود لهذا البوت؟', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'نعم، احذف الكل', callback_data: `confirm_delete_all_replies:${botId}` }],
                            [{ text: 'إلغاء', callback_data: `cancel_delete_all_replies:${botId}` }]
                        ]
                    }
                });
            } else {
                await ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
            }
        } catch (error) {
            console.error('Error in delete_all_replies action:', error);
            await ctx.answerCbQuery('حدث خطأ أثناء محاولة حذف جميع الردود. الرجاء المحاولة مرة أخرى.', { show_alert: true });
        }
    });

    bot.action(/^confirm_delete_all_replies:(\d+)$/, async (ctx) => {
        try {
            const botId = ctx.match[1];
            const db = await getDatabaseForBot('replays');
            await db.collection('replies').deleteMany({ bot_id: botId });
            await ctx.answerCbQuery('تم حذف جميع الردود بنجاح');
            await ctx.editMessageText('تم حذف جميع الردود لهذا البوت.', {
                reply_markup: {
                    inline_keyboard: [[{ text: 'رجوع', callback_data: `back_to_replies_menu:${botId}` }]]
                }
            });
        } catch (error) {
            console.error('Error in confirm_delete_all_replies action:', error);
            await ctx.answerCbQuery('حدث خطأ أثناء حذف جميع الردود. الرجاء المحاولة مرة أخرى.', { show_alert: true });
        }
    });
    
    bot.action(/^cancel_delete_all_replies:(\d+)$/, async (ctx) => {
        const botId = ctx.match[1];
        await ctx.answerCbQuery('تم إلغاء عملية حذف جميع الردود');
        await ctx.editMessageText('تم إلغاء عملية حذف جميع الردود.', {
            reply_markup: {
                inline_keyboard: [[{ text: 'رجوع', callback_data: `back_to_replies_menu:${botId}` }]]
            }
        });
    });
// Additional actions for confirmation and cancellation

bot.action(/^confirm_delete_reply:(\d+):(.+)$/, async (ctx) => {
    try {
        const [botId, replyId] = ctx.match.slice(1);
        const db = await getDatabaseForBot('replays');
        await db.collection('replies').deleteOne({ _id: ObjectId(replyId), bot_id: botId });
        await ctx.answerCbQuery('تم حذف الرد بنجاح');
        await ctx.editMessageText('تم حذف الرد. هل تريد حذف رد آخر؟', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'حذف رد آخر', callback_data: `delete_general_reply:${botId}` }],
                    [{ text: 'رجوع', callback_data: `back_to_replies_menu:${botId}` }]
                ]
            }
        });
    } catch (error) {
        console.error('Error in confirm_delete_reply action:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء حذف الرد. الرجاء المحاولة مرة أخرى.', { show_alert: true });
    }
});
bot.action(/^back_to_replies_menu:(\d+)$/, async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.editMessageText('قائمة إدارة الردود العامة:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'إضافة رد جديد', callback_data: `add_general_reply:${botId}` }],
                [{ text: 'حذف رد', callback_data: `delete_general_reply:${botId}` }],
                [{ text: 'عرض الردود', callback_data: `list_general_replies:${botId}` }],
                [{ text: 'حذف جميع الردود', callback_data: `delete_all_replies:${botId}` }],
                [{ text: 'رجوع للقائمة الرئيسية', callback_data: 'back_to_main_menu' }]
            ]
        }
    });
});
bot.action(/^cancel_delete_reply:(\d+)$/, async (ctx) => {
    const botId = ctx.match[1];
    await ctx.answerCbQuery('تم إلغاء عملية الحذف');
    await ctx.editMessageText('تم إلغاء عملية حذف الرد.', {
        reply_markup: {
            inline_keyboard: [[{ text: 'رجوع', callback_data: `back_to_replies_menu:${botId}` }]]
        }
    });
});
// Handle the "الإذاعة" button press
bot.action('dev_broadcast', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        awaitingBroadcastPhoto = true;

        await ctx.reply(
`📢 وضع الإذاعة مفعل!

📸 الرجاء إرسال الصورة أو الوسائط التي تريد إذاعتها الآن.

🛑 🟩 لإيقاف وتشغيل هذا الوضع يدويًا، استخدم الأمر: /broadcast
مثال عند التشفيل : 📢 وضع الإذاعة مفعل. يمكنك الآن إرسال الصور للبث. شغال ✅
مثال عند الايقاف : 🛑 تم إيقاف وضع الإذاعة. مو شغال ❌


`
        );
    } catch (error) {
        console.error('Error handling broadcast action:', error);
        await ctx.reply('❌ حدث خطأ أثناء محاولة بدء الإذاعة.');
    }
});


// Add action handlers for editing warning settings with predefined options
bot.action(/edit_warning_kick:\d+:-?\d+/, async (ctx) => {
    const dataParts = ctx.callbackQuery.data.split(':');
    const botId = dataParts[1];
    const chatId = dataParts[2];

    console.log('[ACTION] Handling edit_warning_kick', { botId, chatId });

    await ctx.answerCbQuery();

    // Define options for the number of warnings
    const options = [1, 2, 3, 4, 5].map(num => ({
        text: `${num} تحذير`,
        callback_data: `set_warning_kick:${botId}:${chatId}:${num}`
    }));

    await ctx.editMessageText('اختر عدد التحذيرات قبل الطرد:', {
        reply_markup: {
            inline_keyboard: [options, [{ text: '🔙 رجوع', callback_data: 'manage_warnings' }]]
        }
    });
});

// Action handler for editing mute warnings
bot.action(/^edit_warning_mute:(\d+):-?\d+$/, async (ctx) => {
    if (!ctx.match) {
        console.error('No ctx.match found');
        return ctx.answerCbQuery('⚠️ حدث خطأ داخلي. لا توجد بيانات.', { show_alert: true });
    }

    const [botId, chatId] = ctx.match.slice(1);
    console.log('[ACTION] Handling edit_warning_mute', { botId, chatId });

    await ctx.answerCbQuery();

    const options = [1, 2, 3, 4, 5].map(num => ({
        text: `${num} تحذير`,
        callback_data: `set_warning_mute:${botId}:${chatId}:${num}`
    }));

    const inlineKeyboard = options.map(btn => [btn]);
    inlineKeyboard.push([{ text: '🔙 رجوع', callback_data: 'manage_warnings' }]);

    const messageText = 'اختر عدد التحذيرات قبل الكتم:';
    const replyMarkup = {
        reply_markup: {
            inline_keyboard: inlineKeyboard
        }
    };

    const msg = ctx.callbackQuery.message;
    if (msg.photo) {
        await ctx.editMessageCaption(messageText, replyMarkup);
    } else {
        await ctx.editMessageText(messageText, replyMarkup);
    }
});



// Action handler for editing restrict media warnings
bot.action(/^edit_warning_restrict_media:(\d+):-?\d+$/, async (ctx) => {
    if (!ctx.match) {
        console.error('No ctx.match found');
        return ctx.answerCbQuery('⚠️ حدث خطأ داخلي. لا توجد بيانات.', { show_alert: true });
    }

    const [botId, chatId] = ctx.match.slice(1);
    console.log('[ACTION] Handling edit_warning_restrict_media', { botId, chatId });

    await ctx.answerCbQuery();

    const options = [1, 2, 3, 4, 5].map(num => ({
        text: `${num} تحذير`,
        callback_data: `set_warning_restrict_media:${botId}:${chatId}:${num}`
    }));

    // Wrap each button in its own row
    const inlineKeyboard = options.map(btn => [btn]);
    inlineKeyboard.push([{ text: '🔙 رجوع', callback_data: 'manage_warnings' }]);

    const messageText = 'اختر عدد التحذيرات قبل منع الوسائط:';
    const replyMarkup = {
        reply_markup: {
            inline_keyboard: inlineKeyboard
        }
    };

    const msg = ctx.callbackQuery.message;
    if (msg.photo) {
        await ctx.editMessageCaption(messageText, replyMarkup);
    } else {
        await ctx.editMessageText(messageText, replyMarkup);
    }
});

// Add handlers for setting the warning counts
bot.action(/^set_warning_kick:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const [botId, chatId, count] = ctx.match.slice(1);
    await updateWarningSettings(botId, chatId, { kick: parseInt(count) });
    await ctx.answerCbQuery('✅ تم تحديث عدد التحذيرات قبل الطرد.');
    await ctx.editMessageText('تم تحديث عدد التحذيرات قبل الطرد بنجاح.');
});

bot.action(/^set_warning_mute:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const [botId, chatId, count] = ctx.match.slice(1);
    await updateWarningSettings(botId, chatId, { mute: parseInt(count) });
    await ctx.answerCbQuery('✅ تم تحديث عدد التحذيرات قبل الكتم.');
    await ctx.editMessageText('تم تحديث عدد التحذيرات قبل الكتم بنجاح.');
});

bot.action(/^set_warning_restrict_media:(\d+):(\d+):(\d+)$/, async (ctx) => {
    const [botId, chatId, count] = ctx.match.slice(1);
    await updateWarningSettings(botId, chatId, { restrictMedia: parseInt(count) });
    await ctx.answerCbQuery('✅ تم تحديث عدد التحذيرات قبل منع الوسائط.');
    await ctx.editMessageText('تم تحديث عدد التحذيرات قبل منع الوسائط بنجاح.');
});

    bot.action(/^list_general_replies:(\d+)$/, async (ctx) => {
        try {
            const botId = parseInt(ctx.match[1]);
            const userId = ctx.from.id;
    
            if (await isDeveloper(ctx, userId)) {
                await ctx.answerCbQuery('عرض الردود العامة');
                
                const db = await getDatabaseForBot('replays');
                const replies = await db.collection('replies').find({ bot_id: botId }).toArray();
    
                let replyList = 'الردود العامة:\n\n';
                if (replies.length > 0) {
                    replies.forEach((reply, index) => {
                        replyList += `${index + 1}. الكلمة: ${reply.trigger_word}\nالرد: ${reply.reply_text}\n\n`;
                    });
                } else {
                    replyList += 'لا توجد ردود عامة حالياً.';
                }
    
                // Split the message if it's too long
                const maxLength = 4096; // Telegram's max message length
                if (replyList.length > maxLength) {
                    const chunks = replyList.match(new RegExp(`.{1,${maxLength}}`, 'g'));
                    for (let i = 0; i < chunks.length; i++) {
                        if (i === 0) {
                            await ctx.editMessageText(chunks[i], {
                                reply_markup: {
                                    inline_keyboard: [[{ text: 'رجوع', callback_data: `back_to_replies_menu:${botId}` }]]
                                }
                            });
                        } else {
                            await ctx.reply(chunks[i]);
                        }
                    }
                } else {
                    await ctx.editMessageText(replyList, {
                        reply_markup: {
                            inline_keyboard: [[{ text: 'رجوع', callback_data: `back_to_replies_menu:${botId}` }]]
                        }
                    });
                }
            } else {
                await ctx.answerCbQuery('عذراً، هذا الأمر للمطورين فقط', { show_alert: true });
            }
        } catch (error) {
            console.error('Error in list_general_replies action:', error);
            await ctx.answerCbQuery('حدث خطأ أثناء عرض قائمة الردود. الرجاء المحاولة مرة أخرى.', { show_alert: true });
        }
    });
    
    // Add this callback handler for the start_quiz button
    bot.action('start_quiz', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const chatId = ctx.chat.id;
            const userId = ctx.from.id;
    
            // Check if the user is an admin, developer, or VIP
            const isAdmin = await isAdminOrOwner(ctx, userId);
            const isDev = await isDeveloper(ctx, userId);
            const vipStatus = await isVIP(ctx, userId);

    
            if (!isAdmin && !isDev && !vipStatus) {

                return ctx.reply('❌ عذراً، هذا الأمر متاح فقط للمشرفين والمطورين والمميزين (VIP).');
            }
    
            // Initialize a new quiz for this chat
            activeQuizzes.set(chatId, {
                state: QUIZ_STATE.SELECTING_DIFFICULTY,
                difficulty: null,
                questions: [],
                currentQuestionIndex: 0,
                scores: new Map(),
                attempts: new Map(),
                timeouts: []
            });
    
            const difficultyKeyboard = {
                inline_keyboard: [
                    [{ text: '😊 سهل', callback_data: 'difficulty_easy' }],
                    [{ text: '🤔 متوسط', callback_data: 'difficulty_medium' }],
                    [{ text: '😨 صعب', callback_data: 'difficulty_hard' }],
                    [{ text: '🎲 أسئلة مخصصة', callback_data: 'difficulty_custom' }],
                    [{ text: '🔙 العودة', callback_data: 'back_to_quiz_menu' }]
                ]
            };
    
            const questionCountKeyboard = {
                inline_keyboard: [
                    [
                        { text: '10', callback_data: 'count_10' },
                        { text: '25', callback_data: 'count_25' },
                        { text: '35', callback_data: 'count_35' }
                    ],
                    [
                        { text: '50', callback_data: 'count_50' },
                        { text: '75', callback_data: 'count_75' },
                        { text: '100', callback_data: 'count_100' }
                    ],
                    [{ text: '🔙 العودة', callback_data: 'back_to_quiz_menu' }]
                ]
            };
    
            const combinedKeyboard = {
                inline_keyboard: [
                    ...difficultyKeyboard.inline_keyboard,
                    [{ text: '🔢 اختر عدد الأسئلة', callback_data: 'select_question_count' }]
                ]
            };
    
            const combinedText = `اختر مستوى صعوبة المسابقة:\n\n🔢 اختر عدد الأسئلة للمسابقة:`;
    
            if (ctx.callbackQuery.message.photo) {
                // If the current message is a photo, edit the caption
                await ctx.editMessageCaption(combinedText, { reply_markup: combinedKeyboard });
            } else {
                // If it's a text message, edit the text
                await ctx.editMessageText(combinedText, { reply_markup: combinedKeyboard });
            }
    
            // Add a custom field to track who started the quiz
            activeQuizzes.get(chatId).startedBy = {
                id: userId,
                name: ctx.from.first_name,
                isAdmin: isAdmin,
                isDev: isDev,
                isVIP: isVIP
            };
    
        } catch (error) {
            console.error('Error handling start_quiz action:', error);
            await ctx.reply('❌ حدث خطأ أثناء بدء المسابقة الجديدة.');
        }
    });

    bot.action('difficulty_custom', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const chatId = ctx.chat.id;
            
            // Check if there's an active quiz in the correct state
            if (!activeQuizzes.has(chatId) || activeQuizzes.get(chatId).state !== QUIZ_STATE.SELECTING_DIFFICULTY) {
                return ctx.reply('❌ لا توجد مسابقة نشطة في حالة اختيار الصعوبة.');
            }
            
            // Update quiz state with selected difficulty
            const quiz = activeQuizzes.get(chatId);
            quiz.difficulty = 'custom';
            quiz.state = QUIZ_STATE.SELECTING_QUESTION_COUNT;
            
            // Show question count selection keyboard
            const questionCountKeyboard = {
                inline_keyboard: [
                    [
                        { text: '10', callback_data: 'count_10' },
                        { text: '25', callback_data: 'count_25' },
                        { text: '35', callback_data: 'count_35' }
                    ],
                    [
                        { text: '50', callback_data: 'count_50' },
                        { text: '75', callback_data: 'count_75' },
                        { text: '100', callback_data: 'count_100' }
                    ],
                    [{ text: '🔙 العودة', callback_data: 'back_to_quiz_menu' }]
                ]
            };
            
            const text = `تم اختيار الأسئلة المخصصة\n\n🔢 اختر عدد الأسئلة للمسابقة:`;
            
            if (ctx.callbackQuery.message.photo) {
                await ctx.editMessageCaption(text, { reply_markup: questionCountKeyboard });
            } else {
                await ctx.editMessageText(text, { reply_markup: questionCountKeyboard });
            }
        } catch (error) {
            console.error('Error selecting custom difficulty:', error);
            await ctx.reply('❌ حدث خطأ أثناء اختيار الأسئلة المخصصة. يرجى المحاولة مرة أخرى.');
        }
    });

    // Add a new action handler for selecting question count
bot.action('select_question_count', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const questionCountKeyboard = {
            inline_keyboard: [
                [
                    { text: '10', callback_data: 'count_10' },
                    { text: '25', callback_data: 'count_25' },
                    { text: '35', callback_data: 'count_35' }
                ],
                [
                    { text: '50', callback_data: 'count_50' },
                    { text: '75', callback_data: 'count_75' },
                    { text: '100', callback_data: 'count_100' }
                ],
                [{ text: '🔙 العودة', callback_data: 'back_to_quiz_menu' }]
            ]
        };

        const text = '🔢 اختر عدد الأسئلة للمسابقة:';

        if (ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(text, { reply_markup: questionCountKeyboard });
        } else {
            await ctx.editMessageText(text, { reply_markup: questionCountKeyboard });
        }
    } catch (error) {
        console.error('Error handling select_question_count action:', error);
        await ctx.reply('❌ حدث خطأ أثناء اختيار عدد الأسئلة.');
    }
});

// Add a handler for the back button to return to the quiz menu
bot.action('back_to_quiz_menu', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await showQuizMenu(ctx);
    } catch (error) {
        console.error('Error returning to quiz menu:', error);
        await ctx.reply('❌ حدث خطأ أثناء العودة لقائمة المسابقات.');
    }
});
// Add these action handlers
bot.action(/^quiz_timer_(\d+)$/, async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const newTimer = parseInt(ctx.match[1]);
        
        // Update the quiz settings for this chat
        quizSettings.set(chatId, { ...quizSettings.get(chatId), timer: newTimer });
        
        await ctx.answerCbQuery(`تم تحديث وقت السؤال إلى ${newTimer} ثانية`);
        await ctx.editMessageText(`تم تحديث إعدادات المسابقة.\nوقت السؤال الجديد: ${newTimer} ثانية`);
    } catch (error) {
        console.error('Error updating quiz timer:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء تحديث الإعدادات.');
    }
});

bot.action('show_current_timer', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const currentTimer = quizSettings.get(chatId)?.timer || 30; // Default to 30 seconds if not set
        await ctx.answerCbQuery(`الوقت الحالي للسؤال: ${currentTimer} ثانية`);
    } catch (error) {
        console.error('Error showing current timer:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء عرض الوقت الحالي.');
    }
});
// Handle difficulty selection
bot.action(/^difficulty_(.+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const chatId = ctx.chat.id;
        const difficulty = ctx.match[1]; // easy, medium, or hard
        
        // Check if there's an active quiz in the correct state
        if (!activeQuizzes.has(chatId) || activeQuizzes.get(chatId).state !== QUIZ_STATE.SELECTING_DIFFICULTY) {
            return ctx.reply('❌ لا توجد مسابقة نشطة في حالة اختيار الصعوبة.');
        }
        
        // Update quiz state with selected difficulty
        const quiz = activeQuizzes.get(chatId);
        quiz.difficulty = difficulty;
        quiz.state = QUIZ_STATE.SELECTING_QUESTION_COUNT;
        
        // Show question count selection keyboard
        const questionCountKeyboard = {
            inline_keyboard: [
                [
                    { text: '10', callback_data: 'count_10' },
                    { text: '25', callback_data: 'count_25' },
                    { text: '35', callback_data: 'count_35' }
                ],
                [
                    { text: '50', callback_data: 'count_50' },
                    { text: '75', callback_data: 'count_75' },
                    { text: '100', callback_data: 'count_100' }
                ],
                [{ text: '🔙 العودة', callback_data: 'back_to_quiz_menu' }]
            ]
        };
        
        const text = `تم اختيار مستوى الصعوبة: ${difficulty}\n\n🔢 اختر عدد الأسئلة للمسابقة:`;
        
        if (ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(text, { reply_markup: questionCountKeyboard });
        } else {
            await ctx.editMessageText(text, { reply_markup: questionCountKeyboard });
        }
    } catch (error) {
        console.error('Error selecting difficulty:', error);
        await ctx.reply('❌ حدث خطأ أثناء اختيار مستوى الصعوبة. يرجى المحاولة مرة أخرى.');
    }
});
// Handle question count selection
// Handle question count selection
bot.action(/^count_(\d+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const chatId = ctx.chat.id;
        const count = parseInt(ctx.match[1]);

        console.log(`Received count selection: ${count} for chat ${chatId}`);

        if (!activeQuizzes.has(chatId)) {
            console.log(`No active quiz found for chat ${chatId}`);
            return ctx.reply('❌🥲  لا توجد مسابقة نشطة في هذه المحادثة. يرجى بدء مسابقة جديدة عن طريق الرجوع الى القائمة الرئيسية والمحاولة مرة اخرى.');
        }

        const quiz = activeQuizzes.get(chatId);
        console.log(`Quiz state for chat ${chatId}:`, quiz);

        if (quiz.state !== QUIZ_STATE.SELECTING_QUESTION_COUNT) {
            console.log(`Incorrect quiz state for chat ${chatId}: ${quiz.state}`);
            return ctx.reply(`❌ المسابقة ليست في حالة اختيار عدد الأسئلة. الحالة الحالية: ${quiz.state}`);
        }

        // Handle custom difficulty
        if (quiz.difficulty === 'custom') {
            // Fetch custom questions from the database
            const customQuestions = await getCustomQuestionsForChat(chatId);
            
            if (customQuestions.length === 0) {
                console.log(`No custom questions available for chat ${chatId}`);
                activeQuizzes.delete(chatId);
                return ctx.reply('❌ لا توجد أسئلة مخصصة متاحة. يرجى إضافة أسئلة مخصصة أولاً.');
            }

            quiz.questions = customQuestions;
        } else {
            // Get questions for the selected difficulty
            let allQuestions = difficulties[quiz.difficulty] || [];
            
            if (allQuestions.length === 0) {
                console.log(`No questions available for difficulty ${quiz.difficulty}`);
                activeQuizzes.delete(chatId);
                return ctx.reply(`❌ لا توجد أسئلة متاحة لمستوى الصعوبة "${quiz.difficulty}".`);
            }
            
            // If we don't have enough questions, we'll repeat some
            quiz.questions = [];
            while (quiz.questions.length < count) {
                const shuffled = shuffleArray(allQuestions);
                quiz.questions = [...quiz.questions, ...shuffled.slice(0, Math.min(count - quiz.questions.length, shuffled.length))];
            }
        }

        // Trim questions to the selected count
        quiz.questions = quiz.questions.slice(0, count);
        
        // Update quiz state and start
        quiz.state = QUIZ_STATE.ACTIVE;
        quiz.currentQuestionIndex = 0;
        quiz.scores = new Map();
        quiz.attempts = new Map();
        
        console.log(`Quiz started for chat ${chatId} with ${quiz.questions.length} questions`);
        
        await ctx.reply(`🎮 تم بدء المسابقة! سيتم طرح ${count} سؤال، ولديك 30 ثانية للإجابة على كل سؤال.`);
        await ctx.reply('⚠️ يمكنك إيقاف المسابقة في أي وقت باستخدام الأمر /stop');
        
        // Start the first question
        await askNextQuestion(chatId, ctx.telegram);

    } catch (error) {
        console.error('Error in count selection:', error);
        await ctx.reply('❌ حدث خطأ أثناء إعداد المسابقة. يرجى المحاولة مرة أخرى.');
    }
});
// Add this function to fetch warning settings from the database
async function getWarningSettings(botId, chatId) {
    try {
        const db = await ensureDatabaseInitialized();
        const settings = await db.collection('warning_settings').findOne({ bot_id: botId, chat_id: chatId });
        return settings || {};
    } catch (error) {
        console.error('Error fetching warning settings:', error);
        return {};
    }
}

// Add this function to update warning settings in the database
async function updateWarningSettings(botId, chatId, settings) {
    try {
        const db = await ensureDatabaseInitialized();
        await db.collection('warning_settings').updateOne(
            { bot_id: botId, chat_id: chatId },
            { $set: settings },
            { upsert: true }
        );
    } catch (error) {
        console.error('Error updating warning settings:', error);
    }
}

// Add this function to fetch custom questions
async function getCustomQuestionsForChat(chatId) {
    try {
        const db = await database.getDb();
        const customQuestions = await db.collection('custom_questions').find({ chatId: chatId }).toArray();
        return customQuestions.map(q => ({ question: q.question, answer: q.answer }));
    } catch (error) {
        console.error('Error fetching custom questions:', error);
        return [];
    }
}
bot.action('change_bot_name', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery();
        await ctx.reply('الرجاء إرسال الاسم الجديد للبوت:');
        ctx.session.awaitingBotName = true;
    } else {
        await ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});
async function checkBotNameAndReply(ctx) {
    const chatId = ctx.chat.id;
    const messageText = ctx.message.text.toLowerCase();

    // Check if the chat is an active group
    if (!activeGroups.has(chatId)) {
        return;
    }

    try {
        const db = await getDatabaseForBot('replays');
        const botNameDoc = await db.collection('bot_names').findOne({ chat_id: chatId });

        if (botNameDoc && messageText.includes(botNameDoc.name.toLowerCase())) {
            const replies = [
                'نعم، أنا هنا!',
                'مرحبًا! كيف يمكنني مساعدتك؟',
                'هل ناداني أحد؟',
                'في خدمتك!'
            ];
            const randomReply = replies[Math.floor(Math.random() * replies.length)];
            await ctx.reply(randomReply, { reply_to_message_id: ctx.message.message_id });
        }
    } catch (error) {
        console.error('Error checking bot name:', error);
    }
} 
    
bot.action('show_current_bot_name', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery();
        const chatId = ctx.chat.id;
        try {
            const db = await getDatabaseForBot('replays');
            const botName = await db.collection('bot_names').findOne({ chat_id: chatId });
            if (botName) {
                await ctx.reply(`اهلا بك عزيزي في قسم اسم البوت\nاسم البوت الآن: ${botName.name}`);
            } else {
                await ctx.reply('لم يتم تعيين اسم مخصص للبوت في هذه المجموعة.');
            }
        } catch (error) {
            console.error('Error fetching bot name:', error);
            await ctx.reply('حدث خطأ أثناء محاولة عرض اسم البوت.');
        }
    } else {
        await ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});
    bot.command('update_groups', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            updateActiveGroups(ctx);
            ctx.reply(`Groups updated. Current count: ${activeGroups.size}`);
        }
    });
    bot.command('debug_groups', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            let debugMessage = `Active Groups (${activeGroups.size}):\n\n`;
            for (const [groupId, groupInfo] of activeGroups) {
                debugMessage += `${groupInfo.title} (${groupId})\n`;
            }
            ctx.reply(debugMessage);
        }
    });
   


    bot.command('تنزيل مطور', async (ctx) => {
        await demoteUser(ctx, 'developer');
    });
    
    bot.hears(/^تنزيل مطور/, async (ctx) => {
        await demoteUser(ctx, 'developer');
    });
    // Add these lines to your existing command handlers
bot.hears(/^ترقية (مميز|ادمن|مدير|منشئ|منشئ اساسي|مطور|مطور ثانوي)/, (ctx) => {
    const role = ctx.match[1];
    promoteUser(ctx, role);
});

bot.hears('تنزيل', (ctx) => demoteUser(ctx));


bot.on('left_chat_member', (ctx) => {
    if (ctx.message.left_chat_member.id === ctx.botInfo.id) {
        markGroupAsInactive(ctx.chat.id);
    }
});    
bot.on(['photo', 'document', 'animation', 'sticker'], async (ctx) => {
    const userId = ctx.from.id;
    const state = pendingReplies.get(userId);

    if (!state || state.step !== 'awaiting_response') return;

    const db = await getDatabaseForBot('replays');

    let mediaType = 'unknown';
    let fileId;
    let extension = 'bin';

    if (ctx.message.photo) {
        mediaType = 'photo';
        fileId = ctx.message.photo.at(-1).file_id;
        extension = 'jpg';
    } else if (ctx.message.wewe) {
        mediaType = 'wewe';
        fileId = ctx.message.video.file_id;
        extension = 'mp4';
    } else if (ctx.message.document) {
        mediaType = 'document';
        fileId = ctx.message.document.file_id;
        extension = ctx.message.document.file_name?.split('.').pop() || 'file';
    } else if (ctx.message.animation) {
        mediaType = 'animation';
        fileId = ctx.message.animation.file_id;
        extension = 'mp4';
    } else if (ctx.message.sticker) {
        mediaType = 'sticker';
        fileId = ctx.message.sticker.file_id;
        extension = 'webp';
    }

    const fileLink = await ctx.telegram.getFileLink(fileId);
    const fileName = `${mediaType}_${Date.now()}_${userId}.${extension}`;
    const savedFilePath = await saveFile(fileLink, fileName);

    await db.collection('replies').insertOne({
        bot_id: state.botId,
        trigger_word: state.triggerWord,
        type: 'media',
        media_type: mediaType,
        file_id: fileId,
        file_path: savedFilePath,
        created_by: userId,
        created_at: new Date()
    });

    await ctx.reply(`✅ تم حفظ الرد (${mediaType}) للكلمة "${state.triggerWord}"`);
    pendingReplies.delete(userId);
});




// Register the text handler
    // For the text handler that's causing errors, update it to:
    // Register the text handler
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const chatId = ctx.chat.id; // 👈 Fix added here
        const userState = pendingReplies.get(userId);
        const text = ctx.message.text?.trim();
        const isBroadcasting = chatBroadcastStates.get(chatId) || awaitingBroadcastPhoto;
        const userAnswer = ctx.message.text.trim().toLowerCase();
        if (ctx.session.awaitingBotName) {
            const newBotName = ctx.message.text.trim();
            const chatId = ctx.chat.id;
            try {
                const db = await getDatabaseForBot('replays');
                await db.collection('bot_names').updateOne(
                    { chat_id: chatId },
                    { $set: { name: newBotName } },
                    { upsert: true }
                );
    
                // Save a default reply for the new bot name
                await db.collection('replies').updateOne(
                    { trigger_word: newBotName, chat_id: chatId },
                    { $set: { 
                        trigger_word: newBotName, 
                        reply_text: `عيونه 🙌: ${newBotName}`,
                        chat_id: chatId,
                        type: "text"
                    }},
                    { upsert: true }
                );
    
                await ctx.reply(`✅ تم تغيير اسم البوت إلى "${newBotName}" وحفظ الرد الافتراضي.`);
                ctx.session.awaitingBotName = false;
            } catch (error) {
                console.error('Error updating bot name:', error);
                await ctx.reply('❌ حدث خطأ أثناء تحديث اسم البوت. يرجى المحاولة مرة أخرى.');
                ctx.session.awaitingBotName = false;
            }
        }
         if (!state) return;

    
  if (isNaN(count) || count < 1) {
    return ctx.reply('❌ يرجى إدخال رقم صحيح أكبر من 0.');
}

let updateField;
switch (action) {
    case 'edit_warning_kick':
        updateField = { kick: count };
        break;
    case 'edit_warning_mute':
        updateField = { mute: count };
        break;
    case 'edit_warning_restrict_media':
        updateField = { restrictMedia: count };
        break;
    default:
        return;
}

try {
    await updateWarningSettings(botId, chatId, updateField);
    await ctx.reply('✅ تم تحديث الإعدادات بنجاح.');
} catch (error) {
    console.error('Error updating warning settings:', error);
    await ctx.reply('❌ حدث خطأ أثناء تحديث الإعدادات.');
}

userStates.delete(userId);
    
    

if (isBroadcasting && text) {
    try {
        await broadcastMessage(ctx, null, null, text);

        if (awaitingBroadcastPhoto) {
            awaitingBroadcastPhoto = false;
            await ctx.reply('✅ تم إرسال الرسالة.\n🛑 تم إيقاف وضع الإذاعة اليدوي.');
        }

        return; // 🛑 Prevent further processing of this broadcast message
    } catch (error) {
        console.error('Error broadcasting text:', error);
        await ctx.reply('❌ حدث خطأ أثناء بث الرسالة.');
        return;
    }
}


    if (userState) {
        if (userState.step === 'awaiting_trigger') {
            userState.triggerWord = text;
            userState.step = 'awaiting_response';
            await ctx.reply(`تم استلام الكلمة "${text}". الآن أرسل الرد (نص أو وسائط):`);
            return;
        }
        const db = await getDatabaseForBot('replays');
        const trigger = text.toLowerCase();
        const reply = await db.collection('replies').findOne({ trigger_word: trigger });
        if (userState.step === 'awaiting_response') {
            const db = await getDatabaseForBot('replays');
            await db.collection('replies').insertOne({
                bot_id: userState.botId,
                trigger_word: userState.triggerWord,
                type: 'text',
                text: text,
                created_by: userId,
                created_at: new Date()
            });

            await ctx.reply(`✅ تم حفظ الرد النصي للكلمة "${userState.triggerWord}"`);
            pendingReplies.delete(userId);
            return;
        }
    }
        try {
            console.log('Received message:', ctx.message.text);
            
            // First, handle any awaiting states
            if (await handleAwaitingReplyResponse(ctx)) return;
            
            const text = ctx.message.text.trim().toLowerCase();
            const chatId = ctx.chat.id;
            const userId = ctx.from.id;
            
            // Handle awaiting states in private chats
            if (ctx.chat.type === 'private') {
                if (awaitingReplyWord) {
                    tempReplyWord = text;
                    ctx.reply(`تم استلام الكلمة: "${tempReplyWord}". الآن أرسل الرد الذي تريد إضافته لهذه الكلمة:`);
                    awaitingReplyWord = false;
                    awaitingReplyResponse = true;
                    return;
                } else if (awaitingReplyResponse) {
                    const replyResponse = ctx.message.text;
                    try {
                        const db = await getDatabaseForBot('replays');
                        const botId = ctx.botInfo.id; // Get current bot ID
                        
                        await db.collection('replies').updateOne(
                            { trigger_word: tempReplyWord, bot_id: botId },
                            { $set: { 
                                trigger_word: tempReplyWord, 
                                reply_text: replyResponse,
                                bot_id: botId,
                                type: "text"
                            }},
                            { upsert: true }
                        );
                        
                        ctx.reply(`تم إضافة الرد بنجاح!\nالكلمة: ${tempReplyWord}\nالرد: ${replyResponse}`);
                        awaitingReplyResponse = false;
                        return;
                    } catch (error) {
                        console.error('Error saving reply:', error);
                        ctx.reply('حدث خطأ أثناء حفظ الرد. الرجاء المحاولة مرة أخرى.');
                        awaitingReplyResponse = false;
                        return;
                    }
                } else if (awaitingDeleteReplyWord) {
                    try {
                        const db = await getDatabaseForBot('replays');
                        const botId = ctx.botInfo.id;
                        
                        const result = await db.collection('replies').deleteOne({ 
                            trigger_word: text,
                            bot_id: botId
                        });
                        
                        if (result.deletedCount > 0) {
                            ctx.reply(`تم حذف الرد للكلمة "${text}" بنجاح.`);
                        } else {
                            // Try to delete global reply if bot-specific not found
                            const globalResult = await db.collection('replies').deleteOne({ 
                                trigger_word: text,
                                bot_id: { $exists: false }
                            });
                            
                            if (globalResult.deletedCount > 0) {
                                ctx.reply(`تم حذف الرد العام للكلمة "${text}" بنجاح.`);
                            } else {
                                ctx.reply(`لم يتم العثور على رد للكلمة "${text}".`);
                            }
                        }
                        awaitingDeleteReplyWord = false;
                        return;
                    } catch (error) {
                        console.error('Error deleting reply:', error);
                        ctx.reply('حدث خطأ أثناء حذف الرد. الرجاء المحاولة مرة أخرى.');
                        awaitingDeleteReplyWord = false;
                        return;
                    }
                } else if (awaitingBotName) {
                    try {
                        await ctx.telegram.setMyName(text);
                        ctx.reply(`تم تغيير اسم البوت بنجاح إلى: ${text}`);
                        awaitingBotName = false;
                        return;
                    } catch (error) {
                        console.error('Error changing bot name:', error);
                        ctx.reply('حدث خطأ أثناء تغيير اسم البوت. الرجاء المحاولة مرة أخرى.');
                        awaitingBotName = false;
                        return;
                    }
                }
                
                // Handle user states for adding replies
                const userState = userStates.get(userId);
                if (userState) {
                    if (userState.action === 'adding_reply' && userState.step === 'awaiting_trigger') {
                        userState.trigger = text;
                        userState.step = 'awaiting_response';
                        userStates.set(userId, userState);
                        
                        await ctx.reply(`تم استلام الكلمة: "${text}". الآن أرسل الرد الذي تريد إضافته لهذه الكلمة:`, {
                            reply_markup: {
                                inline_keyboard: [[{ text: 'إلغاء', callback_data: 'cancel_add_reply' }]]
                            }
                        });
                        return;
                    } else if (userState.action === 'adding_reply' && userState.step === 'awaiting_response') {
                        const replyText = text;
                        const triggerWord = userState.trigger;
                        const botId = userState.botId || ctx.botInfo.id;
                        
                        try {
                            const db = await getDatabaseForBot('replays');
                            await db.collection('replies').updateOne(
                                { trigger_word: triggerWord, bot_id: botId },
                                { $set: { 
                                    trigger_word: triggerWord, 
                                    reply_text: replyText,
                                    bot_id: botId,
                                    type: "text"
                                }},
                                { upsert: true }
                            );
                            
                            await ctx.reply(`✅ تم إضافة الرد بنجاح!\n\nالكلمة: ${triggerWord}\nالرد: ${replyText}`);
                            userStates.delete(userId);
                        } catch (error) {
                            console.error('Error saving reply:', error);
                            await ctx.reply('❌ حدث خطأ أثناء حفظ الرد. الرجاء المحاولة مرة أخرى.');
                        }
                        return;
                    }
                }
            }
            
            // Check for automatic replies
            try {
                const db = await getDatabaseForBot('replays');
                console.log('Searching for reply with keyword:', text);
                
                // First try to find a bot-specific reply
                const botId = ctx.botInfo.id; // Get the current bot's ID
                let reply = await db.collection('replies').findOne({
                    bot_id: botId,
                    $or: [
                        { trigger_word: text },
                        { word: text }
                    ]
                });
                
                // If no bot-specific reply is found, try to find a global reply
                if (!reply) {
                    reply = await db.collection('replies').findOne({
                        $or: [
                            { trigger_word: text },
                            { word: text }
                        ],
                        bot_id: { $exists: false }
                    });
                }
                
                console.log('Reply search result:', reply);
                
                if (reply) {
                    // Handle different reply structures
                    if (reply.reply_text) {
                        await ctx.reply(reply.reply_text, { reply_to_message_id: ctx.message.message_id });
                        return;
                    }
                    
                    // Handle typed replies
if (reply) {
    try {
        switch (reply.type) {
            case "text":
                if (reply.text || reply.reply_text) {
                    await ctx.reply(reply.text || reply.reply_text, { reply_to_message_id: ctx.message.message_id });
                } else {
                    throw new Error('No valid text content found in reply');
                }
                break;
            case "photo":
                if (reply.file_id) {
                    await ctx.replyWithPhoto(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                } else {
                    throw new Error('No valid photo file_id found in reply');
                }
                break;
            // ✅ Add this case to handle 'media' replies
            case "media":
                if (!reply.media_type) {
                    throw new Error('Missing media_type in media reply');
                }
        
                switch (reply.media_type) {
                    case "photo":
                        await ctx.replyWithPhoto(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                        break;
                    case "video":
                        await ctx.replyWithVideo(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                        break;
                    case "animation":
                        await ctx.replyWithAnimation(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                        break;
                    case "document":
                        await ctx.replyWithDocument(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                        break;
                    case "sticker":
                        await ctx.replyWithSticker(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                        break;
                    default:
                        throw new Error(`Unsupported media_type: ${reply.media_type}`);
                }
                break;
            case "animation":
            case "video":
            case "sticker":
            case "document":
                if (reply.file_id) {
                    const method = {
                        animation: ctx.replyWithAnimation,
                        video: ctx.replyWithVideo,
                        sticker: ctx.replyWithSticker,
                        document: ctx.replyWithDocument
                    }[reply.type];
                    await method.call(ctx, reply.file_id, { reply_to_message_id: ctx.message.message_id });
                } else {
                    throw new Error(`No valid ${reply.type} file_id found in reply`);
                }
                break;
            default:
                // If nothing matched and we still have some text, send it
                if (reply.text || reply.reply_text) {
                    await ctx.reply(reply.text || reply.reply_text, { reply_to_message_id: ctx.message.message_id });
                } else {
                    throw new Error('No valid content found in reply');
                }
        }
        

    } catch (error) {
        console.error('Error handling reply:', error.message);
        console.error('Reply object:', JSON.stringify(reply, null, 2));
        await ctx.reply('عذرًا، حدث خطأ أثناء معالجة الرد. يرجى المحاولة مرة أخرى أو الاتصال بمسؤول النظام.');
    }
} else {
    console.log('No reply found for the given trigger');
}
                    return;
                }
            } catch (error) {
                console.error('Error checking for automatic replies:', error);
            }
            
            // Handle quiz answers if there's an active quiz
            if (activeQuizzes.has(chatId) && activeQuizzes.get(chatId).state === QUIZ_STATE.ACTIVE) {
                await handleQuizAnswer(ctx);
                return;
            }
            
            // Update last interaction for the user
            updateLastInteraction(userId);
            
            // If in a group, update the group's active status
            if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
                updateActiveGroups(ctx);
            }
            
        } catch (error) {
            console.error('Error in text handler:', error);
        }
         // Check if there's an active quiz in this chat
        if (!activeQuizzes.has(chatId) || activeQuizzes.get(chatId).state !== QUIZ_STATE.ACTIVE) {
            return; // No active quiz, so continue with other handlers
        }
        
        const quiz = activeQuizzes.get(chatId);
        const currentQuestion = quiz.questions[quiz.currentQuestionIndex];
        
        if (!currentQuestion) {
            return; // No current question
        }
        
        // Check if this user has already attempted this question
        if (quiz.attempts.has(`${userId}_${quiz.currentQuestionIndex}`)) {
            return; // User already attempted this question
        }
        
        // Mark that this user has attempted this question
        quiz.attempts.set(`${userId}_${quiz.currentQuestionIndex}`, true);
        
        // Check if the answer is correct (case insensitive comparison)
        const correctAnswer = currentQuestion.answer.toLowerCase();
        const isCorrect = userAnswer === correctAnswer;
        
        if (isCorrect) {
            // Update user's score
            const currentScore = quiz.scores.get(userId) || 0;
            quiz.scores.set(userId, currentScore + 1);
            
            // Get user info for the leaderboard
            const firstName = ctx.from.first_name || '';
            const lastName = ctx.from.last_name || '';
            const username = ctx.from.username || '';
            
            // Save the score to the database
            try {
                await database.saveQuizScore(chatId, userId, firstName, lastName, username, 1);
            } catch (dbError) {
                console.error('Error saving quiz score:', dbError);
            }
            
            // Clear any pending timeouts for this question
            while (quiz.timeouts.length) {
                clearTimeout(quiz.timeouts.pop());
            }
            
            // Send congratulatory message
            await ctx.reply(`🎉 إجابة صحيحة من ${firstName}! (+1 نقطة)`);
            
            // Move to the next question
            quiz.currentQuestionIndex++;
            
            // Check if we've reached the end of the quiz
            if (quiz.currentQuestionIndex >= quiz.questions.length) {
                await endQuiz(ctx, chatId);
            } else {
                // Ask the next question after a short delay
                setTimeout(() => askNextQuestion(chatId, ctx.telegram), 2000);
            }
        }
    });



// Updated handleMediaReply function to check both global and user-specific states


// Helper function to get Arabic names for media types
// Add this helper function
function getMediaTypeInArabic(mediaType) {
    switch (mediaType) {
        case 'photo':
            return 'صورة';
        case 'video':
            return 'فيديو';
        case 'animation':
            return 'صورة متحركة';
        case 'document':
            return 'ملف';
        case 'sticker':
            return 'ملصق';
        default:
            return mediaType;
    }
}

    //this fucks how the bot starts
     // Replace the problematic message handler with this one
     
    bot.on('message', async (ctx, next) => {
        await updateGroupInfo(ctx);
    next();
    try {
        console.log('Received message:', ctx.message);

        const userId = ctx.from.id;
        const username = ctx.from.username;
        const message = ctx.message;
        const chatId = ctx.chat.id;

        // Update last interaction for the user
        updateLastInteraction(userId, username, ctx.from.first_name, ctx.from.last_name);
        
        // If in a group, update the group's active status
        if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
            updateActiveGroups(ctx.chat.id, ctx.chat.title);
        }

        // Handle custom question input for quizzes
        if (chatStates.has(chatId)) {
            await handleCustomQuestionInput(ctx);
            return;
        }
 // Handle broadcast command or media
if ((message.text && message.text.startsWith('اذاعة')) || 
(message.caption && message.caption.startsWith('اذاعة')) || 
(ctx.message.reply_to_message && ctx.message.reply_to_message.text === 'اذاعة')) {
if (await isDeveloper(ctx, userId)) {
    await handleBroadcast(ctx);
    return;
}
}
        // Handle photos
                // Handle photos
        if (ctx.message.photo && awaitingReplyResponse) {
            const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            try {
                const db = await getDatabaseForBot('replays');
                await db.collection('replies').insertOne({
                    trigger_word: tempReplyWord,
                    type: 'photo',
                    file_id: fileId,
                    created_at: new Date(),
                    created_by: ctx.from.id
                });
                await ctx.reply(`✅ تم حفظ الصورة كرد للكلمة "${tempReplyWord}" بنجاح.`);
                // Reset the state
                awaitingReplyResponse = false;
                tempReplyWord = '';
            } catch (error) {
                console.error('Error saving photo reply:', error);
                await ctx.reply('❌ حدث خطأ أثناء حفظ الصورة كرد. يرجى المحاولة مرة أخرى.');
            }
            return;
        } else if (ctx.message.photo) {
            // If a photo is received but we're not awaiting a reply, ignore it
            return;
        }

        // Handle animations (GIFs)
                // Handle animations (GIFs)
        if (ctx.message.animation && awaitingReplyResponse) {
            const fileId = ctx.message.animation.file_id;
            try {
                const db = await getDatabaseForBot('replays');
                await db.collection('replies').insertOne({
                    trigger_word: tempReplyWord,
                    type: 'animation',
                    file_id: fileId,
                    created_at: new Date(),
                    created_by: ctx.from.id
                });
                await ctx.reply(`✅ تم حفظ الـ GIF كرد للكلمة "${tempReplyWord}" بنجاح.`);
                // Reset the state
                awaitingReplyResponse = false;
                tempReplyWord = '';
            } catch (error) {
                console.error('Error saving GIF reply:', error);
                await ctx.reply('❌ حدث خطأ أثناء حفظ الـ GIF كرد. يرجى المحاولة مرة أخرى.');
            }
            return;
        } else if (ctx.message.animation) {
            // If a GIF is received but we're not awaiting a reply, ignore it
            return;
        }

        // Handle documents (like MP4 or other media)
                // Handle documents (like MP4 or other media)
        if (ctx.message.document && awaitingReplyResponse) {
            const fileId = ctx.message.document.file_id;
            try {
                const db = await getDatabaseForBot('replays');
                await db.collection('replies').insertOne({
                    trigger_word: tempReplyWord,
                    type: 'document',
                    file_id: fileId,
                    file_name: ctx.message.document.file_name,
                    mime_type: ctx.message.document.mime_type,
                    created_at: new Date(),
                    created_by: ctx.from.id
                });
                await ctx.reply(`✅ تم حفظ المستند كرد للكلمة "${tempReplyWord}" بنجاح.`);
                // Reset the state
                awaitingReplyResponse = false;
                tempReplyWord = '';
            } catch (error) {
                console.error('Error saving document reply:', error);
                await ctx.reply('❌ حدث خطأ أثناء حفظ المستند كرد. يرجى المحاولة مرة أخرى.');
            }
            return;
        } else if (ctx.message.document) {
            // If a document is received but we're not awaiting a reply, ignore it
            return;
        }

        // Handle stickers
                // Handle stickers
        if (ctx.message.sticker && awaitingReplyResponse) {
            const fileId = ctx.message.sticker.file_id;
            try {
                const db = await getDatabaseForBot('replays');
                await db.collection('replies').insertOne({
                    trigger_word: tempReplyWord,
                    type: 'sticker',
                    file_id: fileId,
                    created_at: new Date(),
                    created_by: ctx.from.id
                });
                await ctx.reply(`✅ تم حفظ الملصق كرد للكلمة "${tempReplyWord}" بنجاح.`);
                // Reset the state
                awaitingReplyResponse = false;
                tempReplyWord = '';
            } catch (error) {
                console.error('Error saving sticker reply:', error);
                await ctx.reply('❌ حدث خطأ أثناء حفظ الملصق كرد. يرجى المحاولة مرة أخرى.');
            }
            return;
        } else if (ctx.message.sticker) {
            // If a sticker is received but we're not awaiting a reply, ignore it
            return;
        }

               // Handle videos
        if (ctx.message.video && awaitingReplyResponse) {
            const fileId = ctx.message.video.file_id;
            try {
                const db = await getDatabaseForBot('replays');
                await db.collection('replies').insertOne({
                    trigger_word: tempReplyWord,
                    type: 'video',
                    file_id: fileId,
                    duration: ctx.message.video.duration,
                    width: ctx.message.video.width,
                    height: ctx.message.video.height,
                    mime_type: ctx.message.video.mime_type,
                    created_at: new Date(),
                    created_by: ctx.from.id
                });
                await ctx.reply(`✅ تم حفظ الفيديو كرد للكلمة "${tempReplyWord}" بنجاح.`);
                // Reset the state
                awaitingReplyResponse = false;
                tempReplyWord = '';
            } catch (error) {
                console.error('Error saving video reply:', error);
                await ctx.reply('❌ حدث خطأ أثناء حفظ الفيديو كرد. يرجى المحاولة مرة أخرى.');
            }
            return;
        } else if (ctx.message.video) {
            // If a video is received but we're not awaiting a reply, ignore it
            return;
        }

        // Handle text messages
        if (message.text) {
            await handleTextMessage(ctx);
            return;
        }

        // If we reach here, it's an unsupported message type
        await ctx.reply('');

    } catch (error) {
        console.error('Error in message handler:', error);
        await ctx.reply('');
    }

    await next();
});

async function handleTextMessage(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const userAnswer = ctx.message.text.trim().toLowerCase();

    // Check for active quiz
    if (activeQuizzes.has(chatId)) {
        await handleQuizAnswer(ctx, chatId, userId, userAnswer);
        return;
    }

    // Check for automatic replies
    // ✅ Only scan replies in private chats
if (ctx.chat.type === 'private') {
    const reply = await checkForAutomaticReply(ctx);
    if (reply) {
        await sendReply(ctx, reply);
        return;
    }
}

// Add this function to handle awaiting reply word
async function handleAwaitingReplyWord(ctx) {
    tempReplyWord = ctx.message.text.trim().toLowerCase();
    await ctx.reply(`تم استلام الكلمة: "${tempReplyWord}". الآن أرسل الرد الذي تريد إضافته لهذه الكلمة (نص، صورة، فيديو، ملصق، GIF، أو مستند):`);
    awaitingReplyWord = false;
    awaitingReplyResponse = true;
    return true;
}

// Add this function to handle awaiting text reply response
async function handleAwaitingReplyResponse(ctx) {
    const text = ctx.message.text.trim();
    try {
        const db = await getDatabaseForBot('replays');
        await db.collection('replies').insertOne({
            trigger_word: tempReplyWord,
            word: tempReplyWord,
            type: 'text',
            text: text,
            reply_text: text,
            created_at: new Date(),
            created_by: ctx.from.id,
            username: ctx.from.username
        });
        
        await ctx.reply(`✅ تم إضافة الرد النصي بنجاح!\nالكلمة: ${tempReplyWord}\nالرد: ${text}`);
        
        // Reset the state
        awaitingReplyResponse = false;
        tempReplyWord = '';
        
        return true;
    } catch (error) {
        console.error('Error saving text reply:', error);
        await ctx.reply('❌ حدث خطأ أثناء حفظ الرد. الرجاء المحاولة مرة أخرى.');
        
        // Reset the state
        awaitingReplyResponse = false;
        tempReplyWord = '';
        
        return true;
    }
}
    // Handle awaiting reply word
    if (awaitingReplyWord) {
        await handleAwaitingReplyWord(ctx);
        return;
    }

    // Handle awaiting delete reply word
    if (awaitingDeleteReplyWord) {
        await handleAwaitingDeleteReplyWord(ctx);
        return;
    }

    // Handle awaiting bot name
    if (awaitingBotName) {
        await handleAwaitingBotName(ctx);
        return;
    }

    // Handle awaiting reply response
    if (awaitingReplyResponse) {
        await handleAwaitingReplyResponse(ctx);
        return;
    }

    // If we reach here, it's an unhandled text message
    await ctx.reply('عذرًا، لم أفهم هذه الرسالة. هل يمكنك توضيح طلبك؟');
}
// Replace your existing video handler with this one
bot.on('video', async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        const isRestricted = videoRestrictionStatus.get(chatId);

        // Check if this is a reply to a trigger word
        if (await handleMediaReply(ctx, 'video')) {
            return; // Media was handled as a reply
        }

        // Continue with restriction check
        if (isRestricted) {
            const chatMember = await ctx.telegram.getChatMember(chatId, ctx.from.id);
            
            if (chatMember.status !== 'administrator' && chatMember.status !== 'creator') {
                await ctx.deleteMessage();
                await ctx.reply('❌ عذرًا، إرسال الفيديوهات غير مسموح حاليًا للأعضاء العاديين في هذه المجموعة.');
                return;
            }
        }

        // Continue with any existing video handling logic...
    } catch (error) {
        console.error('Error handling video message:', error);
    }
});

// Replace your existing photo handler with this one
// Clean up duplicate handlers and use the consolidated function
// Photo handler
// Consolidated media reply handler
async function handleMediaReply(ctx, mediaType) {
    try {
        const userId = ctx.from.id;
        
        // Check if we're awaiting a reply response
        if (!awaitingReplyResponse || !tempReplyWord) {
            return false; // Not handling this media as a reply
        }

        console.log(`Processing ${mediaType} as a reply for trigger word: ${tempReplyWord}`);
        
        let fileId, additionalData = {};
        
        // Extract the appropriate file ID based on media type
        switch (mediaType) {
            case 'photo':
                if (ctx.message.photo && ctx.message.photo.length > 0) {
                    fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
                } else {
                    console.error('Invalid photo message structure:', ctx.message);
                    return false;
                }
                break;
            case 'wcac':
                if (ctx.message.zxcxz) {
                    fileId = ctx.message.zxczxc.file_id;
                } else {
                    console.error('Invalid video message structure:', ctx.message);
                    return false;
                }
                break;
            case 'animation':
                if (ctx.message.animation) {
                    fileId = ctx.message.animation.file_id;
                } else {
                    console.error('Invalid animation message structure:', ctx.message);
                    return false;
                }
                break;
            case 'document':
                if (ctx.message.document) {
                    fileId = ctx.message.document.file_id;
                } else {
                    console.error('Invalid document message structure:', ctx.message);
                    return false;
                }
                break;
            case 'sticker':
                if (ctx.message.sticker) {
                    fileId = ctx.message.sticker.file_id;
                } else {
                    console.error('Invalid sticker message structure:', ctx.message);
                    return false;
                }
                break;
            default:
                console.error('Unsupported media type:', mediaType);
                return false;
        }
        
        try {
            // Save to database
            const db = await getDatabaseForBot('replays');
            await db.collection('replies').insertOne({
                trigger_word: tempReplyWord.trim().toLowerCase(),
                type: mediaType,
                file_id: fileId,
                created_at: new Date(),
                created_by: userId,
                username: ctx.from.username || ''
            });
            
            // Send confirmation
            await ctx.reply(`✅ تم إضافة ${getMediaTypeInArabic(mediaType)} كرد للكلمة "${tempReplyWord}" بنجاح.`);
            
            // Reset state
            awaitingReplyResponse = false;
            tempReplyWord = '';
            
            return true; // Successfully handled
        } catch (error) {
            console.error(`Error saving ${mediaType} reply:`, error);
            await ctx.reply(`❌ حدث خطأ أثناء حفظ ${getMediaTypeInArabic(mediaType)} كرد. يرجى المحاولة مرة أخرى.`);
            
            // Reset state even on error
            awaitingReplyResponse = false;
            tempReplyWord = '';
            
            return true; // We still handled it, even though there was an error
        }
    } catch (error) {
        console.error(`Error in handleMediaReply for ${mediaType}:`, error);
        return false; // Error occurred
    }
}

// Helper function to get Arabic names for media types
function getMediaTypeInArabic(mediaType) {
    const mediaTypes = {
        'photo': 'الصورة',
       
        'animation': 'الصورة المتحركة',
        'document': 'المستند',
        'sticker': 'الملصق'
    };
    
    return mediaTypes[mediaType] || mediaType;
}

// Clean up the duplicate handlers and use this single handler for each media type
// Update your photo handler
// Update your photo handler




// Animation/GIF handler
// Update the animation handler to also handle replies
bot.on('animation', async (ctx) => {
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

        // Handle animation reply if awaiting response
        if (awaitingReplyResponse && tempReplyWord) {
            const userId = ctx.from.id;
            const username = ctx.from.username || '';
            let fileId = ctx.message.animation.file_id;
            let replyText;

            if (ctx.chat.username) {
                replyText = `https://t.me/${ctx.chat.username}/${ctx.message.message_id}`;
            } else {
                replyText = fileId;
            }

            try {
                // Save to database
                const db = await getDatabaseForBot('replays');
                await db.collection('replies').insertOne({
                    user_id: userId,
                    username: username,
                    trigger_word: tempReplyWord.trim(),
                    reply_text: replyText,
                    media_type: 'animation',
                    file_id: fileId,
                    created_at: new Date()
                });
                
                await ctx.reply(`✅ تم إضافة الرد بنجاح!\nالكلمة: ${tempReplyWord}\nنوع الرد: صورة متحركة`);
                
                // Reset the awaiting state
                awaitingReplyResponse = false;
                tempReplyWord = '';
                
                return;
            } catch (error) {
                console.error('❌ خطأ أثناء حفظ الرد:', error);
                await ctx.reply('❌ حدث خطأ أثناء حفظ الرد.');
                
                // Reset the awaiting state
                awaitingReplyResponse = false;
                tempReplyWord = '';
                
                return;
            }
        }

        // Continue with any existing GIF handling logic...
    } catch (error) {
        console.error('Error handling GIF message:', error);
    }
});

// Document handler
bot.on('document', async (ctx) => {
    try {
        // Check if this is a reply to a trigger word
        if (await handleMediaReply(ctx, 'document')) {
            return; // Media was handled as a reply
        }
        
        // Additional document handling logic can go here
    } catch (error) {
        console.error('Error handling document message:', error);
    }
});

// Sticker handler
bot.on('sticker', async (ctx) => {
    const userId = ctx.from.id;
    
    // Check if we're awaiting a reply response
    if (awaitingReplyResponse && tempReplyWord) {
        try {
            const fileId = ctx.message.sticker.file_id;
            const botId = ctx.botInfo.id;
            
            // Get database connection
            const db = await getDatabaseForBot('replays');
            
            // Save the sticker reply to database
            await db.collection('replies').updateOne(
                { bot_id: botId, trigger_word: tempReplyWord },
                { 
                    $set: { 
                        bot_id: botId,
                        trigger_word: tempReplyWord, 
                        type: 'sticker',
                        content: fileId,
                        file_id: fileId,  // For backward compatibility
                        created_at: new Date(),
                        updated_at: new Date(),
                        created_by: userId,
                        username: ctx.from.username || ''
                    }
                },
                { upsert: true }
            );
            
            // Confirm to the user
            await ctx.reply(`✅ تم حفظ الملصق كرد للكلمة "${tempReplyWord}"`);
            
            // Reset the state
            awaitingReplyResponse = false;
            tempReplyWord = '';
        } catch (error) {
            console.error('Error saving sticker reply:', error);
            await ctx.reply('❌ حدث خطأ أثناء حفظ الملصق. الرجاء المحاولة مرة أخرى.');
            awaitingReplyResponse = false;
            tempReplyWord = '';
        }
    }
});


// Implement the other helper functions (handleQuizAnswer, checkForAutomaticReply, sendReply, etc.) 
// based on your existing code and requirements.

async function checkForAutomaticReply(ctx) {
    const text = ctx.message.text.trim().toLowerCase();
    const botId = ctx.botInfo.id;

    try {
        const db = await getDatabaseForBot('replays');
        
        // First, try to find a bot-specific reply
        let reply = await db.collection('replies').findOne({
            bot_id: botId,
            trigger_word: text
        });

        // If no bot-specific reply is found, try to find a global reply
        if (!reply) {
            reply = await db.collection('replies').findOne({
                trigger_word: text,
                bot_id: { $exists: false }
            });
        }

        return reply;
    } catch (error) {
        console.error('Error checking for automatic reply:', error);
        return null;
    }
}


    
    function showDevelopersMenu(ctx) {
        const message = ' يرجى استخدام الاوامر لرفع مطور اساسي او مطور ثاني , قائمة المطورين - اختر الإجراء المطلوب:';
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '• المطورين •', callback_data: 'list_developers' },
                    { text: '• حذف المطورين •', callback_data: 'delete_developers' }
                ],
                [
                    { text: '• الثانويين •', callback_data: 'list_secondary_developers' },
                    { text: '• حذف الثانويين •', callback_data: 'delete_secondary_developers' }
                ],
                
                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
            ]
        };
    
        ctx.editMessageText(message, { reply_markup: keyboard });
    }
    
    // Add a new function to show the bot name menu
    function showBotNameMenu(ctx) {
        const message = 'قسم اسم البوت - اختر الإجراء المطلوب:';
        const keyboard = {
            inline_keyboard: [
                [{ text: '• تغيير اسم البوت •', callback_data: 'change_bot_name' }],
                [{ text: '• عرض اسم البوت الحالي •', callback_data: 'show_current_bot_name' }],
                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
            ]
        };
    
        ctx.editMessageText(message, { reply_markup: keyboard });
    }

    bot.action('list_developers', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery('عرض قائمة المطورين');
            try {
                const db = await getDatabaseForBot('replays');
                const botId = ctx.botInfo.id; // Get the current bot's ID
                const developers = await db.collection('developers').find({ bot_id: botId }).toArray(); // Filter by bot_id
                
                if (developers.length > 0) {
                    const developersList = await Promise.all(developers.map(async (dev, index) => {
                        let displayName = dev.username ? `@${dev.username}` : 'بدون معرف';
                        try {
                            const user = await ctx.telegram.getChat(dev.user_id);
                            displayName = user.username ? `@${user.username}` : user.first_name || 'بدون اسم';
                        } catch (error) {
                            console.error(`Error fetching user info for ${dev.user_id}:`, error);
                        }
                        return `${index + 1}. ${displayName} ↫ معرف ↓\n${dev.user_id}`;
                    }));
                    await ctx.reply(`قائمة المطورين:\n\n${developersList.join('\n\n')}`);
                } else {
                    await ctx.reply('لا يوجد مطورين حاليًا.');
                }
            } catch (error) {
                console.error('Error fetching developers:', error);
                await ctx.reply('❌ حدث خطأ أثناء جلب قائمة المطورين. الرجاء المحاولة مرة أخرى لاحقًا.');
            }
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    bot.action('bot_subscription', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '📅 معلومات اشتراك البوت:\n\n' +
            '🔹 حالة البوت: مجاني\n' +
            '🔸 هذه النسخة ليس لها اشتراك\n\n' +
            'للحصول على النسخة الكاملة المدفوعة، يرجى مراجعة قناة السورس.\n' +
            'قناة سورس توباك\n' +
            '🔹 https://t.me/T0_B7',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔗 قناة السورس', url: 'https://t.me/T0_B7' }],
                        [{ text: '🔙 رجوع', callback_data: 'back_to_source_menu' }]
                    ]
                },
                disable_web_page_preview: true
            }
        );
    });
    
    bot.action('source_update', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '🔄 جاري تحديث البوت...\n\nيرجى الانتظار، سيتم إعلامك عند اكتمال التحديث.',
            {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_source_menu' }]]
                }
            }
        );
    });
    
    bot.action('main_bot_dev', async (ctx) => {
        try {
            const db = await getDatabaseForBot('replays');
            const mainDev = await db.collection('developers').findOne({});
            
            if (mainDev) {
                await ctx.answerCbQuery();
                await ctx.editMessageText(
                    '👨‍💻 معلومات مطور البوت الأساسي:\n\n' +
                    `🔹 الاسم: ${mainDev.username || 'غير محدد'}\n` +
                    `🔸 معرف تيليجرام: @${mainDev.username || 'غير محدد'}\n` +
                    `🔹 الرقم التعريفي: ${mainDev.user_id}\n\n` +
                    '🌟 شكراً لجهوده في تطوير وإدارة البوت!',
                    {
                        reply_markup: {
                            inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_source_menu' }]]
                        }
                    }
                );
            } else {
                await ctx.answerCbQuery('لم يتم العثور على معلومات المطور الأساسي', { show_alert: true });
            }
        } catch (error) {
            console.error('Error fetching main developer info:', error);
            await ctx.answerCbQuery('حدث خطأ أثناء جلب معلومات المطور الأساسي', { show_alert: true });
        }
    });
    
    bot.action('source_programmer', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageMedia(
            {
                type: 'photo',
                media: 'https://postimg.cc/WtX4j0ZG',
                caption: '🌟 مبرمج السورس\n\n' +
                         '👨‍💻 المطور: @Lorisiv\n\n' +
                         '🚀 مبرمج متميز ومبدع في عالم البرمجة وتطوير البوتات\n' +
                         '💡 صاحب أفكار مبتكرة وحلول تقنية متقدمة\n' +
                         '🔧 خبرة واسعة في تطوير وتحسين أداء البوتات\n\n' +
                         '📩 للتواصل والاستفسارات: @Lorisiv'
            },
            {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_source_menu' }]]
                }
            }
        );
    })
    
    bot.action('source_channel', async (ctx) => {
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            '📢 قناة السورس الرسمية\n\n' +
            '🔗 الرابط: https://t.me/ctrlsrc\n\n' +
            '🌟 انضم الآن للحصول على:\n' +
            '• آخر التحديثات والإصدارات الجديدة\n' +
            '• نصائح وحيل لاستخدام البوت بشكل أفضل\n' +
            '• الدعم الفني والإجابة على استفساراتكم\n' +
            '• مشاركة الأفكار والاقتراحات لتطوير السورس\n\n' +
            '🚀 كن جزءًا من مجتمعنا المتنامي!',
            {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_source_menu' }]]
                }
            }
        );
    });
    
    bot.action('back_to_source_menu', async (ctx) => {
        await ctx.answerCbQuery();
        try {
            await ctx.editMessageText('قائمة السورس - اختر الإجراء المطلوب:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '• تاريخ اشتراك البوت •', callback_data: 'bot_subscription' }],
                        [{ text: '• تحديث السورس •', callback_data: 'source_update' }],
                        [{ text: '• مطور البوت الأساسي •', callback_data: 'main_bot_dev' }],
                        [{ text: '• مبرمج السورس •', callback_data: 'source_programmer' }],
                        [{ text: '• قناة السورس •', callback_data: 'source_channel' }],
                        [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
                    ]
                }
            });
        } catch (error) {
            if (error.description === 'Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message') {
                // If the message content is the same, we can ignore this error
                console.log('Message content is the same, no need to update');
            } else if (error.description === 'Bad Request: there is no text in the message to edit') {
                // If there's no text to edit (e.g., coming from an image message), send a new message
                await ctx.deleteMessage();
                await ctx.reply('قائمة السورس - اختر الإجراء المطلوب:', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '• تاريخ اشتراك البوت •', callback_data: 'bot_subscription' }],
                            [{ text: '• تحديث السورس •', callback_data: 'source_update' }],
                            [{ text: '• مطور البوت الأساسي •', callback_data: 'main_bot_dev' }],
                            [{ text: '• مبرمج السورس •', callback_data: 'source_programmer' }],
                            [{ text: '• قناة السورس •', callback_data: 'source_channel' }],
                            [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
                        ]
                    }
                });
            } else {
                // For other errors, log them and inform the user
                console.error('Error in back_to_source_menu:', error);
                await ctx.reply('حدث خطأ أثناء العودة إلى قائمة السورس. الرجاء المحاولة مرة أخرى.');
            }
        }
    });
    bot.action('delete_developers', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery('حذف المطورين');
            try {
                const db = await getDatabaseForBot('replays');
                const botId = ctx.botInfo.id; // Get the current bot's ID
                const developers = await db.collection('developers').find({ bot_id: botId }).toArray(); // Filter by bot_id
                
                if (developers.length > 0) {
                    const keyboard = await Promise.all(developers.map(async (dev, index) => {
                        let displayName = dev.username ? `@${dev.username}` : 'بدون معرف';
                        try {
                            const user = await ctx.telegram.getChat(dev.user_id);
                            displayName = user.username ? `@${user.username}` : user.first_name || 'بدون اسم';
                        } catch (error) {
                            console.error(`Error fetching user info for ${dev.user_id}:`, error);
                        }
                        return [{
                            text: `${index + 1}. ${displayName}`,
                            callback_data: `confirm_delete_dev_${dev.user_id}`
                        }];
                    }));
    
                    keyboard.push([{ text: 'إلغاء', callback_data: 'cancel_delete_developers' }]);
    
                    await ctx.editMessageText('قائمة المطورين:', {
                        reply_markup: { inline_keyboard: keyboard }
                    });
                } else {
                    await ctx.editMessageText('لا يوجد مطورين لحذفهم.');
                }
            } catch (error) {
                console.error('Error fetching developers for deletion:', error);
                await ctx.editMessageText('❌ حدث خطأ أثناء جلب قائمة المطورين. الرجاء المحاولة مرة أخرى لاحقًا.');
            }
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
    bot.action(/^confirm_delete_dev_(\d+)$/, async (ctx) => {
        const devIdToDelete = ctx.match[1];
        if (await isDeveloper(ctx, ctx.from.id)) {
            try {
                const db = await getDatabaseForBot('replays');
                const developer = await db.collection('developers').findOne({ user_id: parseInt(devIdToDelete) });
                
                if (developer) {
                    const devUsername = developer.username ? `@${developer.username}` : `User ID: ${devIdToDelete}`;
                    await ctx.editMessageText(`هل أنت متأكد من حذف المطور: ${devUsername}؟`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '• حذف •', callback_data: `delete_dev_${devIdToDelete}` }],
                                [{ text: 'إلغاء', callback_data: 'cancel_delete_developers' }]
                            ]
                        }
                    });
                } else {
                    await ctx.answerCbQuery('لم يتم العثور على المطور', { show_alert: true });
                }
            } catch (error) {
                console.error('Error confirming developer deletion:', error);
                await ctx.answerCbQuery('❌ حدث خطأ أثناء تأكيد حذف المطور', { show_alert: true });
            }
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
    bot.action(/^delete_dev_(\d+)$/, async (ctx) => {
        const devIdToDelete = ctx.match[1];
        if (await isDeveloper(ctx, ctx.from.id)) {
            try {
                const db = await getDatabaseForBot('replays');
                const result = await db.collection('developers').deleteOne({ user_id: parseInt(devIdToDelete) });
                
                if (result.deletedCount > 0) {
                    await ctx.answerCbQuery('تم حذف المطور بنجاح');
                    await ctx.editMessageText('تم حذف المطور بنجاح. تم إزالة جميع صلاحياته ورتبته.', {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
                            ]
                        }
                    });
                } else {
                    await ctx.answerCbQuery('لم يتم العثور على المطور', { show_alert: true });
                    await ctx.editMessageText('لم يتم العثور على المطور المحدد.', {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
                            ]
                        }
                    });
                }
            } catch (error) {
                console.error('Error deleting developer:', error);
                await ctx.answerCbQuery('❌ حدث خطأ أثناء حذف المطور', { show_alert: true });
                await ctx.editMessageText('❌ حدث خطأ أثناء حذف المطور. الرجاء المحاولة مرة أخرى لاحقًا.', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
                        ]
                    }
                });
            }
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
    // Handle cancellation of developer deletion
    bot.action('cancel_delete_developers', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery('تم إلغاء عملية الحذف');
            showDevelopersMenu(ctx);
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });


    bot.action('overall_stats', async (ctx) => {
        await ctx.answerCbQuery();
        const stats = await getOverallStats();
        await ctx.editMessageText(
            `📊 الإحصائيات العامة:\n\n` +
            `👥 عدد المشتركين: ${stats.subscribers}\n` +
            `👥 عدد المجموعات: ${stats.groups}\n` +
            `📈 إجمالي المستخدمين: ${stats.total}`,
            { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_statistics' }]] } }
        );
    });
    
    bot.action('subscribers_stats', async (ctx) => {
        await ctx.answerCbQuery();
        const subscribersCount = await getSubscribersCount();
        await ctx.editMessageText(
            `👥 إحصائيات المشتركين:\n\n` +
            `عدد المشتركين النشطين: ${subscribersCount}`,
            { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_statistics' }]] } }
        );
    });
    
    bot.action('groups_stats', async (ctx) => {
        await ctx.answerCbQuery();
        const groupsCount = await getGroupsCount();
        await ctx.editMessageText(
            `👥 إحصائيات المجموعات:\n\n` +
            `عدد المجموعات النشطة: ${groupsCount}`,
            { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_statistics' }]] } }
        );
    });
    
    bot.action('backup_data', async (ctx) => {
        await ctx.answerCbQuery();
        const backupData = await generateBackup();
        await ctx.replyWithDocument(
            { source: Buffer.from(JSON.stringify(backupData)), filename: 'backup.json' },
            { caption: 'هذه نسخة احتياطية من بيانات البوت.' }
        );
    });
    
    bot.action('clean_subscribers', async (ctx) => {
        await ctx.answerCbQuery();
        const cleanedCount = await cleanSubscribers();
        await ctx.editMessageText(
            `🧹 تم تنظيف المشتركين:\n\n` +
            `تم إزالة ${cleanedCount} مشترك غير نشط.`,
            { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_statistics' }]] } }
        );
    });
    
    bot.action('clean_groups', async (ctx) => {
        await ctx.answerCbQuery();
        const cleanedCount = await cleanGroups();
        await ctx.editMessageText(
            `🧹 تم تنظيف المجموعات:\n\n` +
            `تم إزالة ${cleanedCount} مجموعة غير نشطة.`,
            { reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_statistics' }]] } }
        );
    });
    
    bot.action('back_to_statistics', async (ctx) => {
        await ctx.answerCbQuery();
        await showStatisticsMenu(ctx);
    });

    // Add handlers for the new bot name actions
    bot.action('dev_bot_name', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery();
            showBotNameMenu(ctx);
        }
    });
    
   // Add new action handlers for custom chat names
bot.action('set_custom_chat_name', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery();
        ctx.reply('الرجاء إرسال الاسم الخاص للبوت في هذه المحادثة:');
        // Set a flag to indicate we're waiting for the custom name
        ctx.session.awaitingCustomChatName = true;
    }
});

bot.action('remove_custom_chat_name', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery();
        const chatId = ctx.chat.id;
        try {
            const connection = await pool.getConnection();
            await connection.query('DELETE FROM bot_custom_names WHERE chat_id = ?', [chatId]);
            connection.release();
            ctx.reply('✅ تم إزالة اسم البوت الخاص لهذه المحادثة.');
        } catch (error) {
            console.error('Error removing custom bot name:', error);
            ctx.reply('❌ حدث خطأ أثناء إزالة اسم البوت الخاص.');
        }
    }
});
    
    bot.action('show_current_bot_name', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery();
            const currentBotName = ctx.botInfo.first_name; // Get the current bot name
            ctx.reply(`اسم البوت الحالي هو: ${currentBotName}`);
        }
    });
    
    bot.action('dev_statistics', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery();
            showStatisticsMenu(ctx);
        }
    });
    
    
    
    
    
    bot.action('dev_developers', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery();
            showDevelopersMenu(ctx);
        }
    }); 
    // Update the back_to_dev_panel action handler
bot.action('back_to_dev_panel', async (ctx) => {
    const userId = ctx.from.id;

    // Check if this is the first time the /start command is executed
    if (ownerId === null) {
        ownerId = userId; // Set the current user as the owner
        console.log(`Owner set to user ID: ${ownerId}`);
    }

    // Check if the user is a developer or the owner
    const isDev = await isDeveloper(ctx, userId);
    if (isDev || userId === ownerId) {
        await ctx.answerCbQuery();
        showDevPanel(ctx);
    } else {
        ctx.answerCbQuery('⛔ عذرًا، هذه اللوحة مخصصة للمطورين فقط.', { show_alert: true });
    }
});
    
  
    
   
    
bot.action('list_secondary_developers', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery('عرض قائمة المطورين الثانويين');
        try {
            const db = await getDatabaseForBot('replays');
            const botId = ctx.botInfo.id; // Get the current bot's ID
            const secondaryDevs = await db.collection('secondary_developers').find({ bot_id: botId }).toArray(); // Filter by bot_id

            if (secondaryDevs.length > 0) {
                const devsList = await Promise.all(secondaryDevs.map(async (dev, index) => {
                    let displayName = dev.username ? `@${dev.username}` : 'بدون معرف';
                    try {
                        const user = await ctx.telegram.getChat(dev.user_id);
                        displayName = user.username ? `@${user.username}` : user.first_name || 'بدون اسم';
                    } catch (error) {
                        console.error(`Error fetching user info for ${dev.user_id}:`, error);
                    }
                    return `${index + 1}. ${displayName} ↫ معرف ↓\n${dev.user_id}`;
                }));
                await ctx.reply(`قائمة المطورين الثانويين:\n\n${devsList.join('\n\n')}`);
            } else {
                await ctx.reply('لا يوجد مطورين ثانويين حاليًا.');
            }
        } catch (error) {
            console.error('Error fetching secondary developers:', error);
            await ctx.reply('❌ حدث خطأ أثناء جلب قائمة المطورين الثانويين. الرجاء المحاولة مرة أخرى لاحقًا.');
            
            // Additional error logging
            console.error('Error details:', error.message);
            console.error('Error stack:', error.stack);
        }
    } else {
        ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});

bot.action('delete_secondary_developers', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery('حذف المطورين الثانويين');
        try {
            const db = await getDatabaseForBot('replays');
            const botId = ctx.botInfo.id; // Get the current bot's ID
            const secondaryDevs = await db.collection('secondary_developers').find({ bot_id: botId }).toArray(); // Filter by bot_id

            if (secondaryDevs.length > 0) {
                const keyboard = await Promise.all(secondaryDevs.map(async (dev, index) => {
                    let displayName = dev.username ? `@${dev.username}` : 'بدون معرف';
                    try {
                        const user = await ctx.telegram.getChat(dev.user_id);
                        displayName = user.username ? `@${user.username}` : user.first_name || 'بدون اسم';
                    } catch (error) {
                        console.error(`Error fetching user info for ${dev.user_id}:`, error);
                    }
                    return [{
                        text: `${index + 1}. ${displayName}`,
                        callback_data: `confirm_delete_secondary_dev_${dev.user_id}`
                    }];
                }));

                keyboard.push([{ text: 'إلغاء', callback_data: 'cancel_delete_secondary_developers' }]);

                await ctx.editMessageText('قائمة المطورين الثانويين:', {
                    reply_markup: { inline_keyboard: keyboard }
                });
            } else {
                await ctx.editMessageText('لا يوجد مطورين ثانويين لحذفهم.');
            }
        } catch (error) {
            console.error('Error fetching secondary developers for deletion:', error);
            await ctx.editMessageText('❌ حدث خطأ أثناء جلب قائمة المطورين الثانويين. الرجاء المحاولة مرة أخرى لاحقًا.');
        }
    } else {
        ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});
    
    bot.action(/^confirm_delete_secondary_dev_(\d+)$/, async (ctx) => {
        const devIdToDelete = ctx.match[1];
        if (await isDeveloper(ctx, ctx.from.id)) {
            try {
                const db = await getDatabaseForBot('replays');
                const developer = await db.collection('secondary_developers').findOne({ user_id: parseInt(devIdToDelete) });
                
                if (developer) {
                    const devUsername = developer.username ? `@${developer.username}` : `User ID: ${devIdToDelete}`;
                    await ctx.editMessageText(`هل أنت متأكد من حذف المطور الثانوي: ${devUsername}؟`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '• حذف •', callback_data: `delete_secondary_dev_${devIdToDelete}` }],
                                [{ text: 'إلغاء', callback_data: 'cancel_delete_secondary_developers' }]
                            ]
                        }
                    });
                } else {
                    await ctx.answerCbQuery('لم يتم العثور على المطور الثانوي', { show_alert: true });
                }
            } catch (error) {
                console.error('Error confirming secondary developer deletion:', error);
                await ctx.answerCbQuery('حدث خطأ أثناء تأكيد الحذف', { show_alert: true });
            }
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
    bot.action(/^delete_secondary_dev_(\d+)$/, async (ctx) => {
        const devIdToDelete = ctx.match[1];
        if (await isDeveloper(ctx, ctx.from.id)) {
            try {
                const db = await getDatabaseForBot('replays');
                const result = await db.collection('secondary_developers').deleteOne({ user_id: parseInt(devIdToDelete) });
                
                if (result.deletedCount > 0) {
                    await ctx.editMessageText('تم حذف المطور الثانوي بنجاح.', {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
                            ]
                        }
                    });
                } else {
                    await ctx.editMessageText('لم يتم العثور على المطور الثانوي للحذف.', {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
                            ]
                        }
                    });
                }
            } catch (error) {
                console.error('Error deleting secondary developer:', error);
                await ctx.editMessageText('❌ حدث خطأ أثناء حذف المطور الثانوي. الرجاء المحاولة مرة أخرى لاحقًا.', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
                        ]
                    }
                });
            }
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
    bot.action('cancel_delete_secondary_developers', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.editMessageText('تم إلغاء عملية حذف المطورين الثانويين.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
                    ]
                }
            });
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
   
    
    bot.action('dev_source', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery();
            showSourceMenu(ctx);
        }
    });
   

    bot.action('dev_replies', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery();
            showRepliesMenu(ctx);
        }
    });
    
    
    
    

 
    
    
    bot.action('show_active_groups', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const isOwner = ctx.from.username === 'Lorisiv'; // Replace with the actual owner's username
            const isPrimaryDev = await isDeveloper(ctx, userId);
    
            if (!isOwner && !isPrimaryDev) {
                return ctx.answerCbQuery('❌ هذا الأمر مخصص للمالك والمطورين الأساسيين فقط.', { show_alert: true });
            }
    
            await ctx.answerCbQuery('جاري جلب معلومات المجموعات النشطة...');
            await ctx.editMessageText('جاري جلب المعلومات، يرجى الانتظار...');
    
            const db = await getDatabaseForBot('replays');
            const activeGroups = await db.collection('active_groups').find().toArray();
    
            let message = '📋 قائمة المجموعات النشطة:\n\n';
    
            for (const group of activeGroups) {
                try {
                    const chatInfo = await ctx.telegram.getChat(group.chat_id);
                    const memberCount = await ctx.telegram.getChatMembersCount(group.chat_id);
                    let inviteLink = 'غير متاح';
                    try {
                        inviteLink = await ctx.telegram.exportChatInviteLink(group.chat_id);
                    } catch (error) {
                        console.log(`Couldn't get invite link for group ${group.chat_id}: ${error.message}`);
                    }
    
                    message += `━━━━━━━━━━━━━━━\n`;
                    message += `📊 معلومات المجموعة:\n`;
                    message += `🏷 الاسم: ${chatInfo.title}\n`;
                    message += `🔗 الرابط: ${inviteLink}\n`;
                    message += `🆔 الايدي: \`${group.chat_id}\`\n`;
                    message += `👥 الأعضاء: ${memberCount}\n`;
                    message += `🔒 النوع: ${chatInfo.type === 'supergroup' ? (chatInfo.username ? 'عامة' : 'خاصة') : chatInfo.type}\n`;
                    message += `📅 آخر نشاط: ${new Date(group.last_activity).toLocaleString('ar-EG')}\n`;
                    message += `📅 تاريخ الإضافة: ${new Date(group.added_at).toLocaleString('ar-EG')}\n\n`;
    
                    // Information about who added the bot
                    if (group.added_by) {
                        const adderInfo = await ctx.telegram.getChat(group.added_by).catch(() => null);
                        if (adderInfo) {
                            message += `👤 معلومات الشخص الذي أضاف البوت:\n`;
                            message += `🏷 الاسم: ${adderInfo.first_name} ${adderInfo.last_name || ''}\n`;
                            message += `🆔 المعرف: @${adderInfo.username || 'N/A'}\n\n`;
                        }
                    }
    
                    // Group owner information
                    const groupOwner = await ctx.telegram.getChatAdministrators(group.chat_id)
                        .then(admins => admins.find(admin => admin.status === 'creator'))
                        .catch(() => null);
                    if (groupOwner) {
                        message += `👑 مالك المجموعة:\n`;
                        message += `🏷 الاسم: ${groupOwner.user.first_name} ${groupOwner.user.last_name || ''}\n`;
                        message += `🆔 المعرف: @${groupOwner.user.username || 'N/A'}\n\n`;
                    }
    
                    // Group admins information
                    const groupAdmins = await ctx.telegram.getChatAdministrators(group.chat_id);
                    if (groupAdmins.length > 0) {
                        message += `👮 المشرفون:\n`;
                        for (const admin of groupAdmins) {
                            if (admin.status !== 'creator') { // Skip the owner as we've already listed them
                                message += `🏷 ${admin.user.first_name} ${admin.user.last_name || ''} (@${admin.user.username || 'N/A'})\n`;
                            }
                        }
                        message += `\n`;
                    }
    
                } catch (error) {
                    console.error(`Error fetching details for group ${group.chat_id}:`, error);
                    message += `❌ تعذر جلب معلومات المجموعة ${group.chat_id}\n\n`;
                }
            }
    
            const replyMarkup = {
                inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]]
            };
    
            const maxLength = 4096;
            if (message.length > maxLength) {
                const chunks = message.match(new RegExp(`.{1,${maxLength}}`, 'g'));
                for (let i = 0; i < chunks.length; i++) {
                    if (i === 0) {
                        await ctx.editMessageText(chunks[i], {
                            parse_mode: 'Markdown',
                            disable_web_page_preview: true,
                            reply_markup: i === chunks.length - 1 ? replyMarkup : undefined
                        });
                    } else {
                        await ctx.reply(chunks[i], {
                            parse_mode: 'Markdown',
                            disable_web_page_preview: true,
                            reply_markup: i === chunks.length - 1 ? replyMarkup : undefined
                        });
                    }
                }
            } else {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    reply_markup: replyMarkup
                });
            }
        } catch (error) {
            console.error('Error showing active groups:', error);
            await ctx.answerCbQuery('حدث خطأ أثناء عرض المجموعات النشطة.');
            await ctx.editMessageText('❌ حدث خطأ أثناء عرض المجموعات النشطة. الرجاء المحاولة مرة أخرى لاحقًا.', {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]]
                }
            });
        }
    });


    // ✅ Back to the main menu in the same message
  // ✅ Back to the main menu in the same message
  bot.action('back', async (ctx) => {
    try {
        await ctx.answerCbQuery(); // Clear the loading state

        // Check if the user is an admin, owner, or secondary developer
        const isAdmin = await isAdminOrOwner(ctx, ctx.from.id);
        const isSecDev = await isSecondaryDeveloper(ctx, ctx.from.id);

        if (!isAdmin && !isSecDev) {
            return ctx.answerCbQuery('❌ هذا الأمر مخصص للمشرفين والمطورين الثانويين فقط.', { show_alert: true });
        }

        await ctx.editMessageCaption(
            '🤖 مرحبًا! أنا بوت الحماية والمسابقات ايضا. اختر خيارًا:',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'text handle', url: 'https://t.me/ctrlsrc' }],
                        [{ text: '📜 عرض الأوامر', callback_data: 'show_commands' }],
                        
                        [{ text: ' بوت المسابقات', callback_data: 'quiz_bot' }], // Added quiz bot option
                        [{ text: 'ctrlsrc', url: 'https://t.me/ctrlsrc' }]
                    ]
                }
            }
        );
    } catch (error) {
        console.error('Error in back action:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء العودة للقائمة الرئيسية.');
    }
});



// ✅ Show list of active groups
async function getActiveGroups(ctx) {
    try {
        const db = await getDatabaseForBot('replays');
        const activeGroups = await db.collection('active_groups').find().toArray();

        if (activeGroups.length === 0) {
            return '❌ لا توجد مجموعات نشطة.';
        }

        let message = '📋 قائمة المجموعات النشطة:\n\n';
        activeGroups.forEach((group, index) => {
            message += `${index + 1}. ${group.chat_title} (ID: ${group.chat_id})\n`;
        });

        return message;
    } catch (error) {
        console.error('Error fetching active groups:', error);
        return '❌ حدث خطأ أثناء جلب قائمة المجموعات النشطة.';
    }
}

async function getDetailedActiveGroups(ctx) {
    try {
        const db = await getDatabaseForBot('replays');
        const activeGroups = await db.collection('active_groups')
            .find()
            .sort({ last_activity: -1 })
            .toArray();

        if (activeGroups.length === 0) {
            return '❌ لا توجد مجموعات نشطة.';
        }

        let message = '📋 قائمة المجموعات النشطة:\n\n';
        for (const group of activeGroups) {
            try {
                const chatInfo = await ctx.telegram.getChat(group.chat_id);
                const memberCount = await ctx.telegram.getChatMembersCount(group.chat_id);
                let inviteLink = 'غير متاح';
                try {
                    inviteLink = await ctx.telegram.exportChatInviteLink(group.chat_id);
                } catch (error) {
                    console.log(`Couldn't get invite link for group ${group.chat_id}: ${error.message}`);
                }

                message += `━━━━━━━━━━━━━━━\n`;
                message += `📊 معلومات المجموعة:\n`;
                message += `🏷 الاسم: ${chatInfo.title}\n`;
                message += `🔗 الرابط: ${inviteLink}\n`;
                message += `🆔 الايدي: \`${group.chat_id}\`\n`;
                message += `👥 الأعضاء: ${memberCount}\n`;
                message += `🔒 النوع: ${chatInfo.type === 'supergroup' ? (chatInfo.username ? 'عامة' : 'خاصة') : chatInfo.type}\n`;
                message += `📅 آخر نشاط: ${new Date(group.last_activity).toLocaleString('ar-EG')}\n`;
                message += `📅 تاريخ الإضافة: ${new Date(group.added_at).toLocaleString('ar-EG')}\n\n`;

                // Information about who added the bot
                if (group.added_by) {
                    const adderInfo = await ctx.telegram.getChat(group.added_by).catch(() => null);
                    if (adderInfo) {
                        message += `👤 معلومات الشخص الذي أضاف البوت:\n`;
                        message += `🏷 الاسم: ${adderInfo.first_name} ${adderInfo.last_name || ''}\n`;
                        message += `🆔 المعرف: @${adderInfo.username || 'N/A'}\n\n`;
                    }
                }

                // Group owner information
                const groupOwner = await ctx.telegram.getChatOwner(group.chat_id).catch(() => null);
                if (groupOwner) {
                    message += `👑 مالك المجموعة:\n`;
                    message += `🏷 الاسم: ${groupOwner.user.first_name} ${groupOwner.user.last_name || ''}\n`;
                    message += `🆔 المعرف: @${groupOwner.user.username || 'N/A'}\n\n`;
                }

                // Group admins information
                const groupAdmins = await ctx.telegram.getChatAdministrators(group.chat_id);
                if (groupAdmins.length > 0) {
                    message += `👮 المشرفون:\n`;
                    for (const admin of groupAdmins) {
                        if (admin.status !== 'creator') { // Skip the owner as we've already listed them
                            message += `🏷 ${admin.user.first_name} ${admin.user.last_name || ''} (@${admin.user.username || 'N/A'})\n`;
                        }
                    }
                    message += `\n`;
                }

                message += `\n`;
            } catch (error) {
                console.error(`Error fetching details for group ${group.chat_id}:`, error);
                message += `❌ تعذر جلب معلومات المجموعة ${group.chat_id}\n\n`;
            }
        }

        return message;
    } catch (error) {
        console.error('Error fetching detailed active groups:', error);
        return '❌ حدث خطأ أثناء جلب معلومات المجموعات النشطة.';
    }
}
async function updateGroupInfo(ctx) {
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        try {
            const db = await getDatabaseForBot('replays');
            const chatId = ctx.chat.id;
            const chatTitle = ctx.chat.title;
            const memberCount = await ctx.telegram.getChatMembersCount(chatId);
            let inviteLink = null;

            try {
                inviteLink = await ctx.telegram.exportChatInviteLink(chatId);
            } catch (error) {
                console.log(`Couldn't get invite link for group ${chatId}: ${error.message}`);
            }

            await db.collection('active_groups').updateOne(
                { chat_id: chatId },
                {
                    $set: {
                        chat_title: chatTitle,
                        member_count: memberCount,
                        last_activity: new Date(),
                        invite_link: inviteLink
                    },
                    $setOnInsert: {
                        added_at: new Date(),
                        added_by: ctx.from.id
                    }
                },
                { upsert: true }
            );

            console.log(`Updated group info for ${chatTitle} (${chatId})`);
        } catch (error) {
            console.error('Error updating group info:', error);
        }
    }
}
// Add this function to get the custom bot name for a chat

async function getCustomBotName(chatId) {
    try {
        const db = await getDatabaseForBot('replays');
        const customName = await db.collection('bot_names').findOne({ chat_id: chatId });
        
        if (customName) {
            return customName.name;
        }
        return null;
    } catch (error) {
        console.error('Error retrieving custom bot name:', error);
        return null;
    }
}   
//check this later maybe its not saving the replays because of this 
async function sendReply(ctx, reply) {
    try {
        if (reply.type === 'text') {
            await ctx.reply(reply.text || reply.reply_text, { reply_to_message_id: ctx.message.message_id });
        } else if (reply.type === 'text_cycle') {
            const texts = reply.reply_texts;
            if (texts && texts.length > 0) {
                const currentIndex = reply.cycle_index || 0;
                const textToSend = texts[currentIndex];

                console.log(`Current index: ${currentIndex}, Text to send: ${textToSend}`);

                await ctx.reply(textToSend, { reply_to_message_id: ctx.message.message_id });

                const newIndex = (currentIndex + 1) % texts.length;
                console.log(`New index: ${newIndex}`);

                const db = await getDatabaseForBot('replays');
                await db.collection('replies').updateOne(
                    { _id: reply._id },
                    { $set: { cycle_index: newIndex } }
                );
            } else {
                console.error('No valid texts found in reply_texts for text_cycle type.');
                await ctx.reply('❌ لا توجد نصوص صالحة للرد.', { reply_to_message_id: ctx.message.message_id });
            }
        } else if (reply.type === 'media') {
            switch (reply.media_type) {
                case 'photo':
                    await ctx.replyWithPhoto(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                    break;
                case 'blank':
                    await ctx.replyWithVideo(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                    break;
                case 'animation':
                    await ctx.replyWithAnimation(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                    break;
                case 'document':
                    await ctx.replyWithDocument(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                    break;
                case 'sticker':
                    await ctx.replyWithSticker(reply.file_id, { reply_to_message_id: ctx.message.message_id });
                    break;
                default:
                    console.error('Unknown media type:', reply.media_type);
                    await ctx.reply('❌ نوع وسائط غير مدعوم.', { reply_to_message_id: ctx.message.message_id });
            }
        } else {
            console.error('Unknown reply type:', reply.type);
            await ctx.reply('❌ نوع الرد غير معروف.', { reply_to_message_id: ctx.message.message_id });
        }
    } catch (error) {
        console.error('Error sending reply:', error);
        await ctx.reply('❌ حدث خطأ أثناء إرسال الرد.', { reply_to_message_id: ctx.message.message_id });
    }
}


bot.action('check_subscription', forceCheckSubscription);






// Add this closing brace to close the setupActions function
}

module.exports = { setupActions,
    activeQuizzes,endQuiz , ensureDatabaseInitialized,configureQuiz,startAddingCustomQuestions,chatStates,forceCheckSubscription,confirmSubscription, };
