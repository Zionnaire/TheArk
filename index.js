require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");

// Assuming your models are correctly path'd
const Message = require("./Models/messages"); // This is for messages, NOT posts
const Post = require("./Models/post"); // This IS your Post model, as clarified
const Chat = require("./Models/AllChats");
const User = require("./Models/user");
const Notification = require("./Models/notification");

// Initialize Express app
const app = express();

// Database connection
const connectDB = require("./configs/database");

// --- IMPORTANT: INITIALIZE HTTP SERVER AND SOCKET.IO SERVER ONCE AND CORRECTLY ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust this to your frontend URL in production for security
    methods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"],
  },
});

// Store `io` instance on the Express app
// This makes the 'io' instance accessible in your route handlers via `req.app.get('io')`
app.set("io", io);
console.log("Socket.io instance attached to Express app.");

// --- CORRECTED: Attach your Mongoose Models to the Express app ---
// This makes these models accessible in your route handlers/controllers via `req.app.get('ModelName')`
app.set("Notification", Notification);
app.set("User", User);
app.set("Post", Post); // <--- CORRECTED: Using 'Post' as the key and the actual Post model

// Define the global userSocketMap for Socket.io
io.userSocketMap = new Map(); // Map<userId: string, Set<socketId: string>>

// Middleware
app.use(cors()); // CORS first
app.use(express.json()); // For application/json requests
app.use(express.urlencoded({ extended: true })); // For application/x-www-form-urlencoded requests
app.use(
  fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 },
    createParentPath: true,
    debug: true,
  })
);
// Removed bodyParser.json() and bodyParser.urlencoded() as express.json() and express.urlencoded() handle most cases
app.use(
  bodyParser.json({
    limit: "50mb", // Adjust as needed
  })
);
// Routes (require them after app and io are set up)
const roleRouter = require("./Routes/role");
const userRouter = require("./Routes/user");
const adminRouter = require("./Routes/admin");
const chatRouter = require("./Routes/chat");
const replyRouter = require("./Routes/reply");
const postRouter = require("./Routes/post");
const searchRouter = require("./Routes/search");
const departmentRouter = require("./Routes/department");
const unitHeadRouter = require("./Routes/unitHead");
const churchRouter = require("./Routes/church");
const resendVerificationRouter = require("./Routes/resendVerification");
const verifyRegisterRouter = require("./Routes/verifyRegister");
const chatGroupRouter = require("./Routes/chatGroup");
const unitRouter = require("./Routes/unit");
const commentRouter = require("./Routes/comment");
const refreshRouter = require("./Routes/refreshToken");
const validationRouter = require("./Routes/validation");
const notificationRouter = require("./Routes/notification");

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("authenticate", (userId) => {
    if (userId) {
      socket.userId = userId;
      if (!io.userSocketMap.has(userId)) io.userSocketMap.set(userId, new Set());
      io.userSocketMap.get(userId).add(socket.id);
      console.log(`User ${userId} registered with socket ${socket.id}. Total sockets for user: ${io.userSocketMap.get(userId).size}`);
      socket.join(userId);
      console.log(`Socket ${socket.id} joined personal room: ${userId}`);
    } else {
      console.warn(`Attempted to register user with undefined userId for socket: ${socket.id}`);
      socket.disconnect(true);
    }
    console.log("Current userSocketMap:", [...io.userSocketMap.entries()]);
  });

  socket.on("joinRoom", (chatId) => {
    if (chatId) {
      socket.join(chatId);
      console.log(`Socket ${socket.id} joined chat room: ${chatId}. Room size: ${io.sockets.adapter.rooms.get(chatId)?.size || 0}`);
    } else {
      console.warn(`Attempted to join undefined chatId for socket ${socket.id}`);
    }
  });

  socket.on("leaveRoom", (chatId) => {
    if (chatId) {
      socket.leave(chatId);
      console.log(`Socket ${socket.id} left chat room: ${chatId}. Room size: ${io.sockets.adapter.rooms.get(chatId)?.size || 0}`);
    } else {
      console.warn(`Attempted to leave undefined chatId for socket: ${socket.id}`);
    }
  });

  socket.on("typing", ({ chatId, userId, isTyping }) => {
    socket.to(chatId).emit("userTyping", { userId, chatId, isTyping });
    console.log(`User ${userId} isTyping=${isTyping} in chat ${chatId}`);
  });

  socket.on("markAsRead", async ({ messageId, readerId, chatId }) => {
    try {
      if (!readerId) {
        console.warn(`[Socket] Socket ${socket.id} attempted to mark message as read without readerId.`);
        return socket.emit("error", "Authentication required to mark messages as read.");
      }
      if (!messageId || !chatId) {
        console.warn(`[Socket] Missing messageId or chatId for markAsRead from socket ${socket.id}.`);
        return socket.emit("error", "Invalid request for marking message as read.");
      }

      const updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        { $addToSet: { readBy: { user: readerId, readAt: Date.now() } } },
        { new: true }
      );
      if (!updatedMessage) {
        console.warn(`[Socket] Message ${messageId} not found for marking as read.`);
        return socket.emit("error", "Message not found.");
      }

      await Chat.findOneAndUpdate(
        { _id: chatId, 'unreadCounts.user': readerId },
        { $set: { 'unreadCounts.$.count': 0 } },
        { new: true }
      );

      console.log(`[Socket] Message ${messageId} in chat ${chatId} marked as read by ${readerId}.`);
      io.to(chatId).emit("messageRead", {
        messageId: updatedMessage._id.toString(),
        chatId,
        readerId,
        readBy: updatedMessage.readBy.map((entry) => ({
          user: entry.user.toString(),
          readAt: entry.readAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error("[Socket] Error marking message as read:", error);
      socket.emit("error", "Failed to mark message as read.");
    }
  });

  socket.on("addMessageReaction", async (data) => {
    const { messageId, chatId, reactorId, reactionType, updatedReactions } = data;
    io.to(chatId).emit("messageReactionUpdated", {
      messageId,
      chatId,
      reactions: updatedReactions,
      reactionAction: "added",
      reactorId,
      reactionType,
    });
  });

  socket.on("removeMessageReaction", async (data) => {
    const { messageId, chatId, reactorId, reactionType, updatedReactions } = data;
    io.to(chatId).emit("messageReactionUpdated", {
      messageId,
      chatId,
      reactions: updatedReactions,
      reactionAction: "removed",
      reactorId,
      reactionType,
    });
  });

  socket.on("receive_comment", (data) => {
    const { postId, comment } = data;
    console.log(`Comment received for post ${postId}:`, comment);
    io.to(postId).emit("receive_comment", { postId, comment });
  });

  socket.on("receive_reply", (data) => {
    const { commentId, reply } = data;
    console.log(`Reply received for comment ${commentId}:`, reply);
    io.to(commentId).emit("receive_reply", { commentId, reply });
  });

  socket.on("update_comment_like", (data) => {
    const { commentId, likedByUser, likesCount } = data;
    console.log(`Likes updated for comment ${commentId}:`, likedByUser);
    io.to(commentId).emit("update_comment_like", { commentId, likesCount, likedByUser });
  });

  socket.on("sendMessage", async (payload) => {
    try {
      const { chatId, text, sender, image, video } = payload;
      const chat = await Chat.findById(chatId);

      if (!chat) throw new Error("Chat not found");

      let attachments = [];
      if (image) attachments.push({ url: image, cld_id: "temp_cld_id", type: "image" }); // Replace with actual Cloudinary upload logic
      if (video) attachments.push({ url: video, cld_id: "temp_cld_id", type: "video" }); // Replace with actual Cloudinary upload logic

      const message = new Message({
        chat: chatId,
        sender,
        messageText: text || "",
        attachments,
        contentType: text ? "text" : (image || video ? "attachment" : "text"),
        readBy: [{ user: sender, readAt: Date.now() }],
        status: "sent",
      });
      await message.save();

      // Update chat's lastMessage and unreadCounts
      chat.lastMessageText = text || (attachments.length ? "Attachment" : "");
      chat.lastMessageAt = message.createdAt;
      chat.unreadCounts = chat.unreadCounts || [];
      chat.participants.forEach((participantId) => {
        const unreadEntry = chat.unreadCounts.find((uc) => uc.user.toString() === participantId.toString());
        if (unreadEntry) {
          if (participantId.toString() !== sender) unreadEntry.count += 1;
        } else if (participantId.toString() !== sender) {
          chat.unreadCounts.push({ user: participantId, count: 1 });
        }
      });
      await chat.save();

      io.to(chatId).emit("receiveMessage", {
        _id: message._id,
        chatId,
        sender,
        messageText: message.messageText,
        attachments: message.attachments,
        contentType: message.contentType,
        createdAt: message.createdAt,
        readBy: message.readBy,
      });

      // Create and emit notification for all participants except sender
      const chatType = chat.type || "private"; // Adjust based on your Chat model
      chat.participants.forEach(async (participantId) => {
        if (participantId.toString() !== sender) {
          const notificationMessage = text ? `${text.substring(0, 50)}${text.length > 50 ? "..." : ""}` : "New attachment received";
          const chatContext = {
            chatId: chat._id,
            model: chatType === "unit" ? "UnitChat" : chatType === "department" ? "DepartmentChat" : "PrivateChat",
            type: chatType,
            name: chat.name || (await User.findById(participantId)).userName || "Chat"
          };
          const notification = new Notification({
            type: "message",
            recipient: participantId,
            sender,
            message: notificationMessage,
            title: "New Message",
            referenceModel: "Message",
            chat: chat._id,
            chatContext,
            metadata: { messageId: message._id }
          });
          await notification.save();

          const populatedNotification = await Notification.findById(notification._id)
            .populate("sender", "firstName lastName userName userImage");
          io.to(participantId.toString()).emit("newNotification", {
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
            referenceId: message._id.toString(),
            chat: populatedNotification.chat ? {
              _id: populatedNotification.chat.toString(),
              type: chatContext.type,
              name: chatContext.name
            } : null
          });
        }
      });
    } catch (error) {
      console.error("[Socket] Error sending message:", error);
      socket.emit("error", "Failed to send message.");
    }
  });

  socket.on("generateNotification", async (notificationData) => {
    try {
      const { type, recipientId, senderId, message, title, referenceId, chat } = notificationData;
      const notification = new Notification({
        type,
        recipient: recipientId,
        sender: senderId,
        message: message || "",
        title: title || "New Notification",
        referenceModel: "Message", // Adjust based on context
        chat,
        read: false,
        createdAt: new Date()
      });
      await notification.save();

      const populatedNotification = await Notification.findById(notification._id)
        .populate("sender", "firstName lastName userName userImage");
      io.to(recipientId.toString()).emit("newNotification", {
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
        referenceId: referenceId?.toString(),
        chat: populatedNotification.chat ? {
          _id: populatedNotification.chat.toString(),
          type: populatedNotification.chatContext?.type || "private",
          name: populatedNotification.chatContext?.name || "Chat"
        } : null
      });
    } catch (error) {
      console.error("[Socket] Error generating notification:", error);
      socket.emit("error", "Failed to generate notification.");
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    if (socket.userId && io.userSocketMap.has(socket.userId)) {
      io.userSocketMap.get(socket.userId).delete(socket.id);
      if (io.userSocketMap.get(socket.userId).size === 0) {
        io.userSocketMap.delete(socket.userId);
        console.log(`User ${socket.userId} removed from map (all sockets disconnected).`);
      }
      console.log(`User ${socket.userId} removed socket ${socket.id} from map.`);
    }
  });
});
// --- END Socket.io Connection Logic ---

// Connect to Database
connectDB();

// Routes
app.use("/api/v1/roles", roleRouter);
app.use("/api/v1/auth", validationRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/admins", adminRouter);
app.use("/api/v1/chats", chatRouter);
app.use("/api/v1/replies", replyRouter);
app.use("/api/v1/posts", postRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/departments", departmentRouter);
app.use("/api/v1/unitHeads", unitHeadRouter);
app.use("/api/v1/churches", churchRouter);
app.use("/api/v1/resendVerification", resendVerificationRouter);
app.use("/api/v1/verifyUser", verifyRegisterRouter);
app.use("/api/v1/verifyChurch", verifyRegisterRouter);
app.use("/api/v1/chatGroups", chatGroupRouter);
app.use("/api/v1/units", unitRouter);
app.use("/api/v1/comments", commentRouter);
app.use("/api/v1/auth", refreshRouter);
app.use("/api/v1/notifications", notificationRouter);

// Start the server
const port = process.env.PORT || 5000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
});