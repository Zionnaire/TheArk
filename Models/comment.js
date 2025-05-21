const mongoose = require("mongoose");
const { any } = require("../Middlewares/upload");
const commentSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true, // Index for faster post-based queries
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Index for user-based queries
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    replies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reply", // Reference to a separate reply collection
      },
    ],
 likes: [
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    _id: false,
  },
],


    likesCount: {
      type: Number,
      default: 0,
    },
    unlikes: [
      {
        user: { 
          type: mongoose.Schema.Types.ObjectId, 
          ref: "User",
        },
      },
    ],
    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        
        },
        type: {
          type: String,
          enum: ["like", "love", "haha", "wow", "sad", "angry"], 
        },
      },
    ],
  },
  { timestamps: true }
);

// Compound Index to Speed Up Queries on Reactions
commentSchema.index({ "reactions.user": 1 });
commentSchema.index({ text: "text" }); // Enables full-text search on comments

module.exports = mongoose.model("Comment", commentSchema);
