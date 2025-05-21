const mongoose = require("mongoose");

const replySchema = new mongoose.Schema(
  {
    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      required: true,
      index: true, // Index for faster comment-based searches
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Index for user-based queries
    },

    //Can reply with text or image or video
    image: {
      type: String,
      trim: true,
    },
    video: {
      type: String,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    likes: [
      {
        user: { 
          type: mongoose.Schema.Types.ObjectId, 
          ref: "User",
        },
      },
    ],
    unlikes: [
      {
        user: { 
          type: mongoose.Schema.Types.ObjectId, 
          ref: "User",
        },
      },
    ],
  },
  { timestamps: true }
);

// Add compound index for filtering efficiency
replySchema.index({ comment: 1, user: 1 }, { unique: true, sparse: true });
replySchema.index({ _id: 1, 'likes.user': 1 }, { unique: true, sparse: true });
replySchema.index({ _id: 1, 'unlikes.user': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Reply", replySchema);
