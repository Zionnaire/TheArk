const express = require("express");
const chatRouter = express.Router();
const {
    sendPrivateMessage,
    getPrivateMessages,
    sendUnitMessage,
    getUnitMessages,
    sendGeneralMessage,
    getGeneralMessages,
    deleteMessage,
    getNotifications,
    sendDepartmentMessage,
    getDepartmentMessages,
} = require("../Controllers/chatController");
const { verifyToken } = require("../Middlewares/jwt");

// Private Chat Routes
chatRouter.post("/private/:receiverId", verifyToken, sendPrivateMessage);
chatRouter.get("/private/:userId", verifyToken, getPrivateMessages);

// Unit Chat Routes
chatRouter.post("/unit/:unitId", verifyToken, sendUnitMessage);
chatRouter.get("/unit/:unitId", verifyToken, getUnitMessages);

// Department Chat Routes
chatRouter.post("/department/:departmentId", verifyToken, sendDepartmentMessage);
chatRouter.get("/department/:departmentId", verifyToken, getDepartmentMessages);

// General Chat Routes
chatRouter.post("/general", verifyToken, sendGeneralMessage);
chatRouter.get("/general", verifyToken, getGeneralMessages);

// Delete a message
chatRouter.delete("/:messageId", verifyToken, deleteMessage);

// Get notifications
chatRouter.get("/notifications", verifyToken, getNotifications);

module.exports = chatRouter;