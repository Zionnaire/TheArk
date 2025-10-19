const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema({
    messageText: {
        type: String,
        required: true
    },
    attachments: [{
        url: String,
        cld_id: String,
        type: String,
        uri: String
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },

    audience: {
        type: String,
        enum: ["general", "church", "unit", "department"],
        required: true,
    },
    audienceId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null, // null for "general" or "church"
    },
    readBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        readAt: {
            type: Date,
            default: Date.now
        },
    }],
    contentType: {
        type: String,
        enum: ["announcement"],
        default: "announcement",
    },
    deletedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    }],
}, {
    timestamps: true, // gives you createdAt & updatedAt
});

module.exports = mongoose.model("Announcement", announcementSchema);
