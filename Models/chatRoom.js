const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: String },
  lastMessageTimestamp: { type: Date },
  isGroupChat: { type: Boolean, default: false },
  type: {
    type: String,
    enum: ["private", "unit", "department", "general"],
    required: true
  },
  post: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Post'
}

}, 
{ timestamps: true }); 

const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);

module.exports = ChatRoom;
