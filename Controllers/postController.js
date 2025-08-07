const mongoose = require('mongoose');
const Post = require("../Models/post");
const User = require("../Models/user");
const Comment = require("../Models/comment");
const ChatRoom = require("../Models/chatRoom")
const ChatMessage = require("../Models/messages")
const Notification = require("../Models/notification")
const { uploadToCloudinary, uploadVideoToCloudinary, deleteFromCloudinary } = require("../Middlewares/cloudinaryUpload");
const logger = require("../Middlewares/logger");

const postIo = (io) => {
    // Helper function to create and emit notifications
  const createAndEmitNotification = async (req, recipientId, senderId, type, message, title, referenceId, chat = null) => {
    try {
      const notification = new Notification({
        type,
        recipient: recipientId,
        sender: senderId,
        message,
        title,
        referenceId,
        chat,
        read: false,
        createdAt: new Date()
      });
      await notification.save();

      const populatedNotification = await Notification.findById(notification._id)
        .populate("sender", "firstName lastName userName userImage");

      req.io?.to(recipientId.toString()).emit("newNotification", {
        _id: populatedNotification._id.toString(),
        type: populatedNotification.type,
        message: populatedNotification.message,
        read: populatedNotification.read,
        title: populatedNotification.title,
        createdAt: populatedNotification.createdAt.toISOString(),
        sender: {
          _id: populatedNotification.sender?._id.toString(),
          userName: populatedNotification.sender?.userName || '',
          firstName: populatedNotification.sender?.firstName || '',
          lastName: populatedNotification.sender?.lastName || '',
          userImage: populatedNotification.sender?.userImage?.[0]?.url || ''
        },
        referenceId: populatedNotification.referenceId?.toString(),
        chat: populatedNotification.chat
      });
      console.log(`Emitted 'newNotification' to ${recipientId} for ${type}`);
    } catch (error) {
      console.error(`[Notification] Error creating notification: ${error.message}`);
    }
  };

  // Create a Post
  const createPost = async (req, res) => {
    const io = req.app.get('io');
    const NotificationModel = req.app.get('Notification');
    const UserModel = req.app.get('User');

    try {
      const { content } = req.body;
      const userId = req.user._id;

      let images = [];
      let videos = [];

      const user = await UserModel.findById(userId).select('firstName lastName userName userImage followers');
      if (!user) {
        console.error(`User with ID ${userId} not found for post creation.`);
        return res.status(404).json({ message: "User not found" });
      }

      let imageFiles = req.files?.images;
      if (imageFiles) {
        if (!Array.isArray(imageFiles)) imageFiles = [imageFiles];
        for (const file of imageFiles) {
          const result = await uploadToCloudinary(file.data, 'post_uploads');
          images.push({ url: result.secure_url, cld_id: result.public_id });
        }
      }

      let videoFiles = req.files?.videos;
      if (videoFiles) {
        if (!Array.isArray(videoFiles)) videoFiles = [videoFiles];
        for (const file of videoFiles) {
          const result = await uploadVideoToCloudinary(file.data, 'post_uploads');
          videos.push({ url: result.videoUrl, cld_id: result.videoCldId });
        }
      }

      const newPost = new Post({
        user: userId,
        content,
        images,
        videos,
        comments: [],
        likes: [],
        unlikes: [],
        reactions: [],
        commentCount: 0,
      });

      await newPost.save();

      const populatedPost = await Post.findById(newPost._id)
        .populate('user', 'firstName lastName userName userImage')
        .lean();

      if (populatedPost && populatedPost.user && populatedPost.user.userImage && Array.isArray(populatedPost.user.userImage)) {
        populatedPost.user.userImage = populatedPost.user.userImage.map(img => ({
          url: img.url,
          cld_id: img.cld_id || ''
        }));
      }

      if (io && populatedPost) {
        io.emit('newPost', populatedPost);
        console.log(`Emitted 'newPost' for post ID: ${populatedPost._id}`);
      }

      if (user.followers && user.followers.length > 0 && io) {
        for (const followerId of user.followers) {
          await createAndEmitNotification(req, followerId, userId, 'new_post',
            `${user.firstName} ${user.lastName} posted something new!`,
            "New Post", populatedPost._id);
        }
      }

      res.status(201).json({ message: "Post created successfully", post: populatedPost || newPost });
    } catch (error) {
      console.error(`Error creating post: ${error.message}`);
      res.status(500).json({ message: error.message || "Failed to create post." });
    }
  };


// Search & filter posts
const getPosts = async (req, res) => {
   const io = req.app.get('io'); 
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

        const posts = await Post.find(query).populate("user", "username firstName lastName userImage _id").sort(sortOptions);
        res.status(200).json({ posts });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get All Posts
const getAllPosts = async (req, res) => {
   const io = req.app.get('io'); 
    try {
        const posts = await Post.find()
            .populate("user", "username firstName lastName userImage _id")
            .sort({ createdAt: -1 });
            console.log("🧠 Populated user from post:", posts[0].user);

        res.status(200).json({ posts });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Edit a Post
const editPost = async (req, res) => {
   const io = req.app.get('io'); 
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
    console.log("🔍 Found Post:", post);

    if (!post) {
      console.log(" Post not found in DB");
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
    const io = req.app.get('io');
    try {
      const { text } = req.body;
      const postId = req.params.postId;
      const userId = req.user._id;
      let imageUrl = null;
      let videoUrl = null;

      if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }

      const post = await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });
      if (!post) return res.status(404).json({ message: "Post not found" });

      if (req.file) {
        if (req.file.mimetype.startsWith("image")) {
          const result = await uploadToCloudinary(req.file.buffer, "comments_uploads");
          imageUrl = result.secure_url;
        } else if (req.file.mimetype.startsWith("video")) {
          const result = await uploadVideoToCloudinary(req.file.buffer, "comments_uploads");
          videoUrl = result.secure_url;
        } else {
          return res.status(400).json({ message: "Invalid file type" });
        }
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!text) return res.status(400).json({ message: "Comment text is required" });

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
        updatedPost: { ...post.toObject(), comments: post.comments },
        commentCount: post.commentCount,
        postId,
      });

      res.status(201).json({
        message: "Comment added",
        comment,
        postId: postId || post._id,
        commentCount: post.commentCount,
      });
    } catch (error) {
      logger.error(error);
      console.error("Content Error:", error.message);
      res.status(500).json({ message: error.message });
    }
  };

const getCommentsForPost = async (req, res) => {
   const io = req.app.get('io'); 
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
   const io = req.app.get('io'); 
    try {
        const { postId } = req.params;
        const userId = req.user._id || req.user.id;
        console.log("Deleting post with ID:", postId, "by user:", userId );
        

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

       const postOwnerId = typeof post.user === "string" ? post.user : post.user._id?.toString();

if (postOwnerId !== userId && req.user.role !== "churchAdmin") {
    return res.status(403).json({ message: "Unauthorized to delete this post" });
}


        // Delete images from Cloudinary
        for (let image of post.images) {
            await deleteFromCloudinary(image.cld_id);
        }

        // Delete videos from Cloudinary
        for (let video of post.videos) {
            await deleteFromCloudinary(video.cld_id, { resource_type: "video" });
        }

        await post.deleteOne();
        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Like/Unlike a Post
const likePost = async (req, res) => {
   const io = req.app.get('io'); 
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
   const io = req.app.get('io'); 
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
   const io = req.app.get('io'); 
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
   const io = req.app.get('io'); 
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
   const io = req.app.get('io'); 
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
   const io = req.app.get('io'); 
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

const sharePostToPage = async (req, res) => {
  console.log("[Backend] sharePostToPage ENTER:", req.method, req.originalUrl, req.params);

  try {
    const { postId } = req.params;
    const { quote } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ message: "Invalid post ID format" });
    }

    const originalPost = await Post.findById(postId);
    if (!originalPost) {
      return res.status(404).json({ message: "Original post not found" });
    }

    // Avoid duplicate shares by the same user
    if (originalPost.sharedBy?.includes(userId.toString())) {
      return res.status(400).json({ message: "You have already shared this post" });
    }

    const content = quote?.trim() || originalPost.content || "Shared a post";

    const newPost = new Post({
      user: userId,
      content,
      images: originalPost.images || [],
      videos: originalPost.videos || [],
      sharedFrom: originalPost._id,
      sharedTo: "page",
      type: "shared",
      comments: [],
      likes: [],
      unlikes: [],
      reactions: [],
      commentCount: 0,
    });

    await newPost.save();

    // Update original post with sharedBy
    originalPost.sharedBy = originalPost.sharedBy || [];
    originalPost.sharedBy.push(userId);
    await originalPost.save();

    return res.status(201).json({ message: "Post shared to page", post: newPost });
  } catch (error) {
    console.error("[Backend] Error in sharePostToPage:", error);
    return res.status(500).json({ message: error.message });
  }
};

  const sharePostToChat = async (req, res) => {
    try {
      const { postId } = req.params;
      const { recipientIds } = req.body; // array of user IDs
      const senderId = req.user._id;

      if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
        return res.status(400).json({ message: "Recipients are required" });
      }

      const originalPost = await Post.findById(postId);
      if (!originalPost) {
        return res.status(404).json({ message: "Original post not found" });
      }

      const sharedPostPayload = {
        user: senderId,
        content: originalPost.content,
        images: originalPost.images,
        videos: originalPost.videos,
        sharedFrom: originalPost._id,
        sharedTo: "chat",
      };

      const sharedResults = [];

      for (const recipientId of recipientIds) {
        let chatRoom = await ChatRoom.findOne({
          isGroupChat: false,
          participants: { $all: [senderId, recipientId] },
        });

        if (!chatRoom) {
          chatRoom = new ChatRoom({
            isGroupChat: false,
            participants: [senderId, recipientId],
          });
          await chatRoom.save();
        }

        const message = new ChatMessage({
          sender: senderId,
          chatRoom: chatRoom._id,
          type: 'shared_post',
          post: sharedPostPayload,
        });
        await message.save();

        const io = req.app.get('io');
        io?.to(recipientId.toString()).emit("newMessage", {
          chatRoomId: chatRoom._id,
          message,
        });

        // Create and emit notification for the recipient
        await createAndEmitNotification(req, recipientId, senderId, 'new_message',
          `${req.user.userName} shared a post with you`,
          "New Message", message._id, {
            _id: chatRoom._id,
            type: "private",
            name: (await User.findById(recipientId)).userName || "Chat"
          });

        sharedResults.push({
          recipientId,
          chatRoomId: chatRoom._id,
          messageId: message._id,
        });
      }

      res.status(200).json({
        message: "Post shared via chat",
        shared: sharedResults,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message });
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
    getUserPosts,
    sharePostToChat,
    sharePostToPage
  };

};
module.exports = postIo;
