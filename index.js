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

// --- Socket.io Connection Logic ---
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`); // Frontend should emit 'authenticate'

  socket.on("authenticate", (userId) => {
    if (userId) {
      socket.userId = userId;
      if (!io.userSocketMap.has(userId)) {
        io.userSocketMap.set(userId, new Set());
      }
      io.userSocketMap.get(userId).add(socket.id);
      console.log(
        `User ${userId} registered with socket ${
          socket.id
        }. Total sockets for user: ${io.userSocketMap.get(userId).size}`
      );
      socket.join(userId); // Join user's personal room for direct notifications
      console.log(`Socket ${socket.id} joined personal room: ${userId}`);
    } else {
      console.warn(
        `Attempted to register user with undefined userId for socket: ${socket.id}`
      );
      socket.disconnect(true);
    }
    console.log("Current userSocketMap:", [...io.userSocketMap.entries()]);
  }); // Frontend should emit 'joinRoom'

  socket.on("joinRoom", (chatId) => {
    if (chatId) {
      socket.join(chatId);
      console.log(
        `Socket ${socket.id} joined chat room: ${chatId}. Room size: ${
          io.sockets.adapter.rooms.get(chatId)?.size || 0
        }`
      );
    } else {
      console.warn(
        `Attempted to join undefined chatId for socket ${socket.id}`
      );
    }
  }); // Frontend should emit 'leaveRoom'

  socket.on("leaveRoom", (chatId) => {
    if (chatId) {
      socket.leave(chatId);
      console.log(
        `Socket ${socket.id} left chat room: ${chatId}. Room size: ${
          io.sockets.adapter.rooms.get(chatId)?.size || 0
        }`
      );
    } else {
      console.warn(
        `Attempted to leave undefined chatId for socket: ${socket.id}`
      );
    }
  }); // Frontend should emit 'typing'

  socket.on("typing", ({ chatId, userId, isTyping }) => {
    socket.to(chatId).emit("userTyping", { userId, chatId, isTyping });
    console.log(`User ${userId} isTyping=${isTyping} in chat ${chatId}`);
  }); // Frontend should emit 'markAsRead'

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

// --- NEW: Server-side emits for Reaction Updates and Notifications ---
socket.on("addMessageReaction", async (data) => {
    // ... database logic to add reaction ...
    const { messageId, chatId, reactorId, reactionType, updatedReactions } =
      data;
    io.to(chatId).emit("messageReactionUpdated", {
      messageId,
      chatId,
      reactions: updatedReactions, // Array of { user, type }
      reactionAction: "added",
      reactorId,
      reactionType,
    });
  });

  socket.on("removeMessageReaction", async (data) => {
    // ... database logic to remove reaction ...
    const { messageId, chatId, reactorId, reactionType, updatedReactions } =
      data;
    io.to(chatId).emit("messageReactionUpdated", {
      messageId,
      chatId,
      reactions: updatedReactions, // Array of { user, type }
      reactionAction: "removed",
      reactorId,
      reactionType,
    });
  }); // For example, when a new notification is generated:

  socket.on("generateNotification", async (notificationData) => {
    // ... database logic to save notification ...
    // Ensure notificationData matches the NotificationEventData interface
    io.to(notificationData.recipientId).emit(
      "newNotification",
      notificationData
    );
  });

  socket.on("receive_comment", (data) => {
    const { postId, comment } = data;
    console.log(`Comment received for post ${postId}:`, comment); // Emit the comment to the post's room
    io.to(postId).emit("receive_comment", { postId, comment });
  });

  socket.on("receive_reply", (data) => {
    const { commentId, reply } = data;
    console.log(`Reply received for comment ${commentId}:`, reply); // Emit the reply to the comment's room
    io.to(commentId).emit("receive_reply", { commentId, reply });
  });

  socket.on("update_comment_like", (data) => {
    const { commentId, likedByUser, likesCount } = data;
    console.log(`Likes updated for comment ${commentId}:`, likedByUser); // Emit the updated likes to the comment's room
    io.to(commentId).emit("update_comment_like", {
      commentId,
      likesCount,
      likedByUser,
    });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    if (socket.userId && io.userSocketMap.has(socket.userId)) {
      io.userSocketMap.get(socket.userId).delete(socket.id);
      if (io.userSocketMap.get(socket.userId).size === 0) {
        io.userSocketMap.delete(socket.userId);
        console.log(
          `User ${socket.userId} removed from map (all sockets disconnected).`
        );
      }
      console.log(
        `User ${socket.userId} removed socket ${socket.id} from map.`
      );
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
