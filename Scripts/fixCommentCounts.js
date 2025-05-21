require("dotenv").config();
const mongoose = require("mongoose");
const Post = require("../Models/post");
const Comment = require("../Models/comment");

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const posts = await Post.find();

   for (const post of posts) {
  const realCommentCount = await Comment.countDocuments({ post: post._id });
  console.log(`Post ${post._id} real count:`, realCommentCount);
  post.commentCount = realCommentCount;
  await post.save();
  console.log(`Post ${post._id} updated count:`, post.commentCount);
}

    console.log("✅ All comment counts synced!");
    process.exit(0);
  } catch (err) {
    console.error("Error syncing counts:", err);
    process.exit(1);
  }
})();
