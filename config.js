require('dotenv').config();

module.exports = {
    // Bot configuration
    token: process.env.BOT_TOKEN || '7511592050:AAH1IMH8kG6UolhwwzIOW-Pf2UUM04hEdTM',
    
    // MongoDB configuration
    mongoUri: process.env.MONGODB_URI || 'mongodb+srv://Amr:NidisuSI@cluster0.ay6fa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
    dbName: process.env.DB_NAME || 'replays',
    
    // Database mode: only MongoDB
    dbMode: 'mongodb',
    
    // Developer IDs
    developerIds: new Set([process.env.PRIMARY_DEVELOPER_ID || '7308214106']),
    
    // Cloudinary configuration
    cloudinary: {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dpxowt5m5',
        api_key: process.env.CLOUDINARY_API_KEY || '248273337268518',
        api_secret: process.env.CLOUDINARY_API_SECRET || 'SihooJWz6cMi5bNDAU26Tmf-tIw'
    }
};