const mongoose = require('mongoose');

const cloneSchema = new mongoose.Schema({
  token: String,
  ownerId: Number,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Clone', cloneSchema);
