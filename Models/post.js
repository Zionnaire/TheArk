const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      index: "text",
    },
    images: [
      {
        url: { type: String },
        cld_id: { type: String },
      },
    ],
    videos: [
      {
        url: { type: String },
        cld_id: { type: String },
      },
    ],
    likes: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    unlikes: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        type: {
          type: String,
          enum: [
            "like",
            "love",
            "haha",
            "wow",
            "sad",
            "angry",
            "care",
            "support",
            "celebrate",
            "thankful",
          ],
        },
      },
    ],
    comments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Comment",
      },
    ],
    commentCount: {
      type: Number,
      default: 0,
    },
    visibility: {
      type: String,
      enum: ["public", "private", "friends"],
      default: "public",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for like count
postSchema.virtual("likeCount").get(function () {
  return this.likes?.length || 0;
});

// Full-text search index
postSchema.index({ content: "text" });

// Auto-populate user basic fields when fetching posts
postSchema.pre(/^find/, function (next) {
  this.populate("user", "firstName lastName userName bio userImage");
  next();
});


module.exports = mongoose.model("Post", postSchema);
