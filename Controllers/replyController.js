const Reply = require("../Models/reply");
const Comment = require("../Models/comment");

// Add a reply to a comment
const addReply = async (req, res) => {
  try {
    // Can reply with text or image/video or both (at least one is required)
    const { text } = req.body;
    const { commentId } = req.params;
    const userId = req.user.id;
    let imageUrl = null;
    let videoUrl = null;

    if (!text) {
      return res.status(400).json({ message: "Reply text is required" });
    }

    //Check if image or video is provided
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "replies_uploads");
      imageUrl = result.secure_url;
    } else if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, "replies_uploads");
      videoUrl = result.secure_url; 
    }
    if (!imageUrl && !videoUrl) {
      return res.status(400).json({ message: "Invalid file type" });
    }
    // Create reply
    const reply = await Reply.create({ comment: commentId, user: userId, text, image: imageUrl, video: videoUrl });

    // Add reply to comment's reply list
    await Comment.findByIdAndUpdate(commentId, { $push: { replies: reply._id } });

    res.status(201).json(reply);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all replies for a comment
const getReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const replies = await Reply.find({ comment: commentId }).populate("user", "name");
    res.status(200).json(replies);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Edit a reply
const editReply = async (req, res) => {
  try {
    const { replyId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    const reply = await Reply.findById(replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    if (reply.user.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized to edit this reply" });
    }

    reply.text = text || reply.text;
    await reply.save();
    res.status(200).json(reply);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a reply
const deleteReply = async (req, res) => {
  try {
    const { replyId } = req.params;
    const userId = req.user.id;

    const reply = await Reply.findById(replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    if (reply.user.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized to delete this reply" });
    }

    await reply.deleteOne();
    res.status(200).json({ message: "Reply deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Like a reply
const likeReply = async (req, res) => {
  try {
    const { replyId } = req.params;
    const userId = req.user._id;

    const reply = await Reply.findById(replyId);
    console.log("reply:", reply );
    
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    const alreadyLikedIndex = reply.likes.findIndex(
      (like) => like.user.toString() === userId
    );

    let likedByUser;
    if (alreadyLikedIndex > -1) {
      // User already liked — remove the like
      reply.likes.splice(alreadyLikedIndex, 1);
      likedByUser = false;
    } else {
      // Add like
      reply.likes.push({ user: userId });
      likedByUser = true;
    }

    await reply.save();

    res.status(200).json({
      reply,
      likedByUser,
    });
  } catch (error) {
    console.error("likeReply error:", error);
    res.status(500).json({ message: error.message });
  }
};


// Unlike a reply
const unlikeReply = async (req, res) => {
  try {
    const { replyId } = req.params;
    const userId = req.user.id;

    const reply = await Reply.findById(replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });

    reply.unlikes.push({ user: userId });
    await reply.save();

    res.status(200).json(reply);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


module.exports = { addReply, getReplies, editReply, deleteReply, likeReply, unlikeReply };