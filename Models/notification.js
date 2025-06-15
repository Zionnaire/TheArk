const mongoose = require("mongoose");
const notificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // The user who receives the notification
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }, // The user who triggered the notification (e.g., sent a message)
    type: { type: String, required: true, enum: ['message', 'reaction', 'friendRequest', 'announcement', 'event', 'post'] }, // Type of notification
    message: { type: String, required: true }, // The display message for the notification
    read: { type: Boolean, default: false }, // Whether the user has read it
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: false }, // ID of the related entity (e.g., messageId, chatId, requestId)
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: false }, // If notification is chat-related
    // Add more fields as needed for specific notification types
    // e.g., friendRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'FriendRequest' }
}, { timestamps: true });

// module.exports = mongoose.model('Notification', notificationSchema);

module.exports = mongoose.model("Notification", notificationSchema);
