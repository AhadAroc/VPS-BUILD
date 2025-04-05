const mongoose = require('mongoose');

const CloneSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  expiresAt: Date // Optional expiration time
});

module.exports = mongoose.model('Clone', CloneSchema);
