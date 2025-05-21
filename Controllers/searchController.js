const Post = require("../Models/post");
const Comment = require("../Models/comment");
const User = require("../Models/user");
const Church = require("../Models/churchesAdmin");

// Search across Users, Posts, and Comments
const search = async (req, res) => {
  try {
    const { query } = req.query; // Get search query from request

    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }

    // Search churches by name
    const churches = await Church.find(
      { name: { $regex: query, $options: "i" } },
      { name: 1, email: 1 }
    );

    // Search Users by name or username
    const users = await User.find(
      {
        $or: [
          { name: { $regex: query, $options: "i" } },
          { username: { $regex: query, $options: "i" } },
        ],
      },
      { name: 1, email: 1 }
    );

    // Search Posts by content
    const posts = await Post.find(
      { $text: { $search: query } },
      { score: { $meta: "textScore" } }
    ).sort({ score: { $meta: "textScore" } });

    // Search Comments by text
    const comments = await Comment.find(
      { $text: { $search: query } },
      { score: { $meta: "textScore" } }
    ).sort({ score: { $meta: "textScore" } });

    res.status(200).json({churches, users, posts, comments });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = { search };