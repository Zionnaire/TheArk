// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true,
        index: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    messageText: {
        type: String,
        trim: true,
    },
    attachments: [{
        url: { type: String, required: true },
        cld_id: { type: String, required: true },
        type: { type: String, required: true }, // 'image', 'video', etc.
        size: { type: Number },
        name: { type: String },
    }],
    reactions: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        type: { type: String, required: true },
    }],
    readBy: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
    }],
    status: {
        type: String,
        enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
        default: 'sent',
    },
    contentType: {
        type: String,
        enum: [
            'text',
            'image',
            'video',
            'file',
            'audio',
            'system',
            'reaction_only',
            'announcement' // 👈 new type for announcements
        ],
        default: 'text',
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
    },

    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // 🔑 NEW FIELDS FOR HYBRID ANNOUNCEMENTS
    isAnnouncement: {
        type: Boolean,
        default: false,
    },
    announcementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Announcement',
        default: null,
    },
}, { timestamps: true });

// Indexes
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1, chat: 1 });

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
