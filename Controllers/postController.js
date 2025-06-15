const mongoose = require('mongoose');
const Post = require("../Models/post");
const User = require("../Models/user");
const Comment = require("../Models/comment");
const { uploadToCloudinary, uploadVideoToCloudinary } = require("../Middlewares/cloudinaryUpload");
const logger = require("../Middlewares/logger");

const postIo = (io) => {

// Create a Post
const createPost = async (req, res) => {
    try {
        const { content } = req.body;
        const userId = req.user._id;
        let images = [];
        let videos = [];

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

 // Handle images
let imageFiles = req.files?.images;
if (imageFiles && !Array.isArray(imageFiles)) {
  imageFiles = [imageFiles];
}
if (imageFiles) {
  for (const file of imageFiles) {
    const result = await uploadToCloudinary(file.data, 'post_uploads'); // use .data for buffer
    images.push({ url: result.secure_url, cld_id: result.public_id });
  }
}

// Handle videos
let videoFiles = req.files?.videos;
if (videoFiles && !Array.isArray(videoFiles)) {
  videoFiles = [videoFiles];
}
if (videoFiles) {
  for (const file of videoFiles) {
    const result = await uploadVideoToCloudinary(file.data, 'post_uploads'); // use .data for buffer
    videos.push({ url: result.videoUrl, cld_id: result.videoCldId });
  }
}


        const post = new Post({
            user: userId,
            content,
            images,
            videos,
            comments: [],
            likes: [],
            unlikes: [],
            reactions: [],
            commentCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await user.save({validateBeforeSave: false});
        await post.save();

        res.status(201).json({ message: "Post created successfully", post });
    } catch (error) {
        logger.error(error.message);
        res.status(500).json({ message: error.message });
    }
};

// Search & filter posts
const getPosts = async (req, res) => {
    try {
        const { search, user, startDate, endDate, sort, reaction } = req.query;
        let query = {};

        if (search) {
            query.$text = { $search: search };
        }
        if (user) {
            query.user = user;
        }
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        if (reaction) {
            query["reactions.type"] = reaction;
        }

        let sortOptions = { createdAt: -1 };
        if (sort === "likes") sortOptions = { likes: -1 };
        if (sort === "comments") sortOptions = { comments: -1 };

        const posts = await Post.find(query).populate("user", "username").sort(sortOptions);
        res.status(200).json({ posts });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get All Posts
const getAllPosts = async (req, res) => {
    try {
        const posts = await Post.find()
            .populate("user", "username firstName lastName userImage _id")
            .sort({ createdAt: -1 });
        res.status(200).json({ posts });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Edit a Post
const editPost = async (req, res) => {
  try {
    const { content } = req.body;
    const { postId } = req.params;

    // console.log("📥 HIT EDIT POST ROUTE");
    // console.log("📌 Received Post ID:", postId);
    // console.log("🙋🏽 Logged-in User:", req.user);

    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      // console.log(" Unauthorized: Missing user");
      return res.status(401).json({ message: "Unauthorized: Missing user" });
    }

    const loggedInUserId = req.user._id;

    // Validate Post ID format
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      // console.log(" Invalid Post ID format");
      return res.status(400).json({ message: "Invalid Post ID" });
    }

    // Fetch post from DB
    const post = await Post.findById(postId);
    // console.log("🔍 Found Post:", post);

    if (!post) {
      // console.log(" Post not found in DB");
      return res.status(404).json({ message: "Post not found" });
    }

    const postOwnerId = post.user?._id?.toString?.() || post.user?.toString?.();

    // Authorization check
    if (postOwnerId !== loggedInUserId.toString()) {
      // console.log(" Unauthorized: User doesn't own this post");
      return res.status(403).json({ message: "Unauthorized to edit this post" });
    }

    // Update post content
    post.content = content;
    await post.save();

    // console.log(" Post updated successfully:", post._id);
    return res.status(200).json({ message: "Post updated successfully", post });

  } catch (error) {
    console.error(" Edit post error:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

// Create a Comment
  const createComment = async (req, res) => {
    try {
      const { text } = req.body;
      const postId = req.params.postId;
      const userId = req.user._id;
      let imageUrl = null;
      let videoUrl = null;

      if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      const post = await Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 } });

      // console.log("Post found:", post);
      // console.log("Post ID:", postId);
      if (!post) return res.status(404).json({ message: "Post not found" });

      // console.log("Incoming comment body:", req.body);

      if (req.file) {
        if (req.file.mimetype.startsWith("image")) {
          const result = await uploadToCloudinary(
            req.file.buffer,
            "comments_uploads"
          );
          imageUrl = result.secure_url;
        } else if (req.file.mimetype.startsWith("video")) {
          const result = await uploadVideoToCloudinary(
            req.file.buffer,
            "comments_uploads"
          );
          videoUrl = result.secure_url;
        } else {
          return res.status(400).json({ message: "Invalid file type" });
        }
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!text)
        return res.status(400).json({ message: "Comment text is required" });

      const comment = new Comment({
        post: postId,
        user: userId,
        text,
        image: imageUrl,
        video: videoUrl,
        likes: [],
        likesCount: 0,
        commentCount: 0,
        unlikes: [],
        reactions: [],
        replies: [],
        createdAt: new Date(),
      });

      post.comments.push(comment._id);
      post.commentCount += 1;
      comment.commentCount = post.commentCount;
      await comment.populate("user", "firstName lastName userName avatar");

      await comment.save();
      await post.save({ validateModifiedOnly: true });


      io.to(postId).emit("receive_comment", {
  post: {
    ...post.toObject(),
    comments: post.comments,
  },
  commentCount: post.commentCount,
  post: postId,
});
      // console.log("Comment added to post:", "Comment:", comment.text,  post.commentCount, comment.commentCount); // Log the comment details

res.status(201).json({
  message: "Comment added",
  comment,
  postId: postId || post._id,
  commentCount: post.commentCount, // 👈 Add this line
});
      // console.log("Comment added successfully", comment, post);
    } catch (error) {
      logger.error(error);
      console.error("Content Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  };
const getCommentsForPost = async (req, res) => {
  try {
    const { postId } = req.params;

    // console.log("postId from params:", req.params.postId);

    const { page = 1, limit = 10 } = req.query;

    // console.log("Fetching comments for post:", postId);
    // console.log("Post ID from props or context or wherever:", postId);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post ID" });
    }

    const comments = await Comment.find({ post: postId, parentComment: null })
      .populate("user", "username firstName lastName userImage")
      .populate({
        path: "replies",
        populate: {
          path: "user",
          select: "username firstName lastName userImage",
        },
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((page - 1) * limit);

    res.status(200).json({ comments, page, limit });
  } catch (error) {
    console.error("Error fetching comments:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// Delete a Post
const deletePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user._id;

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        if (post.user.toString() !== userId && req.user.role !== "admin") {
            return res.status(403).json({ message: "Unauthorized to delete this post" });
        }

        // Delete images from Cloudinary
        for (let image of post.images) {
            await uploadToCloudinary.destroy(image.cld_id);
        }

        // Delete videos from Cloudinary
        for (let video of post.videos) {
            await uploadVideoToCloudinary.destroy(video.cld_id, { resource_type: "video" });
        }

        await post.deleteOne();
        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Like/Unlike a Post
const likePost = async (req, res) => {
    try {
        const { postId } = req.body;
        const userId = req.user._id;

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        const index = post.likes.findIndex(like => like.user.toString() === userId);
        if (index === -1) {
            post.likes.push({ user: userId });
        } else {
            post.likes.splice(index, 1);
        }
        await post.save();

        res.status(200).json({ message: index === -1 ? "Post liked" : "Post unliked", post });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Unlike a Post
const unlikePost = async (req, res) => {
    try {
        const { postId } = req.body;
        const userId = req.user._id;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });
        const index = post.likes.findIndex(like => like.user.toString() === userId);
        if (index !== - 1) {
            post.likes.splice(index, 1);
        }
        await post.save();
        res.status(200).json({ message: "Post unliked", post });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// React to a Post
const reactToPost = async (req, res) => {
    try {
        const { postId, reaction } = req.body;
        const userId = req.user._id;

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        // Remove existing reaction from the same user
        post.reactions = post.reactions.filter(r => r.user.toString() !== userId);

        // Add new reaction
        post.reactions.push({ user: userId, type: reaction });
        await post.save();

        res.status(200).json({ message: "Reaction added", post });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get Post by ID
const getPostById = async (req, res) => {
    try {
        const { postId } = req.params;
        const post = await Post.findById(postId)
            .populate("user", "username firstName lastName userImage")
            .populate({
                path: "comments",
                populate: {
                    path: "user",
                    select: "username firstName lastName userImage",
                },
            });
            if (!post) return res.status(404).json({ message: "Post not found" });
            res.status(200).json({ post });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}
// Get User Posts
const getUserPosts = async (req, res) => {
  const { userId } = req.params;

  if (!userId || userId.trim() === "") {
    return res.status(400).json({ message: "Missing or invalid userId in request parameters." });
  }

  try {
    const posts = await Post.find({ user: userId })
      .populate("user", "firstName lastName userName bio userImage")
      .sort({ createdAt: -1 });

    return res.status(200).json({ posts });
  } catch (error) {
    console.error("❌ Failed to fetch user posts:", error);
    return res.status(500).json({ message: "Server error while fetching user posts." });
  }
};


const filterPosts = async (req, res) => {
    try {
      const { unit, minLikes, maxLikes, startDate, endDate } = req.query;
  
      let filter = {};
  
      if (unit) {
        filter.unit = unit;
      }
  
      if (minLikes || maxLikes) {
        filter.likes = {
          ...(minLikes && { $gte: parseInt(minLikes) }),
          ...(maxLikes && { $lte: parseInt(maxLikes) }),
        };
      }
  
      if (startDate || endDate) {
        filter.createdAt = {
          ...(startDate && { $gte: new Date(startDate) }),
          ...(endDate && { $lte: new Date(endDate) }),
        };
      }
  
      const posts = await Post.find(filter).sort({ createdAt: -1 });
      res.status(200).json({ posts });
    } catch (error) {
      console.error("Filtering error:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  };
  
  return {
    createPost,
    getPosts,
    getAllPosts,
    editPost,
    deletePost,
    likePost,
    unlikePost,
    reactToPost,
    getPostById,
    filterPosts,
    createComment,
    getCommentsForPost,
    getUserPosts
  };

};
module.exports = postIo;
