const mongoose = require('mongoose');

const CloneSchema = new mongoose.Schema({
    botToken: String,
    userId: String,
    username: String,
    createdAt: Date,
    statistics: {
        messagesProcessed: Number,
        commandsExecuted: Number
    }
});

const Clone = mongoose.model('Clone', CloneSchema);

module.exports = { Clone };
