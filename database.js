const { MongoClient } = require('mongodb');
const { mongoUri, dbName, developerIds } = require('./config');
const mongoose = require('mongoose');
require('dotenv').config();

// Remove deprecated options
//const mongooseOptions = {
  //  serverSelectionTimeoutMS: 30000,
   // socketTimeoutMS: 45000,
    //connectTimeoutMS: 30000,
//};

// MongoDB connection variables
let db = null;
let client = null;

// Native MongoClient for multi-database support
let _mongoClient = null;
let _mongoDbs = {};

// Track mongoose connection state
let mongooseConnected = false;
let currentMongooseDb = null;

/**
 * Get a database using native MongoClient (for multi-database scenarios)
 */
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

/**
 * Connect to MongoDB using Mongoose (for single database scenarios)
 */
async function connectToMongoDB(customDbName = null) {
    try {
        console.log('Attempting to connect to MongoDB...');
        
        const dbNameToUse = customDbName || dbName;
        const uriToUse = mongoUri.replace(dbName, dbNameToUse);
        
        const sanitizedUri = uriToUse.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
        console.log(`Connecting to: ${sanitizedUri}`);
        
        // Check if we're already connected to the same database
        if (mongooseConnected && currentMongooseDb === dbNameToUse) {
            console.log(`Already connected to MongoDB database: ${dbNameToUse}`);
            return mongoose.connection.db;
        }
        
        // Disconnect existing connection if connecting to different database
        if (mongooseConnected && currentMongooseDb !== dbNameToUse) {
            console.log('Closing existing mongoose connection...');
            await mongoose.disconnect();
            mongooseConnected = false;
            currentMongooseDb = null;
        }
        
        // Connect to MongoDB
        if (!mongooseConnected) {
            await mongoose.connect(uriToUse, mongooseOptions);
            mongooseConnected = true;
            currentMongooseDb = dbNameToUse;
            console.log(`Connected to MongoDB database: ${dbNameToUse} successfully`);
        }
        
        // Store the current database connection
        db = mongoose.connection.db;
        return db;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        mongooseConnected = false;
        currentMongooseDb = null;
        throw error;
    }
}

/**
 * Ensure database is initialized with timeout protection
 */
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

/**
 * Create a mock database object for fallback
 */
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

/**
 * Setup database with proper initialization
 */
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

        // Create indexes for better performance
        const indexPromises = [
            db.collection('quiz_questions').createIndex({ category: 1, difficulty: 1 }),
            db.collection('quiz_scores').createIndex({ userId: 1 }),
            db.collection('quiz_answers').createIndex({ userId: 1 }),
            db.collection('replies').createIndex({ trigger_word: 1 }),
            db.collection('developers').createIndex({ user_id: 1 }, { unique: true }),
            db.collection('groups').createIndex({ group_id: 1 }, { unique: true }),
            db.collection('users').createIndex({ user_id: 1 }, { unique: true })
        ];

        await Promise.all(indexPromises);

        // Ensure required collections exist
        const collections = ['quiz_questions', 'quiz_scores', 'quiz_answers', 'replies', 'developers', 'groups', 'users'];
        for (const collection of collections) {
            const exists = await db.listCollections({ name: collection }).hasNext();
            if (!exists) {
                await db.createCollection(collection);
                console.log(`Created collection: ${collection}`);
            }
        }

        console.log('Database setup completed');
        return db;
    } catch (error) {
        console.error('Error setting up database:', error);
        throw error;
    }
}

// Quiz Functions
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

async function getQuizCategories() {
    try {
        const database = await ensureDatabaseInitialized();
        const categories = await database.collection('quiz_questions')
            .distinct('category', { active: true });
        return categories;
    } catch (error) {
        console.error('Error getting quiz categories:', error);
        return [];
    }
}

// Helper function to shuffle array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Reply Functions
async function getReply(triggerWord, botId = null) {
    try {
        if (botId) {
            return await getReplyForBot(botId, triggerWord);
        }
        
        const database = await ensureDatabaseInitialized();
        return await database.collection('replies').findOne({
            trigger_word: triggerWord.toLowerCase()
        });
    } catch (error) {
        console.error(`Error fetching reply for trigger "${triggerWord}":`, error);
        return null;
    }
}

async function getReplyForBot(botId, triggerWord) {
    try {
        const database = await getDatabaseForBot(botId);
        const reply = await database.collection('replies').findOne({
            trigger_word: triggerWord.toLowerCase().trim()
        });
        return reply;
    } catch (error) {
        console.error(`Error getting reply for bot ${botId}:`, error);
        return null;
    }
}

async function saveReply(botId, triggerWord, replyContent, replyType = 'text') {
    try {
        const database = await getDatabaseForBot(botId);
        
        const result = await database.collection('replies').updateOne(
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
        
        console.log(`Reply saved for bot ${botId}, trigger: ${triggerWord}`);
        return result;
    } catch (error) {
        console.error(`Error saving reply for bot ${botId}:`, error);
        throw error;
    }
}

async function deleteReply(triggerWord, botId = null) {
    try {
        const database = botId ? await getDatabaseForBot(botId) : await ensureDatabaseInitialized();
        const result = await database.collection('replies').deleteOne({ 
            trigger_word: triggerWord.toLowerCase() 
        });
        return result.deletedCount > 0;
    } catch (error) {
        console.error('Error deleting reply:', error);
        return false;
    }
}

// Developer Functions
async function isDeveloper(userId) {
    try {
        const database = await ensureDatabaseInitialized();
        const developer = await database.collection('developers').findOne({ user_id: userId });
        return !!developer;
    } catch (error) {
        console.error('Error in isDeveloper:', error);
        return false;
    }
}

async function addDeveloper(userId, username) {
    try {
        const database = await ensureDatabaseInitialized();
        const result = await database.collection('developers').updateOne(
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

// User Statistics
async function getUserStatistics(userId) {
    try {
        const database = await ensureDatabaseInitialized();
        
        const scoreResult = await database.collection('quiz_scores')
            .aggregate([
                { $match: { userId: userId } },
                { $group: { 
                    _id: null, 
                    totalScore: { $sum: "$score" },
                    quizCount: { $sum: 1 }
                }}
            ])
            .toArray();
            
        const correctAnswers = await database.collection('quiz_answers')
            .countDocuments({ userId: userId, isCorrect: true });
            
        const totalAnswers = await database.collection('quiz_answers')
            .countDocuments({ userId: userId });
            
        return {
            totalScore: scoreResult.length > 0 ? scoreResult[0].totalScore : 0,
            quizCount: scoreResult.length > 0 ? scoreResult[0].quizCount : 0,
            correctAnswers: correctAnswers || 0,
            totalAnswers: totalAnswers || 0,
            accuracy: totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0
        };
    } catch (error) {
        console.error('Error getting user statistics:', error);
        return {
            totalScore: 0,
            quizCount: 0,
            correctAnswers: 0,
            totalAnswers: 0,
            accuracy: 0
        };
    }
}

// Export all functions
module.exports = {
    getDb: () => db,
    getClient: () => client,
    connectToMongoDB,
    setupDatabase,
    ensureDatabaseInitialized,
    getDatabaseForBot,
    
    // Quiz functions
    addQuizQuestion,
    getQuizQuestions,
    getQuizCategories,
    getUserStatistics,
    
    // Reply functions
    getReply,
    getReplyForBot,
    saveReply,
    deleteReply,
    
    // Developer functions
    isDeveloper,
    addDeveloper,
    
    // Utility functions
    createMockDatabase
};
