const express = require("express");
const { addReply, getReplies, editReply, deleteReply, likeReply, unlikeReply } = require("../Controllers/replyController");
const { verifyToken } = require("../Middlewares/jwt"); // Ensure authentication

const replyRouter = express.Router();

// Add a reply to a comment
replyRouter.post("/:commentId", verifyToken, addReply);

// Get all replies for a comment
replyRouter.get("/:commentId", getReplies);

// Edit a reply
replyRouter.put("/:replyId", verifyToken, editReply);

// Delete a reply
replyRouter.delete("/:replyId", verifyToken, deleteReply);

// Like a reply
replyRouter.post("/like/:replyId", verifyToken, likeReply);

// Unlike a reply
replyRouter.post("/unlike/:replyId", verifyToken, unlikeReply);

module.exports = replyRouter;
