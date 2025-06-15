// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    // Link to the generic Chat document (the conversation instance)
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat', // Refers to your new generic Chat model
        required: true,
        index: true // Index for efficient message retrieval by chat
    },
    // The user who sent this specific message
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Index for efficient retrieval of messages by a sender
    },
    // The actual text content of the message (optional for attachments-only messages)
    messageText: {
        type: String,
        trim: true,
    },
    // Array of attachments (images, files, etc.)
    attachments: [{
        url: { type: String, required: true },
        cld_id: { type: String, required: true }, // Cloudinary ID
        type: { type: String, required: true }, // e.g., 'image', 'video', 'file', 'audio'
        size: { type: Number }, // File size in bytes
        name: { type: String }, // Original file name
    }],
    // Reactions to this message (e.g., emojis)
    reactions: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        type: { type: String, required: true }, // e.g., 'like', 'love', 'haha', 'thumbs_up' (use a broader string if needed)
    }],
    // Read status for each participant in the chat (for detailed read receipts)
    readBy: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
    }],
    // Optional: Message status (e.g., 'sent', 'delivered', 'read', 'failed')
    status: {
        type: String,
        enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
        default: 'sent', // Default to 'sent' when saved to DB
    },
    // Optional: Type of message content (e.g., 'text', 'attachment', 'reaction_only', 'system')
    contentType: {
        type: String,
        enum: ['text', 'image', 'video', 'file', 'audio', 'system', 'reaction_only'],
        default: 'text',
    },
    // Optional: Reference to a parent message for replies/threads
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    },
}, { timestamps: true }); // Mongoose will add `createdAt` and `updatedAt`

// Indexes for common queries
messageSchema.index({ chat: 1, createdAt: -1 }); // Get messages for a chat, newest first
messageSchema.index({ sender: 1, chat: 1 }); // Get messages sent by a specific user in a chat

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;