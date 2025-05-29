const express = require("express");
const { verifyToken } = require("../Middlewares/jwt");
const chatIo = require("../Controllers/chatController")(global.io)


  const chatRouter = express.Router();
  // const chatIo = require("../Controllers/chatController");(io); // inject socket into controller

  //  Protect all routes
  // chatRouter.use(verifyToken);

  //  Send Message (any type)
  chatRouter.post("/:chatType/:recipientId/messages",verifyToken, chatIo.sendMessage); 
  // Examples:
  // - /private/<receiverId>
  // - /unit/<unitId>
  // - /department/<deptId>
  // - /general (no id)

  // Create Private Chat
  chatRouter.post("/private/:recipientId", verifyToken, chatIo.createPrivateChat);

  //  Get Messages (any type, infinite scroll support)
  chatRouter.get("/:chatType/:id?", verifyToken, chatIo.getChatMessages); 
  // Accepts optional query: ?before=<timestamp>&limit=20

  // Reactions
  chatRouter.post("/:chatType/:chatId/message/:messageId/reaction", verifyToken, chatIo.toggleReaction)

  // Delete message by ID (any type — determined via ?chatType=xyz)
  chatRouter.delete("/:messageId",verifyToken, chatIo.deleteMessage);
  // Example: DELETE /abc1234?chatType=unit

  // Get logged-in user's notifications (optional pagination via ?page=1&limit=20)
  chatRouter.get("/notifications", verifyToken, chatIo.getNotifications);

  chatRouter.get("/private/:chatId/messages", verifyToken, chatIo.getPrivateMessages)
  chatRouter.get("/private/:recipientId/exists", verifyToken, chatIo.checkPrivateChatExists);
  chatRouter.get("/unit", verifyToken, chatIo.getUnitMessages)
  chatRouter.get("/department", verifyToken, chatIo.getDepartmentMessages)
  chatRouter.get("/general", verifyToken, chatIo.getGeneralMessages)
  chatRouter.get("/private-chats", verifyToken, chatIo.getPrivateChatList);
  chatRouter.get("/unit-chats", verifyToken, chatIo.getUnitChatList)
  chatRouter.get("/department-chats", verifyToken, chatIo.getDepartmentChatList)
  chatRouter.get("/general-chats", verifyToken, chatIo.getGeneralChatList)
  


module.exports = chatRouter;