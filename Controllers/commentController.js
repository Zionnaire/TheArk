const mongoose = require("mongoose");
const Comment = require("../Models/comment");
const Post = require("../Models/post");
const Reply = require("../Models/reply");
const logger = require("../Middlewares/logger");
const {
  uploadToCloudinary,
  uploadVideoToCloudinary,
} = require("../Middlewares/cloudinaryUpload");

const commentIo = (io) => {
  // const createComment = async (req, res) => {
  //   try {
  //     const { text } = req.body;
  //     const postId = req.params.postId;
  //     const userId = req.user.id;
  //     let imageUrl = null;
  //     let videoUrl = null;

  //     if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
  //       return res.status(400).json({ error: "Invalid post ID" });
  //     }

  //     const post = await Post.findById(postId);
  //     if (!post) return res.status(404).json({ message: "Post not found" });

  //   //   console.log("Incoming comment body:", req.body);

  //     if (req.file) {
  //       if (req.file.mimetype.startsWith("image")) {
  //         const result = await uploadToCloudinary(
  //           req.file.buffer,
  //           "comments_uploads"
  //         );
  //         imageUrl = result.secure_url;
  //       } else if (req.file.mimetype.startsWith("video")) {
  //         const result = await uploadVideoToCloudinary(
  //           req.file.buffer,
  //           "comments_uploads"
  //         );
  //         videoUrl = result.secure_url;
  //       } else {
  //         return res.status(400).json({ message: "Invalid file type" });
  //       }
  //     }

  //     const user = await User.findById(userId);
  //     if (!user) return res.status(404).json({ message: "User not found" });
  //     if (!text)
  //       return res.status(400).json({ message: "Comment text is required" });

  //     const comment = new Comment({
  //       post: postId,
  //       user: userId,
  //       text,
  //       image: imageUrl,
  //       video: videoUrl,
  //       likes: [],
  //       likesCount: 0,
  //       unlikes: [],
  //       reactions: [],
  //       replies: [],
  //       createdAt: new Date(),
  //     });

  //     post.comments.push(comment._id);
  //     post.comments.length += 1;
  //     await post.save({ validateModifiedOnly: true });
  //     await comment.populate("user", "firstName lastName userName avatar");

  //     await comment.save();

  //     io.to(postId).emit("receive_comment", comment);

  //     res.status(201).json({ message: "Comment added", comment });
  //   } catch (error) {
  //     logger.error(error);
  //     console.error("Content Error:", error.message);
  //     res.status(500).json({ message: error.message });
  //   }
  // };

const replyToComment = async (req, res) => {
  try {
    const { text } = req.body;
    const { commentId } = req.params;
    const userId = req.user.id;
    let imageUrl = null;
    let videoUrl = null;

    // Validate commentId
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ message: "Invalid comment ID" });
    }

    // Find the parent comment
    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Handle media
    const mediaFile = req.files?.media;
    if (mediaFile) {
      if (mediaFile.mimetype.startsWith("image")) {
        const result = await uploadToCloudinary(mediaFile.data, 'comments_uploads');
        imageUrl = result.secure_url;
      } else if (mediaFile.mimetype.startsWith("video")) {
        const result = await uploadVideoToCloudinary(mediaFile.data, 'comments_uploads');
        videoUrl = result.videoUrl;
      }
    }

    // 🔥 Create reply in DB
    const reply = await Reply.create({
      user: userId,
      text,
      image: imageUrl,
      video: videoUrl,
      comment: commentId, // Link to parent comment
    });

    // 🔁 Push reply ID into parent comment
    parentComment.replies.push(reply._id);
    await parentComment.save();

    // Emit via socket to update the parent comment
    // await reply.populate("user", "firstName lastName userName avatar");
    io.to(parentComment.post.toString()).emit('receive_reply', reply);

    return res.status(201).json({ message: 'Reply added', reply });

  } catch (error) {
    logger.error(error);
    console.error('Server Error:', error.message);
    res.status(500).json({ message: error.message });
  }
};


  const editComment = async (req, res) => {
    try {
      const { commentId, text } = req.body;
      const userId = req.user.id;

      const comment = await Comment.findById(commentId);
      if (!comment)
        return res.status(404).json({ message: "Comment not found" });

      if (comment.user.toString() !== userId) {
        return res
          .status(403)
          .json({ message: "Unauthorized to edit this comment" });
      }

      comment.text = text;
      await comment.save();

      io.to(comment.post).emit("comment_updated", comment);

      res.status(200).json({ message: "Comment updated", comment });
    } catch (error) {
      logger.error(error);
      console.error("Content Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  };

  const deleteComment = async (req, res) => {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;

      const comment = await Comment.findById(commentId);
      if (!comment)
        return res.status(404).json({ message: "Comment not found" });

      if (comment.user.toString() !== userId && req.user.role !== "admin") {
        return res
          .status(403)
          .json({ message: "Unauthorized to delete this comment" });
      }

      const postId = comment.post;
      await comment.deleteOne();

      io.to(postId).emit("comment_deleted", commentId);

      res.status(200).json({ message: "Comment deleted" });
    } catch (error) {
      logger.error(error);
      console.error("Content Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  };

const likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    comment.likes.forEach((likeObj, i) => {
  if (!likeObj.user) {
    console.warn(`Warning: like at index ${i} missing user field!`, likeObj);
  }
});

    // Safe check for user inside likes array
    const hasLiked = comment.likes.some(
      (likeObj) => likeObj.user && likeObj.user.toString() === userId
    );

    let updateQuery;
    if (hasLiked) {
      updateQuery = { $pull: { likes: { user: userId } } };
    } else {
      updateQuery = { $addToSet: { likes: { user: userId } } };
    }

    const updatedComment = await Comment.findByIdAndUpdate(
      commentId,
      updateQuery,
      { new: true }
    ).populate("user", "firstName lastName userName avatar")
  .populate("post");

    // Update likesCount for fast access
    updatedComment.likesCount = updatedComment.likes.length;
    await updatedComment.save();

    updatedComment.likes.forEach((likeObj, i) => {
      if (!likeObj.user) {
        console.warn(`Warning: like at index ${i} missing user field!`, likeObj);
      }
    });

    const likedByUser = updatedComment.likes.some(
      (likeObj) => likeObj.user && likeObj.user.toString() === userId
    );
    console.log("User ID:", userId);
    console.log("Updated Comment Likes:", updatedComment.likes);
    console.log("Liked by User:", likedByUser);

   const postIdStr = updatedComment.post
  ? typeof updatedComment.post === "string"
    ? updatedComment.post
    : updatedComment.post._id
      ? updatedComment.post._id.toString()
      : updatedComment.post.toString()
  : null;

  console.log("Post ID String:", postIdStr);
  

if (!postIdStr) {
  console.warn("No valid postId found on updatedComment, skipping socket emit");
} else {
  req.io.to(postIdStr).emit("update_comment_like", {
    commentId: updatedComment._id,
    likesCount: updatedComment.likesCount,
    likedByUser,
  });
}


    return res.status(200).json({
      message: hasLiked ? "Comment unliked" : "Comment liked",
      comment: updatedComment,
      likedByUser,
    });
  } catch (error) {
    console.error("Like Comment Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};



  const reactToComment = async (req, res) => {
    try {
      const { commentId, reaction } = req.body;
      const userId = req.user.id;

      const comment = await Comment.findById(commentId);
      if (!comment)
        return res.status(404).json({ message: "Comment not found" });

      // Check if the user has already reacted
      const existingReaction = comment.reactions.find(
        (r) => r.user.toString() === userId
      );

      if (existingReaction) {
        existingReaction.type = reaction; // Update existing reaction
      } else {
        comment.reactions.push({ user: userId, type: reaction }); // Add new reaction
      }

      await comment.save(); // Save the updated comment

      // Emit real-time reaction update
      io.to(comment.post).emit("update_comment_reaction", {
        commentId,
        reactions: comment.reactions,
      });

      res
        .status(200)
        .json({ message: "Reaction updated", reactions: comment.reactions });
    } catch (error) {
      logger.error(error);
      console.error("Content Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  };

  const searchComments = async (req, res) => {
    try {
      const { query } = req.query;

      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }

      // Search comments using MongoDB's text index
      const comments = await Comment.find({ $text: { $search: query } })
        .populate("user", "username firstName lastName userImage")
        .populate({
          path: "replies",
          populate: {
            path: "user",
            select: "username firstName lastName userImage",
          },
        })
        .sort({ createdAt: -1 }); // Sort by newest first

      res.status(200).json({ comments });
    } catch (error) {
      logger.error(error);
      console.error("Content Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  };

  const getFilteredComments = async (req, res) => {
    try {
      const { postId } = req.params;
      const { sort } = req.query; // Expected values: "newest" or "oldest"

      const sortOrder = sort === "oldest" ? 1 : -1; // Ascending for oldest, Descending for newest

      const comments = await Comment.find({ post: postId })
        .populate("user", "username firstName lastName userImage")
        .populate({
          path: "replies",
          populate: {
            path: "user",
            select: "username firstName lastName userImage",
          },
        })
        .sort({ createdAt: sortOrder }); // Sorting

      res.status(200).json({ comments });
    } catch (error) {
      logger.error(error);
      console.error("Content Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  };

  const getMostLikedComments = async (req, res) => {
    try {
      const { postId } = req.params;

      const comments = await Comment.find({ post: postId })
        .populate("user", "username firstName lastName userImage")
        .populate({
          path: "replies",
          populate: {
            path: "user",
            select: "username firstName lastName userImage",
          },
        })
        .sort({ "likes.length": -1 }); // Sort by most liked first

      res.status(200).json({ comments });
    } catch (error) {
      logger.error(error);
      console.error("Content Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  };

  const getUserComments = async (req, res) => {
    try {
      const { userId } = req.params;

      const comments = await Comment.find({ user: userId })
        .populate("user", "username firstName lastName userImage")
        .populate({
          path: "replies",
          populate: {
            path: "user",
            select: "username firstName lastName userImage",
          },
        })
        .sort({ createdAt: -1 });

      res.status(200).json({ comments });
    } catch (error) {
      logger.error(error);
      console.error("Content Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  };


  const reportComment = async (req, res) => {
    try {
      const { commentId, reason } = req.body;
      const userId = req.user.id;

      // Prevent duplicate reports from the same user
      const existingReport = await Report.findOne({
        comment: commentId,
        reportedBy: userId,
      });
      if (existingReport) {
        return res
          .status(400)
          .json({ message: "You have already reported this comment" });
      }

      const report = new Report({
        comment: commentId,
        reportedBy: userId,
        reason,
      });
      await report.save();

      res
        .status(201)
        .json({ message: "Report submitted successfully", report });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

  return {
    
    replyToComment,
    editComment,
    deleteComment,
    likeComment,
    reactToComment,
    searchComments,
    getFilteredComments,
    getMostLikedComments,
    getUserComments,
    reportComment,
  };
};

module.exports = commentIo;
