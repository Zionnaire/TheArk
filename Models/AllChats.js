const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  chatType: {
    type: String,
    enum: ['private', 'unit', 'department', 'general'],
    index: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() { return this.chatType !== 'general'; }
  }],
  privateChatRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrivateChat',
    required: function() { return this.chatType === 'private'; }
  },
  unit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    required: function() { return this.chatType === 'unit'; }
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department', // Changed from DepartmentChat to Department
  },
  generalChatRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GeneralChat',
    required: function() {return this.chatType === 'general'; }
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  lastMessageSender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lastMessageText: {
    type: String,
    default: ''
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  unreadCounts: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    count: {
      type: Number,
      default: 0
    }
  }],
  name: {
    type: String,
  },
  description: {
    type: String,
  },
  image: {
    type: String,
  },
}, {
  timestamps: true
});

// CRITICAL FIX: Check if the model already exists before compiling it to prevent OverwriteModelError
const Chat = mongoose.models.Chat || mongoose.model('Chat', chatSchema);

module.exports = Chat;