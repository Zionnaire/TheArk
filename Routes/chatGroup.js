const express = require("express");
const { createGroupChat, updateGroupChat, deleteGroupChat, getAllGroupChats } = require("../Controllers/chatGroupController");
const { verifyToken } = require("../Middlewares/jwt");

const chatGroupRouter = express.Router();


// Route for creating a group chat
chatGroupRouter.post("/", verifyToken, createGroupChat);

// Route for getting all group chats
chatGroupRouter.get("/", verifyToken, getAllGroupChats);

// Route for updating a group chat
chatGroupRouter.put("/:id", verifyToken, updateGroupChat);

// Route for deleting a group chat
chatGroupRouter.delete("/:id", verifyToken, deleteGroupChat);

module.exports = chatGroupRouter;
