//freaky version want to be rebilous freaky deak 
let awaitingReplyWord = false;
let awaitingReplyResponse = false;  // Add this line
let tempReplyWord = '';
// Add this at the top of your file with other imports
const { Scenes } = require('telegraf');
// Make sure this is at the top of your file
const activeGroups = new Map();
// Add these variables at the top of your file
let awaitingBotName = false;
// Add these variables at the top of your file
let awaitingDeleteReplyWord = false;
const cloudinary = require('cloudinary').v2;
const { getLeaderboard,getUserStatistics, getDifficultyLevels, getQuestionsForDifficulty  } = require('./commands');
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
const { isDeveloper } = require('./middlewares');
const { addQuizQuestion } = require('./database');
// Add this at the top of your file
const database = require('./database');
const { Markup } = require('telegraf');
// Quiz state constants
const QUIZ_STATE = {
    INACTIVE: 0,
    SELECTING_DIFFICULTY: 1,
    SELECTING_QUESTION_COUNT: 2,
    ACTIVE: 3
};


const {isAdminOrOwner} = require('./commands');    
    

    // Add this function to handle quiz answers
// Add this after the showQuizMenu function
async function handleQuizAnswer(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const userAnswer = ctx.message.text.trim().toLowerCase();
    
    // Check if there's an active quiz in this chat
    if (activeQuizzes.has(chatId)) {
        const quiz = activeQuizzes.get(chatId);
        
        // Check if the quiz is in the active state
        if (quiz.state === QUIZ_STATE.ACTIVE) {
            const currentQuestion = quiz.questions[quiz.currentQuestionIndex];
            const correctAnswer = currentQuestion.answer.toLowerCase();
            
            // Check if the user has already attempted this question
            if (!quiz.attempts.has(quiz.currentQuestionIndex)) {
                quiz.attempts.set(quiz.currentQuestionIndex, new Set());
            }
            
            const questionAttempts = quiz.attempts.get(quiz.currentQuestionIndex);
            
            // If user already attempted, ignore
            if (questionAttempts.has(userId)) {
                return true; // Indicate that this was a quiz answer
            }
            
            // Mark this user as having attempted this question
            questionAttempts.add(userId);
            
            // Check if the answer is correct
            if (userAnswer === correctAnswer) {
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
            } else {
                // Wrong answer
                await ctx.reply('❌ إجابة خاطئة. حاول مرة أخرى!', {
                    reply_to_message_id: ctx.message.message_id
                });
            }
            
            return true; // Indicate that this was a quiz answer
        }
    }
    
    return false; // Indicate that this was not a quiz answer
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
                    await database.saveQuizScore(userId, userName, firstName, score);
                    
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
        { question: "ما هو 2 + 2", answer: "1" },
        { question: "ما هو لون السماء؟", answer: "1" },
        { question: "كم عدد حروف كلمة 'بيت'؟", answer: "1" },
    ],
    medium: [
        { question: "ما هي عاصمة أندونيسيا؟", answer: "2" },
        { question: "ما هو الغاز الذي تمتصه النباتات من الجو؟", answer: "2" },
    ],
    hard: [
        { question: "ما هو الرمز الكيميائي للذهب؟", answer: "Au" },
        { question: "من هو مؤسس علم الجبر؟", answer: "الخوارزمي" },
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




// ... (rest of the existing imports and variables)
function setupActions(bot, session, Scenes) {
    // Add this function to handle quiz configuration

    const { setupCommands, showMainMenu, showQuizMenu } = require('./commands');
    
    async function showDevPanel(ctx) {
        // Check if the message is from a private chat (DM)
        if (ctx.chat.type !== 'private') {
            await ctx.reply('⚠️ يمكن استخدام لوحة التحكم في الرسائل الخاصة فقط.');
            return;
        }
    
        // Check if the user is a developer
        if (!(await isDeveloper(ctx, ctx.from.id))) {
            await ctx.reply('⛔ عذرًا، هذه اللوحة مخصصة للمطورين فقط.');
            return;
        }
    
        const message = 'مرحبا عزيزي المطور الاساسي\nإليك ازرار التحكم بالاقسام\nتستطيع التحكم بجميع الاقسام فقط اضغط على القسم الذي تريده';
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
                [{ text: 'إلغاء', callback_data: 'dev_cancel' }]
            ]
        };
        loadActiveGroupsFromDatabase();
        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, { reply_markup: keyboard });
        } else {
            await ctx.reply(message, { reply_markup: keyboard });
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
            // Check if the message has a photo
            if (ctx.callbackQuery.message.photo) {
                // Edit the caption of the photo message
                await ctx.editMessageCaption(message, { reply_markup: keyboard });
            } else {
                // Edit the text message
                await ctx.editMessageText(message, { reply_markup: keyboard });
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
            const db = await ensureDatabaseInitialized();
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
            const db = await ensureDatabaseInitialized();
            // In MongoDB, collections are created automatically when documents are inserted
            console.log('secondary_developers collection ready to use');
        } catch (error) {
            console.error('Error ensuring secondary_developers collection:', error);
        }
    }
 
    // Create a separate function to handle the broadcast logic
    async function handleBroadcast(ctx) {
        if (await isDeveloper(ctx, ctx.from.id)) {
            let message;
            if (ctx.match) {
                message = ctx.match[1];
            } else {
                message = ctx.message.text.split(' ').slice(1).join(' ');
            }
    
            if (!message) {
                return ctx.reply('الرجاء إدخال رسالة للإذاعة بعد الأمر. مثال:\nاذاعة مرحبا بالجميع!');
            }
    
            console.log(`Broadcasting message: "${message}"`);
            console.log(`Number of active groups: ${activeGroups.size}`);
            console.log('Active groups:', Array.from(activeGroups.entries()));
    
            if (activeGroups.size === 0) {
                return ctx.reply('لا توجد مجموعات نشطة لإرسال الإذاعة إليها.');
            }
    
            let successCount = 0;
            let failCount = 0;
    
            for (const [groupId, groupInfo] of activeGroups) {
                try {
                    console.log(`Attempting to send to group: ${groupInfo.title} (${groupId})`);
                    await ctx.telegram.sendMessage(groupId, message);
                    console.log(`Successfully sent to group: ${groupInfo.title} (${groupId})`);
                    successCount++;
                } catch (error) {
                    console.error(`Failed to send broadcast to group ${groupId} (${groupInfo.title}):`, error);
                    failCount++;
                }
            }
    
            ctx.reply(`تم إرسال الإذاعة!\n\nتم الإرسال إلى: ${successCount} مجموعة\nفشل الإرسال إلى: ${failCount} مجموعة`);
        } else {
            ctx.reply('عذراً، هذا الأمر للمطورين فقط');
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
            const db = await ensureDatabaseInitialized();
            // In MongoDB, collections are created automatically when documents are inserted
            console.log('bot_custom_names collection ready to use');
        } catch (error) {
            console.error('Error ensuring bot_custom_names collection:', error);
        }
    }
    // Add this function at the beginning of your file or before it's used
    async function fetchRepliesFromDatabase() {
        try {
            const db = await ensureDatabaseInitialized();
            return await db.collection('replies').find().toArray();
        } catch (error) {
            console.error('Error fetching replies:', error);
            return [];
        }
    }
// Add this function to create the groups table
async function createGroupsTable() {
    try {
        const db = await ensureDatabaseInitialized();
        // In MongoDB, collections are created automatically
        console.log('groups collection ready to use');
    } catch (error) {
        console.error('Error ensuring groups collection:', error);
    }
}
// Update this function to use MongoDB
async function markGroupAsInactive(groupId) {
    try {
        const db = await ensureDatabaseInitialized();
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
 // Update this function to use MongoDB
 async function getOverallStats() {
    try {
        const db = await ensureDatabaseInitialized();
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
        const db = await ensureDatabaseInitialized();
        return await db.collection('users').countDocuments({ is_active: true });
    } catch (error) {
        console.error('Error getting subscribers count:', error);
        return 0;
    }
}

async function getGroupsCount() {
    try {
        const db = await ensureDatabaseInitialized();
        return await db.collection('groups').countDocuments({ is_active: true });
    } catch (error) {
        console.error('Error getting groups count:', error);
        return 0;
    }
}

async function generateBackup() {
    try {
        const db = await ensureDatabaseInitialized();
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
        const db = await ensureDatabaseInitialized();
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

async function cleanGroups() {
    try {
        const db = await ensureDatabaseInitialized();
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
        const db = await ensureDatabaseInitialized();
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
    // Update the updateActiveGroups function
    async function updateActiveGroups(groupId, groupTitle) {
        try {
            await database.addGroup(groupId, groupTitle);
            
            // Update the in-memory map if you're using one
            if (typeof activeGroups !== 'undefined') {
                activeGroups.set(groupId, { title: groupTitle, id: groupId });
            }
        } catch (error) {
            console.error('Error updating active group:', error);
        }
    }
    async function loadActiveGroupsFromDatabase() {
        try {
            const db = await ensureDatabaseInitialized();
            
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
    function showRepliesMenu(ctx) {
        const message = 'قسم الردود - اختر الإجراء المطلوب:';
        const keyboard = {
            inline_keyboard: [
                [{ text: '• اضف رد عام •', callback_data: 'add_general_reply' }],
                [{ text: '• حذف رد عام •', callback_data: 'delete_general_reply' }],
                [{ text: '• عرض الردود العامة •', callback_data: 'list_general_replies' }],
                [{ text: '❌ حذف جميع الردود', callback_data: 'delete_all_replies' }],
                [{ text: '🔙 رجوع', callback_data: 'back_to_dev_panel' }]
            ]
        };
    
        ctx.editMessageText(message, { reply_markup: keyboard });
    }
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
                caption: '🤖 مرحبًا! أنا بوت الحماية. اختر خيارًا:'
            },
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📜 عرض الأوامر', callback_data: 'show_commands' }],
                        [{ text: '📂 عرض المجموعات النشطة', callback_data: 'show_active_groups' }],
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
bot.action('quiz_bot', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await showQuizMenu(ctx);
    } catch (error) {
        console.error('Error handling quiz_bot action:', error);
        await ctx.reply('❌ حدث خطأ أثناء فتح قائمة المسابقات.');
    }
});

       // Show commands
bot.action('show_commands', adminOnly((ctx) => {
    ctx.editMessageCaption(
        '📜 قائمة الأوامر:\n' +
        '⌁︙/معرفي ↫ معرفك\n' +
        '⌁︙/ترقية مميز ↫ مميز\n' +
        '⌁︙/ترقية ادمن ↫ ادمن\n' +
        '⌁︙/ترقية مدير ↫ مدير\n' +
        '⌁︙/ترقية منشئ ↫ منشئ\n' +
        '⌁︙/تنزيل ↫ إزالة رتبة مستخدم\n' +
        '⌁︙/ترقية منشئ اساسي ↫ منشئ اساسي\n' +
        '⌁︙/ترقية مطور ↫ مطور\n' +
        '⌁︙/ترقية مطور ثانوي ↫ مطور ثانوي\n' +
        '⌁︙/ازالة رتبة ↫ تنزيل رتبة\n' +
        '⌁︙/رابط المجموعة ↫ رابط المجموعة\n' +
        '⌁︙/نداء الجميع ↫ نداء الكل\n' +
        '⌁︙/كتم ↫ كتم مستخدم\n' +
        '⌁︙/الغاء كتم ↫ إلغاء كتم مستخدم\n' +
        '⌁︙/مسح ↫ حذف آخر رسالة\n' +
        '⌁︙/تثبيت ↫ تثبيت رسالة\n' +
        '⌁︙/نكتة ↫ إرسال نكتة\n' +
        '⌁︙/طرد ↫ طرد مستخدم\n' +
        '⌁︙/مسح الصور ↫ حذف آخر الصور المرسلة\n' +
        '⌁︙/منع_الصور ↫ منع إرسال الصور\n' +
        '⌁︙/سماح_الصور ↫ السماح بإرسال الصور\n' +
        '⌁︙/ازالة_الروابط ↫ حذف الروابط في المجموعة\n' +
        '⌁︙/فتح روابط ↫ السماح بمشاركة الروابط\n' +
        '⌁︙/غلق روابط ↫ منع مشاركة الروابط\n' +
        '⌁︙/منع فيديو ↫ منع إرسال الفيديوهات\n' +
        '⌁︙/تفعيل فيديو ↫ السماح بإرسال الفيديوهات\n' +
        '⌁︙/منع متحركة ↫ منع إرسال الصور المتحركة\n' +
        '⌁︙/تفعيل متحركة ↫ السماح بإرسال الصور المتحركة\n',
        {
            reply_markup: {
                inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back' }]]
            }
        }
    );
}));
const { getLeaderboard } = require('./database');

// ... other code ...

bot.action('show_leaderboard', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const leaderboardData = await database.getLeaderboard();
        
        let leaderboardText = "🏆 قائمة المتصدرين:\n\n";
        
        if (leaderboardData.length > 0) {
            // Add medal emojis for top 3
            const medals = ['🥇', '🥈', '🥉'];
            
            leaderboardData.forEach((entry, index) => {
                const name = entry.firstName || entry.username || 'مستخدم مجهول';
                let prefix = `${index + 1}.`;
                
                // Add medal for top 3
                if (index < 3) {
                    prefix = medals[index];
                }
                
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

        if (ctx.callbackQuery.message.photo) {
            // If the original message was a photo, edit the caption
            await ctx.editMessageCaption(leaderboardText, {
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            });
        } else {
            // If it was a text message, edit the text
            await ctx.editMessageText(leaderboardText, {
                parse_mode: 'Markdown',
                reply_markup: replyMarkup
            });
        }
    } catch (error) {
        console.error('Error showing leaderboard:', error);
        await ctx.answerCbQuery('حدث خطأ أثناء عرض قائمة المتصدرين.');
        await ctx.reply('عذرًا، حدث خطأ أثناء محاولة عرض قائمة المتصدرين. الرجاء المحاولة مرة أخرى لاحقًا.');
    }
});

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

    // Modify the delete_general_reply action handler
bot.action('delete_general_reply', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery('حذف رد عام');
        ctx.reply('أرسل الكلمة التي تريد حذف الرد لها:');
        awaitingDeleteReplyWord = true;
    } else {
        ctx.answerCbQuery('عذراً، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});
bot.action('delete_all_replies', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        await ctx.answerCbQuery();
        const confirmKeyboard = {
            inline_keyboard: [
                [{ text: '✅ نعم، احذف جميع الردود', callback_data: 'confirm_delete_all_replies' }],
                [{ text: '❌ لا، إلغاء العملية', callback_data: 'cancel_delete_all_replies' }]
            ]
        };
        ctx.editMessageText('⚠️ تحذير: هل أنت متأكد أنك تريد حذف جميع الردود؟ هذا الإجراء لا يمكن التراجع عنه.', { reply_markup: confirmKeyboard });
    } else {
        ctx.answerCbQuery('عذراً، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});

bot.action('confirm_delete_all_replies', async (ctx) => {
    if (await isDeveloper(ctx, ctx.from.id)) {
        try {
            const db = await ensureDatabaseInitialized();
            await db.collection('replies').deleteMany({});
            ctx.answerCbQuery('تم حذف جميع الردود بنجاح', { show_alert: true });
            showRepliesMenu(ctx);
        } catch (error) {
            console.error('Error deleting all replies:', error);
            ctx.answerCbQuery('حدث خطأ أثناء حذف الردود', { show_alert: true });
        }
    } else {
        ctx.answerCbQuery('عذراً، هذا الأمر للمطورين فقط', { show_alert: true });
    }
});

bot.action('cancel_delete_all_replies', async (ctx) => {
    await ctx.answerCbQuery('تم إلغاء عملية الحذف');
    showRepliesMenu(ctx);
});
    bot.action('dev_broadcast', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery();
            ctx.reply('لإرسال رسالة إذاعة، استخدم الأمر التالي:\n/اذاعة [الرسالة]\n\nمثال:\n/اذاعة مرحبا بالجميع!');
        } else {
            ctx.answerCbQuery('عذراً، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    bot.action('list_general_replies', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery('عرض الردود العامة');
            const replies = await fetchRepliesFromDatabase();
            let replyList = 'الردود العامة:\n\n';
            if (replies.length > 0) {
                replies.forEach((reply, index) => {
                    replyList += `${index + 1}. الكلمة: ${reply.trigger_word}\nالرد: ${reply.reply_text}\n\n`;
                });
            } else {
                replyList += 'لا توجد ردود عامة حالياً.';
            }
            ctx.reply(replyList);
        } else {
            ctx.answerCbQuery('عذراً، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
    // Add this callback handler for the start_quiz button
    bot.action('start_quiz', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const chatId = ctx.chat.id;
            
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
    
            const newText = 'اختر مستوى صعوبة المسابقة:';
    
            // Add question count options to the keyboard
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
    
            const combinedText = `${newText}\n\n🔢 اختر عدد الأسئلة للمسابقة:`;
    
            if (ctx.callbackQuery.message.photo) {
                // If the current message is a photo, edit the caption
                await ctx.editMessageCaption(combinedText, { reply_markup: combinedKeyboard });
            } else {
                // If it's a text message, edit the text
                await ctx.editMessageText(combinedText, { reply_markup: combinedKeyboard });
            }
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
            ctx.reply('الرجاء إرسال الاسم الجديد للبوت:');
            awaitingBotName = true;
        }
    });
    
    bot.action('show_current_bot_name', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery();
            const currentBotName = ctx.botInfo.first_name;
            ctx.reply(`اسم البوت الحالي هو: ${currentBotName}`);
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
    // Update the broadcast command handler
    bot.command('اذاعة', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            const message = ctx.message.text.split(' ').slice(1).join(' ');
            if (!message) {
                return ctx.reply('الرجاء إدخال رسالة للإذاعة بعد الأمر. مثال:\n/اذاعة مرحبا بالجميع!');
            }
    
            console.log(`Broadcasting message: "${message}"`);
            console.log(`Number of active groups: ${activeGroups.size}`);
    
            let successCount = 0;
            let failCount = 0;
    
            for (const [groupId, groupInfo] of activeGroups) {
                try {
                    await ctx.telegram.sendMessage(groupId, message);
                    console.log(`Successfully sent to group: ${groupInfo.title} (${groupId})`);
                    successCount++;
                } catch (error) {
                    console.error(`Failed to send broadcast to group ${groupId} (${groupInfo.title}):`, error);
                    failCount++;
                }
            }
    
            ctx.reply(`تم إرسال الإذاعة بنجاح!\n\nتم الإرسال إلى: ${successCount} مجموعة\nفشل الإرسال إلى: ${failCount} مجموعة`);
        } else {
            ctx.reply('عذراً، هذا الأمر للمطورين فقط');
        }
    });

 // Existing broadcast command
 bot.command('اذاعة', handleBroadcast);

 // Add this new hears handler
 bot.hears(/^اذاعة (.+)/, handleBroadcast);


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


// Register the text handler
    // For the text handler that's causing errors, update it to:
    bot.on('text', async (ctx) => {
    console.log('Received message:', ctx.message.text);
    
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const userAnswer = ctx.message.text.trim().toLowerCase();
    
    if (chatStates.has(ctx.chat.id)) {
        await handleCustomQuestionInput(ctx);
        return;
    }

    // Check if there's an active quiz in this chat
    if (activeQuizzes.has(chatId)) {
        const quiz = activeQuizzes.get(chatId);
        console.log('Quiz state:', quiz.state);
        console.log('Current question index:', quiz.currentQuestionIndex);
        
        // Check if the quiz is in the active state
        if (quiz.state === QUIZ_STATE.ACTIVE) {
            const currentQuestion = quiz.questions[quiz.currentQuestionIndex];
            const correctAnswer = currentQuestion.answer.toLowerCase();
            
            // Initialize attempts tracking for this question if it doesn't exist
            if (!quiz.attempts.has(quiz.currentQuestionIndex)) {
                quiz.attempts.set(quiz.currentQuestionIndex, new Set());
            }
            
            const questionAttempts = quiz.attempts.get(quiz.currentQuestionIndex);
            
            // Check if the user has already answered correctly
            if (questionAttempts.has(userId)) {
                // User already answered correctly, ignore silently
                return;
            }
            
            // Check if the answer is correct
            if (userAnswer === correctAnswer) {
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
            } else {
                // Wrong answer - allow the user to try again
                await ctx.reply('❌ إجابة خاطئة. حاول مرة أخرى!', {
                    reply_to_message_id: ctx.message.message_id
                });
            }
            return; // Exit the handler after processing quiz answer
        }
    }
    
    // Handle other text messages (non-quiz related)
    
    // Check for automatic replies
    try {
        const db = await ensureDatabaseInitialized();
        const reply = await db.collection('replies').findOne({ word: ctx.message.text.trim() });
        
        if (reply) {
            if (reply.type === 'text' && reply.text) {
                await ctx.reply(reply.text);
            } else if (reply.media_url) {
                switch (reply.type) {
                    case 'photo':
                        await ctx.replyWithPhoto(reply.media_url);
                        break;
                    case 'video':
                        await ctx.replyWithVideo(reply.media_url);
                        break;
                    case 'animation':
                        await ctx.replyWithAnimation(reply.media_url);
                        break;
                    case 'sticker':
                        // For stickers from URL, we need to send as photo
                        await ctx.replyWithPhoto(reply.media_url);
                        break;
                    default:
                        await ctx.reply(reply.text || 'رد غير معروف');
                }
            }
            return;
        }
    } catch (error) {
        console.error('Error checking for automatic replies:', error);
    }
    
    // Handle awaiting reply word
    if (awaitingReplyWord) {
        tempReplyWord = ctx.message.text;
        await ctx.reply(`تم استلام الكلمة: "${tempReplyWord}". الآن أرسل الرد الذي تريد إضافته لهذه الكلمة:`);
        awaitingReplyWord = false;
        awaitingReplyResponse = true;
        return;
    }
    
    // Handle awaiting delete reply word
    if (awaitingDeleteReplyWord) {
        const wordToDelete = ctx.message.text.trim();
        try {
            const db = await ensureDatabaseInitialized();
            const result = await db.collection('replies').deleteOne({ word: wordToDelete });
            
            if (result.deletedCount > 0) {
                await ctx.reply(`✅ تم حذف الرد للكلمة "${wordToDelete}" بنجاح.`);
            } else {
                await ctx.reply(`❌ لم يتم العثور على رد للكلمة "${wordToDelete}".`);
            }
        } catch (error) {
            console.error('Error deleting reply:', error);
            await ctx.reply('❌ حدث خطأ أثناء حذف الرد.');
        }
        
        awaitingDeleteReplyWord = false;
        return;
    }
    
    // Handle awaiting bot name
    if (awaitingBotName) {
        const newBotName = ctx.message.text.trim();
        try {
            const db = await ensureDatabaseInitialized();
            await db.collection('bot_custom_names').updateOne(
                { bot_id: bot.botInfo.id },
                { $set: { name: newBotName } },
                { upsert: true }
            );
            
            await ctx.reply(`✅ تم تغيير اسم البوت إلى "${newBotName}" بنجاح.`);
        } catch (error) {
            console.error('Error updating bot name:', error);
            await ctx.reply('❌ حدث خطأ أثناء تحديث اسم البوت.');
        }
        
        awaitingBotName = false;
        return;
    }
    
    // Handle awaiting reply response
    if (awaitingReplyResponse) {
        try {
            const db = await ensureDatabaseInitialized();
            await db.collection('replies').insertOne({
                word: tempReplyWord,
                text: ctx.message.text,
                created_at: new Date(),
                created_by: userId
            });
            
            await ctx.reply(`✅ تم إضافة الرد للكلمة "${tempReplyWord}" بنجاح.`);
            
            // Reset state
            tempReplyWord = '';
            awaitingReplyResponse = false;
        } catch (error) {
            console.error('Error adding reply:', error);
            await ctx.reply('❌ حدث خطأ أثناء إضافة الرد.');
            awaitingReplyResponse = false;
        }
        return;
    }
    
    // Handle other commands or messages here
    // ...
});



    //this fucks how the bot starts
     // Replace the problematic message handler with this one
     
     bot.on('message', async (ctx, next) => {
        try {
            console.log('Received message:', ctx.message);
    
            const userId = ctx.from.id;
            const username = ctx.from.username;
            const message = ctx.message;
    
            // Update last interaction for the user
            updateLastInteraction(userId, username, ctx.from.first_name, ctx.from.last_name);
            
            // If in a group, update the group's active status
            if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
                updateActiveGroups(ctx.chat.id, ctx.chat.title);
            }
    
            // Only process text messages for quiz answers and commands
            if (message.text) {
                // First check if this is a quiz answer
                const isQuizAnswer = await handleQuizAnswer(ctx);
                if (isQuizAnswer) return; // If it was a quiz answer, stop processing
                
                // Handle /start command
                if (message.text.toLowerCase() === '/start' || message.text === 'بدء') {
                    // Handle start command logic here
                    await ctx.reply('مرحباً بك! البوت جاهز للاستخدام.');
                    return;
                }
    
                // Handle awaiting reply word
                if (awaitingReplyWord) {
                    tempReplyWord = message.text;
                    ctx.reply(`تم استلام الكلمة: "${tempReplyWord}". الآن أرسل الرد الذي تريد إضافته لهذه الكلمة:`);
                    awaitingReplyWord = false;
                    awaitingReplyResponse = true;
                    return;
                }
                
                // Handle awaiting delete reply word
                if (awaitingDeleteReplyWord) {
                    const wordToDelete = message.text.trim();
                    try {
                        const db = await ensureDatabaseInitialized();
                        const result = await db.collection('replies').deleteOne({ word: wordToDelete });
                        
                        if (result.deletedCount > 0) {
                            await ctx.reply(`✅ تم حذف الرد للكلمة "${wordToDelete}" بنجاح.`);
                        } else {
                            await ctx.reply(`❌ لم يتم العثور على رد للكلمة "${wordToDelete}".`);
                        }
                    } catch (error) {
                        console.error('Error deleting reply:', error);
                        await ctx.reply('❌ حدث خطأ أثناء حذف الرد.');
                    }
                    
                    awaitingDeleteReplyWord = false;
                    return;
                }
                
                // Handle awaiting bot name
                if (awaitingBotName) {
                    const newBotName = message.text.trim();
                    try {
                        const db = await ensureDatabaseInitialized();
                        await db.collection('bot_custom_names').updateOne(
                            { bot_id: bot.botInfo.id },
                            { $set: { name: newBotName } },
                            { upsert: true }
                        );
                        
                        await ctx.reply(`✅ تم تغيير اسم البوت إلى "${newBotName}" بنجاح.`);
                    } catch (error) {
                        console.error('Error updating bot name:', error);
                        await ctx.reply('❌ حدث خطأ أثناء تحديث اسم البوت.');
                    }
                    
                    awaitingBotName = false;
                    return;
                }
                
                // Handle awaiting reply response
                if (awaitingReplyResponse) {
                    try {
                        let mediaType = 'text';
                        let replyText = null;
                        let cloudinaryUrl = null;
    
                        if (message.text) {
                            mediaType = 'text';
                            replyText = message.text.trim();
                        } else if (message.photo || message.sticker || message.video || message.animation) {
                            if (message.photo) {
                                mediaType = 'photo';
                                // Get the largest photo
                                const fileId = message.photo[message.photo.length - 1].file_id;
                                
                                // Get file path
                                const fileLink = await ctx.telegram.getFileLink(fileId);
                                
                                // Upload to Cloudinary
                                const uploadResult = await cloudinary.uploader.upload(fileLink.href, {
                                    resource_type: 'image'
                                });
                                
                                cloudinaryUrl = uploadResult.secure_url;
                            } else if (message.sticker) {
                                mediaType = 'sticker';
                                const fileId = message.sticker.file_id;
                                const fileLink = await ctx.telegram.getFileLink(fileId);
                                
                                const uploadResult = await cloudinary.uploader.upload(fileLink.href, {
                                    resource_type: 'image'
                                });
                                
                                cloudinaryUrl = uploadResult.secure_url;
                            } else if (message.video) {
                                mediaType = 'video';
                                const fileId = message.video.file_id;
                                const fileLink = await ctx.telegram.getFileLink(fileId);
                                
                                const uploadResult = await cloudinary.uploader.upload(fileLink.href, {
                                    resource_type: 'video'
                                });
                                
                                cloudinaryUrl = uploadResult.secure_url;
                            } else if (message.animation) {
                                mediaType = 'animation';
                                const fileId = message.animation.file_id;
                                const fileLink = await ctx.telegram.getFileLink(fileId);
                                
                                const uploadResult = await cloudinary.uploader.upload(fileLink.href, {
                                    resource_type: 'auto'
                                });
                                
                                cloudinaryUrl = uploadResult.secure_url;
                            }
                        }
    
                        const db = await ensureDatabaseInitialized();
                        await db.collection('replies').insertOne({
                            word: tempReplyWord,
                            type: mediaType,
                            text: replyText,
                            media_url: cloudinaryUrl,
                            created_at: new Date(),
                            created_by: userId
                        });
    
                        await ctx.reply(`✅ تم إضافة الرد للكلمة "${tempReplyWord}" بنجاح.`);
                        
                        // Reset state
                        tempReplyWord = '';
                        awaitingReplyResponse = false;
                    } catch (error) {
                        console.error('Error adding reply:', error);
                        await ctx.reply('❌ حدث خطأ أثناء إضافة الرد.');
                        awaitingReplyResponse = false;
                    }
                    return;
                }
    
                // Check for automatic replies
                try {
                    const db = await ensureDatabaseInitialized();
                    const reply = await db.collection('replies').findOne({ word: message.text.trim() });
                    
                    if (reply) {
                        if (reply.type === 'text' && reply.text) {
                            await ctx.reply(reply.text);
                        } else if (reply.media_url) {
                            switch (reply.type) {
                                case 'photo':
                                    await ctx.replyWithPhoto(reply.media_url);
                                    break;
                                case 'video':
                                    await ctx.replyWithVideo(reply.media_url);
                                    break;
                                case 'animation':
                                    await ctx.replyWithAnimation(reply.media_url);
                                    break;
                                case 'sticker':
                                    // For stickers from URL, we need to send as photo
                                    await ctx.replyWithPhoto(reply.media_url);
                                    break;
                                default:
                                    await ctx.reply(reply.text || 'رد غير معروف');
                            }
                        }
                        return;
                    }
                } catch (error) {
                    console.error('Error checking for automatic replies:', error);
                }
            } else if (message.photo || message.sticker || message.video || message.animation) {
                // Handle media messages for awaiting reply response
                if (awaitingReplyResponse) {
                    try {
                        let mediaType = '';
                        let cloudinaryUrl = null;
    
                        if (message.photo) {
                            mediaType = 'photo';
                            const fileId = message.photo[message.photo.length - 1].file_id;
                            const fileLink = await ctx.telegram.getFileLink(fileId);
                            
                            const uploadResult = await cloudinary.uploader.upload(fileLink.href, {
                                resource_type: 'image'
                            });
                            
                            cloudinaryUrl = uploadResult.secure_url;
                        } else if (message.sticker) {
                            mediaType = 'sticker';
                            const fileId = message.sticker.file_id;
                            const fileLink = await ctx.telegram.getFileLink(fileId);
                            
                            const uploadResult = await cloudinary.uploader.upload(fileLink.href, {
                                resource_type: 'image'
                            });
                            
                            cloudinaryUrl = uploadResult.secure_url;
                        } else if (message.video) {
                            mediaType = 'video';
                            const fileId = message.video.file_id;
                            const fileLink = await ctx.telegram.getFileLink(fileId);
                            
                            const uploadResult = await cloudinary.uploader.upload(fileLink.href, {
                                resource_type: 'video'
                            });
                            
                            cloudinaryUrl = uploadResult.secure_url;
                        } else if (message.animation) {
                            mediaType = 'animation';
                            const fileId = message.animation.file_id;
                            const fileLink = await ctx.telegram.getFileLink(fileId);
                            
                            const uploadResult = await cloudinary.uploader.upload(fileLink.href, {
                                resource_type: 'auto'
                            });
                            
                            cloudinaryUrl = uploadResult.secure_url;
                        }
    
                        const db = await ensureDatabaseInitialized();
                        await db.collection('replies').insertOne({
                            word: tempReplyWord,
                            type: mediaType,
                            text: null,
                            media_url: cloudinaryUrl,
                            created_at: new Date(),
                            created_by: userId
                        });
    
                        await ctx.reply(`✅ تم إضافة الرد للكلمة "${tempReplyWord}" بنجاح.`);
                        
                        // Reset state
                        tempReplyWord = '';
                        awaitingReplyResponse = false;
                    } catch (error) {
                        console.error('Error adding media reply:', error);
                        await ctx.reply('❌ حدث خطأ أثناء إضافة الرد.');
                        awaitingReplyResponse = false;
                    }
                    return;
                }
            }
    
            // Continue to next middleware
            await next();
        } catch (error) {
            console.error('Error in message handler:', error);
            // Don't send error messages to users to avoid spamming
        }
    });
 
    bot.action('add_general_reply', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery('إضافة رد عام');
            ctx.reply('أرسل الكلمة التي تريد إضافة رد لها:');
            awaitingReplyWord = true;
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
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
                [{ text: '• تغيير اسم البوت العام •', callback_data: 'change_bot_name' }],
        
               
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
                const db = await ensureDatabaseInitialized();
                const developers = await db.collection('developers').find({}).toArray();
                
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
            'للحصول على النسخة الكاملة المدفوعة، يرجى مراجعة قناة السورس.',
            {
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back_to_source_menu' }]]
                }
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
            const db = await ensureDatabaseInitialized();
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
                const db = await ensureDatabaseInitialized();
                const developers = await db.collection('developers').find({}).toArray();
                
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
                const db = await ensureDatabaseInitialized();
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
                const db = await ensureDatabaseInitialized();
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
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery();
            showDevPanel(ctx);
        }
    });
    
    
  
    
   
    
    bot.action('list_secondary_developers', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery('عرض قائمة المطورين الثانويين');
            try {
                const connection = await pool.getConnection();
                const [secondaryDevs] = await connection.query('SELECT user_id, username FROM secondary_developers');
                connection.release();
    
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
            }
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
    bot.action('delete_secondary_developers', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.answerCbQuery('حذف المطورين الثانويين');
            try {
                const connection = await pool.getConnection();
                const [secondaryDevs] = await connection.query('SELECT user_id, username FROM secondary_developers');
                connection.release();
    
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
                const connection = await pool.getConnection();
                const [developer] = await connection.query('SELECT username FROM secondary_developers WHERE user_id = ?', [devIdToDelete]);
                
                if (developer.length > 0) {
                    const devUsername = developer[0].username ? `@${developer[0].username}` : `User ID: ${devIdToDelete}`;
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
                connection.release();
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
                const connection = await pool.getConnection();
                await connection.query('DELETE FROM secondary_developers WHERE user_id = ?', [devIdToDelete]);
                connection.release();
                await ctx.editMessageText('تم حذف المطور الثانوي بنجاح.');
            } catch (error) {
                console.error('Error deleting secondary developer:', error);
                await ctx.editMessageText('❌ حدث خطأ أثناء حذف المطور الثانوي. الرجاء المحاولة مرة أخرى لاحقًا.');
            }
        } else {
            ctx.answerCbQuery('عذرًا، هذا الأمر للمطورين فقط', { show_alert: true });
        }
    });
    
    bot.action('cancel_delete_secondary_developers', async (ctx) => {
        if (await isDeveloper(ctx, ctx.from.id)) {
            await ctx.editMessageText('تم إلغاء عملية حذف المطورين الثانويين.');
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
    
    
    
    

 
    
    
    // Update the show_active_groups action handler
    bot.action('show_active_groups', async (ctx) => {
        try {
            const activeGroupsList = await getActiveGroups(ctx);
            await ctx.answerCbQuery(); // Clear the loading state
            await ctx.editMessageCaption(activeGroupsList, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'back' }]]
                }
            });
        } catch (error) {
            console.error('Error showing active groups:', error);
            await ctx.answerCbQuery('حدث خطأ أثناء عرض المجموعات النشطة.');
        }
    });



    // ✅ Back to the main menu in the same message
  // ✅ Back to the main menu in the same message
bot.action('back', async (ctx) => {
    try {
        await ctx.answerCbQuery(); // Clear the loading state
        await ctx.editMessageCaption(
            '🤖 مرحبًا! أنا بوت الحماية. اختر خيارًا:',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📜 عرض الأوامر', callback_data: 'show_commands' }],
                        [{ text: '📂 عرض المجموعات النشطة', callback_data: 'show_active_groups' }],
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
            if (!await isSubscribed(ctx, userId)) {
                return ctx.reply('يرجى الاشتراك بخاص القناة للاستخدام', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'اشترك الآن', url: 'https://t.me/ctrlsrc' }]
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
async function forceCheckSubscription(ctx) {
    const userId = ctx.from.id;
    try {
        const { isSubscribed, statusChanged } = await isSubscribed(ctx, userId);
        if (isSubscribed) {
            if (statusChanged) {
                // User just subscribed, show the new prompt
                await ctx.answerCbQuery('✅ شكراً لاشتراكك في القناة!', { show_alert: true });
                await ctx.reply('شكراً لاشتراكك! يمكنك الآن استخدام البوت.', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'أضفني إلى مجموعتك', url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }],
                            [{ text: 'قناة السورس', url: 'https://t.me/ctrlsrc' }]
                        ]
                    }
                });
            } else {
                await ctx.answerCbQuery('✅ أنت مشترك في القناة.', { show_alert: true });
            }
        } else {
            await ctx.answerCbQuery('❌ أنت غير مشترك في القناة. يرجى الاشتراك للاستمرار.', { show_alert: true });
            await ctx.reply('يرجى الاشتراك بقناة البوت للاستخدام', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'اشترك الآن', url: 'https://t.me/ctrlsrc' }],
                        [{ text: 'تحقق من الاشتراك', callback_data: 'check_subscription' }]
                    ]
                }
            });
        }
    } catch (error) {
        console.error('Error in forceCheckSubscription:', error);
        await ctx.answerCbQuery('❌ حدث خطأ أثناء التحقق من الاشتراك. يرجى المحاولة مرة أخرى لاحقًا.', { show_alert: true });
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


bot.action('check_subscription', forceCheckSubscription);






// Add this closing brace to close the setupActions function
}

module.exports = { setupActions,
    activeQuizzes,endQuiz , ensureDatabaseInitialized,startAddingCustomQuestions,chatStates };
