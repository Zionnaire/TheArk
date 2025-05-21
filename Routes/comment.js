const express = require("express");
const commentIo = require("../Controllers/commentController")(global.io);
const {verifyToken} = require("../Middlewares/jwt");
const commentRouter = express.Router();

// commentRouter.post("/:postId/add", verifyToken, commentIo.createComment);
commentRouter.post("/:commentId/reply", verifyToken, commentIo.replyToComment);
commentRouter.put("/:commentId/edit", verifyToken, commentIo.editComment);
commentRouter.delete("/:commentId", verifyToken, commentIo.deleteComment);
commentRouter.post("/:commentId/like", verifyToken, commentIo.likeComment);
commentRouter.post("/:commentId/react", verifyToken, commentIo.reactToComment);
// commentRouter.get("/:postId/comments", verifyToken, commentIo.getCommentsForPost);
commentRouter.post("/search", verifyToken, commentIo.searchComments);
commentRouter.post("/report", verifyToken, commentIo.reportComment);

module.exports = commentRouter;
