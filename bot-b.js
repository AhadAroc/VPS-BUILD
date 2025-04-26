const express = require('express');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

const botB = new Telegraf('8044558556:AAFcF-AsSGgY4luoDdGh5Kt3s2UxGxTxsQw');


app.post('/check-subscription', async (req, res) => {
    const { userId, channels } = req.body;
    let subscribed = true;

    for (const channelId of channels) {
        try {
            const chatMember = await botB.telegram.getChatMember(channelId, userId);
            if (!['member', 'administrator', 'creator'].includes(chatMember.status)) {
                subscribed = false;
                break;
            }
        } catch (error) {
            console.error(`Error checking subscription for channel ${channelId}:`, error);
            subscribed = false;
            break;
        }
    }

    res.json({ subscribed });
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
    console.log(`Bot B server running on port ${PORT}`);
});
