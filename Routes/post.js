const express = require("express");
const postIo = require("../Controllers/postController")(global.io);
const {verifyToken} = require("../Middlewares/jwt");

const postRouter = express.Router();

// Post Routes
postRouter.post("/", verifyToken, postIo.createPost);

postRouter.get("/user", verifyToken, postIo.getPosts);
postRouter.get("/", postIo.getAllPosts);
postRouter.get("/:postId", postIo.getPostById);
postRouter.put('/edit/:postId',verifyToken, postIo.editPost);
postRouter.delete("/:postId", verifyToken, postIo.deletePost);
postRouter.post("/:postId/like", verifyToken, postIo.likePost);
postRouter.post("/:postId/unlike", verifyToken, postIo.unlikePost);
postRouter.post("/:postId/react", verifyToken, postIo.reactToPost);
postRouter.get("/filter", postIo.filterPosts);
postRouter.get("/:postId/comments", postIo.getCommentsForPost);
postRouter.post("/:postId/comments", verifyToken, postIo.createComment);
postRouter.get("/user/:userId", postIo.getUserPosts)
module.exports = postRouter;
