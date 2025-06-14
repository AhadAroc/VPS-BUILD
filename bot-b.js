require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.path}`, 
                req.body ? JSON.stringify(req.body) : '');
    next();
});

const botB = new Telegraf(process.env.BOTB_TOKEN);

// Add error handling for bot launch
botB.launch()
    .then(() => console.log('✅ Bot B launched successfully'))
    .catch(err => console.error('❌ Bot B launch failed:', err));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/ping', (req, res) => {
    console.log('🏓 Ping received');
    res.send('pong');
});

app.post('/check-subscription', async (req, res) => {
    const startTime = Date.now();
    const { userId, channels } = req.body;
    
    console.log(`🔍 Checking subscription for user ${userId} in channels: ${channels?.join(', ')}`);
    
    // Validate request
    if (!userId || !channels || !Array.isArray(channels)) {
        console.log('❌ Invalid request data');
        return res.status(400).json({ 
            error: 'Invalid request', 
            subscribed: false 
        });
    }
    
    let subscribed = true;
    const results = [];

    for (const channelId of channels) {
        try {
            console.log(`🔍 Checking channel ${channelId} for user ${userId}`);
            
            const chatMember = await Promise.race([
                botB.telegram.getChatMember(channelId, userId),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Telegram API timeout')), 4000)
                )
            ]);

            const isSubscribed = ['member', 'administrator', 'creator'].includes(chatMember.status);
            results.push({ channelId, status: chatMember.status, subscribed: isSubscribed });
            
            console.log(`📊 Channel ${channelId}: status=${chatMember.status}, subscribed=${isSubscribed}`);
            
            if (!isSubscribed) {
                subscribed = false;
                break; // Early exit if not subscribed to any channel
            }
        } catch (error) {
            console.error(`❌ Failed to check channel ${channelId} for user ${userId}:`, error.message);
            results.push({ channelId, error: error.message, subscribed: false });
            subscribed = false;
            break;
        }
    }

    const responseTime = Date.now() - startTime;
    console.log(`✅ Subscription check completed in ${responseTime}ms. Result: ${subscribed}`);
    
    res.json({ 
        subscribed, 
        results, 
        responseTime,
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('💥 Express error:', error);
    res.status(500).json({ error: 'Internal server error', subscribed: false });
});

// Handle 404
app.use((req, res) => {
    console.log(`❓ 404 - ${req.method} ${req.path}`);
    res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 10001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Bot B server running on port ${PORT}`);
    console.log(`📊 Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`🏓 Ping: http://0.0.0.0:${PORT}/ping`);
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    botB.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    botB.stop('SIGTERM');
    process.exit(0);
});
