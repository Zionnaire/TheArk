const express = require("express");
const { verifyToken } = require("../Middlewares/jwt");
const chatIo = require("../Controllers/chatController")(global.io)


  const chatRouter = express.Router();

  //  Protect all routes
  // chatRouter.use(verifyToken);

 // 👇 Specific routes go first
chatRouter.get("/combined", verifyToken, chatIo.getCombinedChatlist);
chatRouter.post("/:chatType/:recipientId/messages", verifyToken, chatIo.sendMessage)
chatRouter.get("/notifications", verifyToken, chatIo.getNotifications);
chatRouter.get("/private/:chatId/messages", verifyToken, chatIo.getPrivateMessages);
chatRouter.get("/private/:recipientId/exists", verifyToken, chatIo.checkPrivateChatExists);
chatRouter.get("/unit", verifyToken, chatIo.getUnitMessages);
chatRouter.get("/department", verifyToken, chatIo.getDepartmentMessages);
chatRouter.get("/general", verifyToken, chatIo.getGeneralMessages);
chatRouter.get("/private-chats", verifyToken, chatIo.getPrivateChatList);
chatRouter.get("/unit-chats", verifyToken, chatIo.getUnitChatList);
chatRouter.get("/department-chats", verifyToken, chatIo.getDepartmentChatList);
chatRouter.get("/general-chats", verifyToken, chatIo.getGeneralChatList);

// 👇 Wildcard route goes LAST
chatRouter.get("/:chatType/:id?", verifyToken, chatIo.getChatMessages);

  


module.exports = chatRouter;