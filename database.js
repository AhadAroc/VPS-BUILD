const { MongoClient } = require('mongodb');
const { mongoUri, dbName, developerIds } = require('./config');

// MongoDB connection
let db = null;
let client = null;
/**
 * Add a new quiz question to the database
 * @param {Object} question - The question object
 * @param {string} question.text - The question text
 * @param {Array<string>} question.options - Array of answer options
 * @param {number} question.correctOptionIndex - Index of the correct answer (0-based)
 * @param {string} question.category - Question category
 * @param {number} question.difficulty - Question difficulty (1-5)
 * @param {string} question.addedBy - User ID of who added the question
 * @returns {Promise<Object>} - The added question with its ID
 */
async function addQuizQuestion(question) {
    try {
        const db = await ensureDatabaseInitialized();
        
        // Add timestamp and ensure question has all required fields
        const newQuestion = {
            ...question,
            createdAt: new Date(),
            active: true
        };
        
        const result = await db.collection('quiz_questions').insertOne(newQuestion);
        return { ...newQuestion, _id: result.insertedId };
    } catch (error) {
        console.error('Error adding quiz question:', error);
        throw error;
    }
}

/**
 * Get quiz questions by category
 * @param {string} category - The category to filter by (optional)
 * @param {number} limit - Maximum number of questions to return
 * @returns {Promise<Array>} - Array of questions
 */
async function getQuizQuestions(difficulty, count) {
    const db = await ensureDatabaseInitialized();
    let questions = [];

    if (difficulty === 'custom') {
        // Fetch all custom questions
        questions = await db.collection('quiz_questions')
            .find({ difficulty: 'custom' })
            .toArray();
    } else {
        // Fetch questions of the specified difficulty
        questions = await db.collection('quiz_questions')
            .find({ difficulty: difficulty })
            .toArray();
    }

    // If we don't have enough questions, we'll repeat some
    let finalQuestions = [];
    while (finalQuestions.length < count) {
        // Shuffle the questions and add them
        const shuffled = shuffleArray(questions);
        finalQuestions = [...finalQuestions, ...shuffled.slice(0, Math.min(count - finalQuestions.length, shuffled.length))];
    }

    return finalQuestions;
}

// Helper function to shuffle an array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Get all quiz categories
 * @returns {Promise<Array>} - Array of unique categories
 */
async function getQuizCategories() {
    try {
        const db = await ensureDatabaseInitialized();
        
        const categories = await db.collection('quiz_questions')
            .distinct('category', { active: true });
            
        return categories;
    } catch (error) {
        console.error('Error getting quiz categories:', error);
        return [];
    }
}
async function connectToMongoDB() {
    try {
        console.log('Attempting to connect to MongoDB...');
        
        // Updated connection options with proper SSL configuration
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            ssl: true,
            tls: true,
            tlsAllowInvalidCertificates: false,
            retryWrites: true,
            w: 'majority'
        };
        
        // Log the connection URI (without password for security)
        const sanitizedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
        console.log(`Connecting to: ${sanitizedUri} with options:`, options);
        
        client = new MongoClient(mongoUri, options);
        await client.connect();
        db = client.db(dbName);
        console.log('Connected to MongoDB successfully');
        return db;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}
async function getUserStatistics(userId) {
    try {
        const db = await ensureDatabaseInitialized();
        
        // Get total score
        const scoreResult = await db.collection('quiz_scores')
            .aggregate([
                { $match: { userId: userId } },
                { $group: { 
                    _id: null, 
                    totalScore: { $sum: "$score" },
                    quizCount: { $sum: 1 }
                }}
            ])
            .toArray();
            
        // Get correct answers count
        const correctAnswersResult = await db.collection('quiz_answers')
            .countDocuments({ 
                userId: userId, 
                isCorrect: true 
            });
            
        // Get total answers count
        const totalAnswersResult = await db.collection('quiz_answers')
            .countDocuments({ 
                userId: userId
            });
            
        // Get user's rank in leaderboard
        const leaderboard = await db.collection('quiz_scores')
            .aggregate([
                { $group: { 
                    _id: "$userId", 
                    totalScore: { $sum: "$score" }
                }},
                { $sort: { totalScore: -1 } }
            ])
            .toArray();
            
        let userRank = leaderboard.findIndex(entry => entry._id === userId) + 1;
        if (userRank === 0) userRank = "غير مصنف";
        
        // Get user info
        const userInfo = await db.collection('quiz_scores')
            .findOne({ userId: userId });
            
        return {
            totalScore: scoreResult.length > 0 ? scoreResult[0].totalScore : 0,
            quizCount: scoreResult.length > 0 ? scoreResult[0].quizCount : 0,
            correctAnswers: correctAnswersResult || 0,
            totalAnswers: totalAnswersResult || 0,
            accuracy: totalAnswersResult > 0 ? Math.round((correctAnswersResult / totalAnswersResult) * 100) : 0,
            rank: userRank,
            username: userInfo ? userInfo.username : null,
            firstName: userInfo ? userInfo.firstName : null
        };
    } catch (error) {
        console.error('Error getting user statistics:', error);
        return {
            totalScore: 0,
            quizCount: 0,
            correctAnswers: 0,
            totalAnswers: 0,
            accuracy: 0,
            rank: "غير مصنف",
            username: null,
            firstName: null
        };
    }
}
async function ensureDatabaseInitialized() {
    if (!db) {
        await connectToMongoDB();
    }
    return db;
}

async function setupDatabase() {
    try {
        console.log('Setting up MongoDB connection...');
        await connectToMongoDB();
        
        // Add primary developer if not exists
        if (developerIds && developerIds.size > 0) {
            const primaryDevId = Array.from(developerIds)[0];
            const existingDev = await db.collection('developers').findOne({ user_id: primaryDevId });
            
            if (!existingDev) {
                await db.collection('developers').insertOne({
                    user_id: primaryDevId,
                    username: 'primary_developer',
                    added_at: new Date()
                });
                console.log(`Primary developer (${primaryDevId}) added to database`);
            }
        }

        // Ensure indexes for better query performance
        await db.collection('quiz_questions').createIndex({ category: 1, difficulty: 1 });
        await db.collection('quiz_scores').createIndex({ userId: 1 });
        await db.collection('quiz_answers').createIndex({ userId: 1 });
        await db.collection('replies').createIndex({ trigger_word: 1 }, { unique: true });
        await db.collection('developers').createIndex({ user_id: 1 }, { unique: true });
        await db.collection('groups').createIndex({ group_id: 1 }, { unique: true });
        await db.collection('users').createIndex({ user_id: 1 }, { unique: true });

        // Ensure required collections exist
        const collections = ['quiz_questions', 'quiz_scores', 'quiz_answers', 'replies', 'developers', 'groups', 'users'];
        for (const collection of collections) {
            if (!(await db.listCollections({ name: collection }).hasNext())) {
                await db.createCollection(collection);
                console.log(`Created collection: ${collection}`);
            }
        }

        console.log('Database setup completed');
    } catch (error) {
        console.error('Error setting up database:', error);
        throw error;
    }
}
// Add a new function for quiz-related operations
async function saveQuizScore(userId, username, firstName, score) {
    try {
        const result = await db.collection('quiz_scores').insertOne({
            userId,
            username,
            firstName,
            score,
            timestamp: new Date()
        });
        return result;
    } catch (error) {
        console.error('Error saving quiz score:', error);
        throw error;
    }
}

async function getLeaderboard() {
    try {
        return await db.collection('quiz_scores')
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
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }
}
// Reply functions
async function getReplies() {
    try {
        return await db.collection('replies').find().toArray();
    } catch (error) {
        console.error('Error fetching replies:', error);
        return [];
    }
}

async function getReply(triggerWord) {
    try {
        return await db.collection('replies').findOne({ trigger_word: triggerWord });
    } catch (error) {
        console.error(`Error fetching reply for trigger "${triggerWord}":`, error);
        return null;
    }
}

async function saveReply(triggerWord, replyText) {
    try {
        const result = await db.collection('replies').updateOne(
            { trigger_word: triggerWord },
            { 
                $set: { 
                    reply_text: replyText, 
                    updated_at: new Date() 
                }
            },
            { upsert: true }
        );
        return result;
    } catch (error) {
        console.error('Error saving reply:', error);
        throw error;
    }
}

async function deleteReply(triggerWord) {
    try {
        const result = await db.collection('replies').deleteOne({ trigger_word: triggerWord });
        return result.deletedCount > 0;
    } catch (error) {
        console.error('Error deleting reply:', error);
        throw error;
    }
}

// Developer functions
async function getDevelopers() {
    try {
        return await db.collection('developers').find().toArray();
    } catch (error) {
        console.error('Error fetching developers:', error);
        return [];
    }
}

// Add the isDeveloper function
async function isDeveloper(userId) {
    try {
        console.log('DEBUG: Checking if user is developer:', userId);
        
        // Check in all developer collections
        const developer = await db.collection('developers').findOne({ user_id: userId });
        const primaryDev = await db.collection('primary_developers').findOne({ user_id: userId });
        const secondaryDev = await db.collection('secondary_developers').findOne({ user_id: userId });
        
        const result = !!(developer || primaryDev || secondaryDev);
        console.log('DEBUG: isDeveloper result for user', userId, ':', result);
        
        return result;
    } catch (error) {
        console.error('Error in isDeveloper:', error);
        return false;
    }
}

async function addDeveloper(userId, username) {
    try {
        const result = await db.collection('developers').updateOne(
            { user_id: userId },
            { 
                $set: { 
                    username: username, 
                    added_at: new Date() 
                }
            },
            { upsert: true }
        );
        return result;
    } catch (error) {
        console.error('Error adding developer:', error);
        throw error;
    }
}

async function removeDeveloper(userId) {
    try {
        const result = await db.collection('developers').deleteOne({ user_id: userId });
        return result.deletedCount > 0;
    } catch (error) {
        console.error('Error removing developer:', error);
        throw error;
    }
}

// Group functions
async function getGroups() {
    try {
        return await db.collection('groups').find().toArray();
    } catch (error) {
        console.error('Error fetching groups:', error);
        return [];
    }
}

async function addGroup(groupId, title) {
    try {
        const result = await db.collection('groups').updateOne(
            { group_id: groupId },
            { 
                $set: { 
                    title: title,
                    is_active: true,
                    last_activity: new Date()
                }
            },
            { upsert: true }
        );
        return result;
    } catch (error) {
        console.error('Error adding group:', error);
        throw error;
    }
}

async function updateGroupActivity(groupId) {
    try {
        await db.collection('groups').updateOne(
            { group_id: groupId },
            { $set: { last_activity: new Date() } }
        );
    } catch (error) {
        console.error('Error updating group activity:', error);
    }
}

// User functions
async function getUsers() {
    try {
        return await db.collection('users').find().toArray();
    } catch (error) {
        console.error('Error fetching users:', error);
        return [];
    }
}

async function addUser(userId, username, firstName, lastName) {
    try {
        const result = await db.collection('users').updateOne(
            { user_id: userId },
            { 
                $set: { 
                    username: username,
                    first_name: firstName,
                    last_name: lastName,
                    is_active: true,
                    last_activity: new Date()
                }
            },
            { upsert: true }
        );
        return result;
    } catch (error) {
        console.error('Error adding user:', error);
        throw error;
    }
}

async function updateUserActivity(userId) {
    try {
        await db.collection('users').updateOne(
            { user_id: userId },
            { $set: { last_activity: new Date() } }
        );
    } catch (error) {
        console.error('Error updating user activity:', error);
    }
}

// Export the functions and objects
module.exports = {
    getDb: () => db,
    getClient: () => client,
    connectToMongoDB,
    setupDatabase,
    ensureDatabaseInitialized,
    
    // Reply functions
    getReplies,
    getReply,
    saveReply,
    deleteReply,
    
    // Developer functions
    getDevelopers,
    isDeveloper,
    addDeveloper,
    removeDeveloper,
    
    // Group functions
    getGroups,
    addGroup,
    updateGroupActivity,
    
    // User functions
    getUsers,
    addUser,
    updateUserActivity,
    ensureDatabaseInitialized,
    getUserStatistics,
    addQuizQuestion,
    getQuizQuestions,
    getQuizCategories,
    // Quiz functions
    saveQuizScore,
    getUserStatistics,
    getLeaderboard
};
