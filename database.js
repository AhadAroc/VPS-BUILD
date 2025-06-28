const { MongoClient } = require('mongodb');
const { mongoUri, dbName, developerIds } = require('./config');
const mongoose = require('mongoose');
require('dotenv').config();
const defaultDbName = process.env.DB_NAME || 'replays';

const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,  // Reduced from 30000
    socketTimeoutMS: 15000,           // Reduced from 45000
    connectTimeoutMS: 10000           // Reduced from 30000
};
// Track mongoose connection state
let mongooseConnected = false;
let currentMongooseDb = null;
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
 * @param {string} customDbName
 */


// --- Native MongoClient helper (for clean multi-DB connections) ---

let _mongoClient = null;
let _mongoDbs = {};
let _connectionPromise = null; // Add this to track ongoing connection attempts
async function connectToMongoDB(customDbName = null) {
  try {
    const dbNameToUse = customDbName || defaultDbName;

    // If already connected to the same DB, return it immediately
    if (mongooseConnected && currentMongooseDb === dbNameToUse && db) {
      return db;
    }
    
    // If there's an ongoing connection attempt, wait for it
    if (_connectionPromise) {
      await _connectionPromise;
      
      // After waiting, check if we're now connected to the requested DB
      if (mongooseConnected && currentMongooseDb === dbNameToUse && db) {
        return db;
      }
    }

    console.log('📡 Attempting to connect to MongoDB...');

    // Inject DB name into URI if missing
    let uriToUse = mongoUri;
    if (!mongoUri.includes(`/${dbNameToUse}`)) {
      const [base, query] = mongoUri.split('?');
      uriToUse = `${base.replace(/\/$/, '')}/${dbNameToUse}${query ? `?${query}` : ''}`;
    }

    const sanitizedUri = uriToUse.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log(`🔐 Connecting to: ${sanitizedUri}`);

    // Close existing connection if switching DB
    if (mongooseConnected && currentMongooseDb !== dbNameToUse) {
      console.log('♻️ Closing existing mongoose connection...');
      await mongoose.disconnect();
      mongooseConnected = false;
      currentMongooseDb = null;
    }

    // Create a connection promise and store it
    _connectionPromise = (async () => {
      try {
        // Race connection against timeout
        const connectPromise = mongoose.connect(uriToUse, mongooseOptions);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MongoDB connection timed out')), 10000)
        );

        await Promise.race([connectPromise, timeoutPromise]);

        mongooseConnected = true;
        currentMongooseDb = dbNameToUse;
        db = mongoose.connection.db;

        console.log(`✅ Connected to MongoDB database: ${dbNameToUse}`);
        return db;
      } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        mongooseConnected = false;
        currentMongooseDb = null;
        throw error;
      } finally {
        // Clear the connection promise when done
        _connectionPromise = null;
      }
    })();

    // Wait for the connection to complete
    return await _connectionPromise;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    mongooseConnected = false;
    currentMongooseDb = null;
    return createMockDatabase();
  }
}
async function getDatabaseForBot(botId) {
    try {
        const uri = process.env.MONGODB_URI || mongoUri;
        
        // Initialize native client if not already done
        if (!_mongoClient) {
            _mongoClient = new MongoClient(uri, {
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000
            });
            await _mongoClient.connect();
            console.log('✅ Native MongoClient connected to cluster');
        }

        // Determine database name
        const dbNameToUse = botId ? `bot_${botId}_db` : (process.env.DB_NAME || dbName);
        
        // Get or create database connection
        if (!_mongoDbs[dbNameToUse]) {
            _mongoDbs[dbNameToUse] = _mongoClient.db(dbNameToUse);
            console.log(`✅ Native MongoDB database selected: ${dbNameToUse}`);
        }

        return _mongoDbs[dbNameToUse];
    } catch (error) {
        console.error(`Error getting database for bot ${botId}:`, error);
        // Fallback to main database
        return await ensureDatabaseInitialized();
    }
}

module.exports.getDatabaseForBot = getDatabaseForBot;


async function ensureDatabaseInitialized(botId = null) {
    try {
        const dbNameToUse = botId ? `bot_${botId}_db` : (process.env.DB_NAME || dbName);
        
        // Create a timeout promise that rejects after 10 seconds
        const timeoutPromise = new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
                clearTimeout(timeoutId);
                reject(new Error('Database connection timed out after 10 seconds'));
            }, 10000);
        });
        
        // Race between the database connection and the timeout
        const database = await Promise.race([
            connectToMongoDB(dbNameToUse),
            timeoutPromise
        ]);
        
        return database;
    } catch (error) {
        console.error('Error initializing database:', error);
        
        // Return a mock database object that won't crash your app
        return createMockDatabase();
    }
}
function createMockDatabase() {
    return {
        collection: (name) => ({
            findOne: async () => null,
            find: () => ({ toArray: async () => [] }),
            updateOne: async () => ({ modifiedCount: 0 }),
            insertOne: async () => ({ insertedId: null }),
            deleteMany: async () => ({ deletedCount: 0 }),
            deleteOne: async () => ({ deletedCount: 0 }),
            distinct: async () => [],
            aggregate: () => ({ toArray: async () => [] }),
            countDocuments: async () => 0,
            createIndex: async () => null
        }),
        listCollections: () => ({ hasNext: async () => false }),
        createCollection: async () => null
    };
}


async function getDatabaseForBot(botId) {
    try {
        // If no botId is provided, return the main database
        if (!botId) {
            return await ensureDatabaseInitialized();
        }
        
        // For specific bot databases, use a naming convention
        const dbName = `bot_${botId}_db`;
        
        // Use the MongoClient for direct connection
        if (!_mongoClient) {
            _mongoClient = new MongoClient(mongoUri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 30000
            });
            await _mongoClient.connect();
            console.log('✅ Native MongoClient connected to cluster');
        }

        if (!_mongoDbs[dbName]) {
            _mongoDbs[dbName] = _mongoClient.db(dbName);
            console.log(`✅ Native MongoDB database selected: ${dbName}`);
        }

        return _mongoDbs[dbName];
    } catch (error) {
        console.error(`Error getting database for bot ${botId}:`, error);
        // Fallback to main database
        return await ensureDatabaseInitialized();
    }
}

async function addQuizQuestion(question) {
    try {
        const database = await ensureDatabaseInitialized();
        
        const newQuestion = {
            ...question,
            createdAt: new Date(),
            active: true
        };
        
        const result = await database.collection('quiz_questions').insertOne(newQuestion);
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
    try {
        const database = await ensureDatabaseInitialized();
        let questions = [];

        if (difficulty === 'custom') {
            questions = await database.collection('quiz_questions')
                .find({ difficulty: 'custom' })
                .toArray();
        } else {
            questions = await database.collection('quiz_questions')
                .find({ difficulty: difficulty })
                .toArray();
        }

        // Shuffle and return requested count
        let finalQuestions = [];
        while (finalQuestions.length < count && questions.length > 0) {
            const shuffled = shuffleArray([...questions]);
            const needed = Math.min(count - finalQuestions.length, shuffled.length);
            finalQuestions = [...finalQuestions, ...shuffled.slice(0, needed)];
        }

        return finalQuestions;
    } catch (error) {
        console.error('Error getting quiz questions:', error);
        return [];
    }
}
// Add a new function to create a cloned database with proper structure
async function createClonedDatabase(botId) {
    try {
        console.log(`Creating cloned database for bot ${botId}...`);
        
        // We'll use the same database but with bot_id field to separate data
        const db = await ensureDatabaseInitialized();
        
        // Create indexes for the bot_id field in relevant collections
        await db.collection('replies').createIndex({ bot_id: 1, trigger_word: 1 });
        
        console.log(`Cloned database structure created for bot ${botId}`);
        return db;
    } catch (error) {
        console.error(`Error creating cloned database for bot ${botId}:`, error);
        throw error;
    }
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

/**
 * Get a database connection for a specific bot
 * @param {string} botId - The bot ID to get a database for
 * @returns {Promise<Object>} - The database connection
 */
async function getBotDatabase(botId) {
    try {
        if (!botId) {
            return await ensureDatabaseInitialized();
        }
        
        const botDbName = `bot_${botId}_db`;
        return await connectToMongoDB(botDbName);
    } catch (error) {
        console.error(`Error getting database for bot ${botId}:`, error);
        throw error;
    }
}

/**
 * Save a reply for a specific bot
 * @param {string} botId - The bot ID
 * @param {string} triggerWord - The trigger word
 * @param {string} replyType - The type of reply (text, photo, video, etc.)
 * @param {string} replyContent - The content of the reply
 * @returns {Promise<Object>} - The result of the operation
 */
async function saveBotReply(botId, triggerWord, replyType, replyContent) {
    try {
        const botDb = await getBotDatabase(botId);
        
        const result = await botDb.collection('replies').updateOne(
            { trigger_word: triggerWord.toLowerCase().trim() },
            { 
                $set: { 
                    type: replyType,
                    content: replyContent,
                    updated_at: new Date() 
                }
            },
            { upsert: true }
        );
        
        console.log(`Reply saved for bot ${botId}, trigger: ${triggerWord}, type: ${replyType}`);
        return result;
    } catch (error) {
        console.error(`Error saving reply for bot ${botId}:`, error);
        throw error;
    }
}

/**
 * Get a reply for a specific bot
 * @param {string} botId - The bot ID
 * @param {string} triggerWord - The trigger word
 * @returns {Promise<Object>} - The reply object or null if not found
 */
async function getBotReply(botId, triggerWord) {
    try {
        const botDb = await getBotDatabase(botId);
        
        const reply = await botDb.collection('replies').findOne({
            trigger_word: triggerWord.toLowerCase().trim()
        });
        
        return reply;
    } catch (error) {
        console.error(`Error getting reply for bot ${botId}, trigger: ${triggerWord}:`, error);
        return null;
    }
}

/**
 * Delete a reply for a specific bot
 * @param {string} botId - The bot ID
 * @param {string} triggerWord - The trigger word
 * @returns {Promise<boolean>} - True if deleted, false otherwise
 */
async function deleteBotReply(botId, triggerWord) {
    try {
        const botDb = await getBotDatabase(botId);
        
        const result = await botDb.collection('replies').deleteOne({
            trigger_word: triggerWord.toLowerCase().trim()
        });
        
        return result.deletedCount > 0;
    } catch (error) {
        console.error(`Error deleting reply for bot ${botId}, trigger: ${triggerWord}:`, error);
        return false;
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
async function cleanGroups() {
    try {
        const db = await ensureDatabaseInitialized();
        
        // Calculate the date 15 days ago
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        
        // Find groups that haven't been active in the last 15 days
        const inactiveGroups = await db.collection('groups').find({
            updated_at: { $lt: fifteenDaysAgo }
        }).toArray();
        
        const inactiveGroupIds = inactiveGroups.map(group => group.group_id);
        let cleanedCount = 0;
        
        if (inactiveGroupIds.length > 0) {
            // Delete inactive groups from the groups collection
            const result = await db.collection('groups').deleteMany({
                group_id: { $in: inactiveGroupIds }
            });
            
            cleanedCount = result.deletedCount;
            
            // Also remove these groups from other relevant collections
            await Promise.all([
                db.collection('active_groups').deleteMany({ 
                    group_id: { $in: inactiveGroupIds }
                }),
                db.collection('group_settings').deleteMany({ 
                    group_id: { $in: inactiveGroupIds }
                }),
                db.collection('quiz_settings').deleteMany({ 
                    chat_id: { $in: inactiveGroupIds }
                })
            ]);
            
            console.log(`Cleaned ${cleanedCount} inactive groups that haven't been active for 15+ days`);
        }
        
        return cleanedCount;
    } catch (error) {
        console.error('Error in cleanGroups function:', error);
        return 0;
    }
}
async function loadActiveGroupsFromDatabase() {
    try {
        const db = await ensureDatabaseInitialized();
        const activeGroups = await db.collection('active_groups').find({}).toArray();
        return activeGroups;
    } catch (error) {
        console.error('Error loading active groups from database:', error);
        return [];
    }
}


async function getReplyForBot(botId, triggerWord) {
    try {
        // Use the specific database for this bot
        const dbName = `bot_${botId}_db`;
        const db = await connectToMongoDB(dbName);
        
        // Find the reply in this bot's database
        const reply = await db.collection('replies').findOne({
            trigger_word: triggerWord.toLowerCase().trim()
        });
        
        return reply;
    } catch (error) {
        console.error(`Error getting reply for bot ${botId}:`, error);
        return null;
    }
}
async function setupDatabase() {
    try {
        console.log('Setting up MongoDB connection...');
        db = await connectToMongoDB();
        
        if (!db) {
            throw new Error('Failed to initialize database connection');
        }

        console.log('Database connection established. Setting up collections...');

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

        // Ensure required collections exist first
        const collections = ['quiz_questions', 'quiz_scores', 'quiz_answers', 'replies', 'developers', 'groups', 'users'];
        for (const collection of collections) {
            const exists = await db.listCollections({ name: collection }).hasNext();
            if (!exists) {
                await db.createCollection(collection);
                console.log(`Created collection: ${collection}`);
            }
        }

        // Create indexes safely - check if they exist first
        const indexOperations = collections.map(collectionName => {
            const collection = db.collection(collectionName);
            if (!collection) {
                console.error(`Collection ${collectionName} is not initialized.`);
                return Promise.resolve(); // Skip index creation for this collection
            }
            switch (collectionName) {
                case 'quiz_questions':
                    return createIndexSafely(collection, { category: 1, difficulty: 1 });
                case 'quiz_scores':
                    return createIndexSafely(collection, { userId: 1 });
                case 'quiz_answers':
                    return createIndexSafely(collection, { userId: 1 });
                case 'replies':
                    return createIndexSafely(collection, { trigger_word: 1 }, { unique: true });
                case 'developers':
                    return createIndexSafely(collection, { user_id: 1 }, { unique: true });
                case 'groups':
                    return createIndexSafely(collection, { group_id: 1 }, { unique: true });
                case 'users':
                    return createIndexSafely(collection, { user_id: 1 }, { unique: true });
                default:
                    return Promise.resolve();
            }
        });

        await Promise.all(indexOperations);

        console.log('Database setup completed');
        return db;
    } catch (error) {
        console.error('Error setting up database:', error);
        throw error;
    }
}


async function createIndexSafely(collection, keys, options = {}) {
    try {
        if (!collection) {
            console.error('Collection is undefined, cannot create index.');
            return;
        }

        // Generate the index name that MongoDB would use
        const indexName = Object.keys(keys).map(key => `${key}_${keys[key]}`).join('_');
        
        // Check if index already exists
        const indexes = await collection.indexes();
        const existingIndex = indexes.find(idx => idx.name === indexName);
        
        if (existingIndex) {
            console.log(`Index ${indexName} already exists on collection ${collection.collectionName}`);
            return;
        }
        
        // Create the index if it doesn't exist
        await collection.createIndex(keys, options);
        console.log(`Created index ${indexName} on collection ${collection.collectionName}`);
    } catch (error) {
        console.error(`Error creating index on collection ${collection.collectionName}:`, error);
        // Don't throw the error to allow other operations to continue
    }
}
// Add a new function for quiz-related operations
async function saveQuizScore(chatId, userId, firstName, lastName, username, score) {
    try {
        const db = await ensureDatabaseInitialized();
        if (!db) {
            throw new Error('Database connection failed');
        }
        
        await db.collection('quiz_scores').updateOne(
            { chat_id: chatId, user_id: userId },
            { 
                $set: {
                    chat_id: chatId,
                    user_id: userId,
                    first_name: firstName,
                    last_name: lastName,
                    username: username,
                    last_played: new Date()
                },
                $inc: { total_score: score }
            },
            { upsert: true }
        );
        
        console.log(`Saved quiz score for user ${userId} in chat ${chatId}: +${score} points`);
        return true;
    } catch (error) {
        console.error('Error saving quiz score:', error);
        return false;
    }
}

async function getLeaderboard(chatId, limit = 10) {
    try {
        const db = await ensureDatabaseInitialized();
        
        console.log(`Fetching leaderboard for chat ${chatId}`);
        
        // Get top scores for this chat
        const leaderboard = await db.collection('quiz_scores')
            .aggregate([
                { $match: { chatId: chatId } },
                { $group: {
                    _id: "$userId",
                    firstName: { $first: "$firstName" },
                    lastName: { $first: "$lastName" },
                    username: { $first: "$username" },
                    totalScore: { $sum: "$score" }
                }},
                { $sort: { totalScore: -1 } },
                { $limit: limit }
            ])
            .toArray();
        
        console.log(`Retrieved leaderboard for chat ${chatId}, found ${leaderboard.length} entries`);
        return leaderboard;
    } catch (error) {
        console.error('Error getting leaderboard:', error);
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

// Modify the getReply function to filter by bot_id
async function getReply(triggerWord, botId = null) {
    try {
        const db = await ensureDatabaseInitialized();
        const query = botId ? 
            { bot_id: botId, trigger_word: triggerWord.toLowerCase() } : 
            { trigger_word: triggerWord.toLowerCase() };
            
        return await db.collection('replies').findOne(query);
    } catch (error) {
        console.error(`Error fetching reply for trigger "${triggerWord}":`, error);
        return null;
    }
}

async function saveReply(botId, triggerWord, replyContent, replyType = 'text') {
    try {
        // Use the specific database for this bot
        const dbName = `bot_${botId}_db`;
        const db = await connectToMongoDB(dbName);
        
        const result = await db.collection('replies').updateOne(
            { trigger_word: triggerWord.toLowerCase().trim() },
            { 
                $set: { 
                    type: replyType,
                    content: replyContent,
                    updated_at: new Date() 
                }
            },
            { upsert: true }
        );
        return result;
    } catch (error) {
        console.error(`Error saving reply for bot ${botId}:`, error);
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
async function updateActiveGroup(chatId, chatTitle, addedBy = null) {
    const db = await ensureDatabaseInitialized();
    const now = new Date();
    await db.collection('active_groups').updateOne(
        { chat_id: chatId },
        { 
            $set: { 
                chat_title: chatTitle,
                last_activity: now
            },
            $setOnInsert: {
                added_by: addedBy,
                added_at: now
            }
        },
        { upsert: true }
    );
}


async function getOverallStats() {
    try {
        const db = await ensureDatabaseInitialized();
        const botId = global.botInfo.id; // Assuming botInfo is stored globally
        
        // Get count of subscribers (users who have interacted with the bot in private chats)
        const subscribersCount = await db.collection('users').countDocuments({
            bot_id: botId,
            chat_type: 'private'
        });
        
        // Get count of groups where the bot is active
        const groupsCount = await db.collection('groups').countDocuments({
            bot_id: botId,
            is_active: true,
            chat_type: { $in: ['group', 'supergroup'] }
        });
        
        // Get total count of all users across private chats and groups
        // Note: This might include some duplicates if users are in multiple groups
        const totalUsersCount = await db.collection('known_users').countDocuments({
            bot_id: botId
        });
        
        return {
            subscribers: subscribersCount,
            groups: groupsCount,
            total: totalUsersCount
        };
    } catch (error) {
        console.error('Error getting overall stats:', error);
        // Return default values in case of error
        return {
            subscribers: 0,
            groups: 0,
            total: 0
        };
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
async function isDeveloper(ctx, userId) {
    const botId = ctx.botInfo?.id;
    if (!botId) {
        console.warn('⚠️ Missing bot ID in ctx.botInfo');
        return false;
    }

    // ✅ First: check global developer list
    if (developerIds.has(userId.toString())) {
        console.log(`✅ User ${userId} is a hardcoded developer`);
        return true;
    }

    try {
        // ✅ Use native MongoClient to connect directly to test DB
        const client = await MongoClient.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        const db = client.db('test');

        console.log(`🔍 Checking developer roles for user ${userId} on bot ${botId}`);

        // Check all dev-related collections
        const [dev, primary, secondary] = await Promise.all([
            db.collection('developers').findOne({ user_id: userId, bot_id: botId }),
            db.collection('primary_developers').findOne({ user_id: userId, bot_id: botId }),
            db.collection('secondary_developers').findOne({ user_id: userId, bot_id: botId })
        ]);

        await client.close();

        const result = !!(dev || primary || secondary);
        console.log('✅ isDeveloper result:', result);
        return result;
    } catch (error) {
        console.error('❌ Error in isDeveloper:', error);
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
    getDatabaseForBot,
    
    // Reply functions
    getReplies,
    getReply,
    saveReply,
    deleteReply,
    getReplyForBot,
    // Developer functions
    getDevelopers,
    isDeveloper,
    addDeveloper,
    removeDeveloper,
    
    // Group functions
    getGroups,
    addGroup,
    updateGroupActivity,
    updateActiveGroup,
    cleanGroups,
    getOverallStats,
    
    // User functions
    getUsers,
    addUser,
    updateUserActivity,
    ensureDatabaseInitialized,
    getUserStatistics,
    addQuizQuestion,
    getQuizQuestions,
    getQuizCategories,
    loadActiveGroupsFromDatabase,
    // Quiz functions
    saveQuizScore,
    getUserStatistics,
    getLeaderboard
};
