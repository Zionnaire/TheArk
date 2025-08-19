const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false // Optional for admin announcements
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' }, // 👈 CRITICAL
    type: {
      type: String,
      required: true,
      enum: [
        "message",
        "message_reaction",
        "friend_request",
        "friend_request_accepted",
        "new_post",
        "comment_on_post",
        "post_like",
        "reply_to_comment",
        "admin_announcement",
        "event_reminder"
      ]
    },
    message: {
      type: String,
      required: true
    },
    read: {
      type: Boolean,
      default: false
    },
    referenceModel: {
      type: String,
      enum: [
        "Post",
        "Comment",
        "Message",
        "FriendRequest",
        "Reply",
        "Reaction"
      ]
    },
    chatContext: {
      chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
      model: { type: String, enum: ["PrivateChat", "UnitChat", "DepartmentChat", "GeneralChat"] },
      type: { type: String, enum: ["private", "unit", "department", "general"] },
      name: String,
      image: [{
        url: { type: String, required: true },
        cld_id: { type: String },
        type: { type: String },
        size: { type: Number },
        name: { type: String },
      }],
      recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Added for private chats
       recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false // Optional for admin announcements
    },
    },
    friendRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FriendRequest"
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

// Compound index for optimized read/unread lookup per recipient
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);