require('dotenv').config(); // <--- load .env first
const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

const botB = new Telegraf(process.env.BOTB_TOKEN); // <--- clean and safe

botB.launch(); // optional but good to avoid timeout

app.post('/check-subscription', async (req, res) => {
    const { userId, channels } = req.body;
    let subscribed = true;

    for (const channelId of channels) {
        try {
            const chatMember = await Promise.race([
                botB.telegram.getChatMember(channelId, userId),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout from Telegram')), 3000)
                )
            ]);

            if (!['member', 'administrator', 'creator'].includes(chatMember.status)) {
                subscribed = false;
                break;
            }
        } catch (error) {
            console.error(`❌ Failed to check ${channelId} for ${userId}:`, error.message);
            subscribed = false;
            break;
        }
    }

    res.json({ subscribed });
});
app.get('/ping', (req, res) => {
    res.send('pong');
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bot B server running on port ${PORT}`);
});
