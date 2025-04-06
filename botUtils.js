const mongoose = require('mongoose');

const cloneSchema = new mongoose.Schema({
  token: String,
  ownerId: Number,
  createdAt: { type: Date, default: Date.now },
  activatedAt: Date,
  expiresAt: Date,
  isActive: { type: Boolean, default: false },
});

const Clone = mongoose.model('Clone', cloneSchema);

async function checkAndUpdateActivation(cloneId, userId) {
  const clone = await Clone.findOne({ token: cloneId });
  
  if (!clone) {
    return { status: 'not_found', message: 'Bot not found.' };
  }

  const now = new Date();

  if (!clone.activatedAt || now > clone.expiresAt) {
    // Bot needs activation or reactivation
    clone.activatedAt = now;
    clone.expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    clone.isActive = true;
    await clone.save();
    return { status: 'activated', message: 'Bot activated for 30 days.' };
  } else {
    // Bot is already active
    const daysLeft = Math.ceil((clone.expiresAt - now) / (24 * 60 * 60 * 1000));
    return { status: 'active', message: `Bot is active. ${daysLeft} days left.` };
  }
}

module.exports = {
  checkAndUpdateActivation
};