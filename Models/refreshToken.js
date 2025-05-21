const mongoose = require("mongoose");

const RefreshToken = mongoose.model("RefreshToken", new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  churchId: mongoose.Schema.Types.ObjectId,
  token: String,
  expiresAt: Date,
}));

module.exports = RefreshToken;
