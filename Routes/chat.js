const express = require("express");
const { verifyToken } = require("../Middlewares/jwt");
const chatIo = require("../Controllers/chatController")(global.io)


  const chatRouter = express.Router();

  //  Protect all routes
  // chatRouter.use(verifyToken);

 // 👇 Specific routes go first
chatRouter.get("/combined", verifyToken, chatIo.getCombinedChatlist);
chatRouter.post("/private/:recipientId", verifyToken, chatIo.createPrivateChat)
chatRouter.post("/:chatType/:recipientId/messages", verifyToken, chatIo.sendMessage)
chatRouter.get("/notifications", verifyToken, chatIo.getNotifications);
chatRouter.get("/:chatId/messages", verifyToken, chatIo.getMessages);
chatRouter.post('/unit', verifyToken, chatIo.createUnitChat);
chatRouter.post("/department", verifyToken, chatIo.createDepartmentChat);
chatRouter.get("/department/:departmentId", verifyToken, chatIo.getDepartmentChat);
chatRouter.get("/private/:recipientId/exists", verifyToken, chatIo.checkPrivateChatExists);
chatRouter.get("/unitChat/:unitId", verifyToken, chatIo.getUnitChat);
chatRouter.get("/unit", verifyToken, chatIo.getUnitMessages);
chatRouter.get("/department", verifyToken, chatIo.getDepartmentMessages);
chatRouter.post("/general", verifyToken, chatIo.getOrCreateGeneralChat);
chatRouter.get("/general", verifyToken, chatIo.getGeneralMessages);
chatRouter.get("/unit-chats", verifyToken, chatIo.getUnitChatList);
chatRouter.get("/department-chats", verifyToken, chatIo.getDepartmentChatList);
chatRouter.get("/general-chats", verifyToken, chatIo.getGeneralChatList);
chatRouter.post("/toggleReaction/:messageId", verifyToken, chatIo.toggleReaction);
chatRouter.post("/announcement", verifyToken, chatIo.sendAnnouncement);

// 👇 Wildcard route goes LAST
// chatRouter.get("/:chatType/:id?", verifyToken, chatIo.getChatMessages);
chatRouter.delete("/deleteMessage/:messageId", verifyToken, chatIo.deleteMessage);

  


module.exports = chatRouter;