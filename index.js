require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser"); // Keep this for now
const fileUpload = require("express-fileupload");
const cors = require("cors");
const mongoose = require("mongoose");

const app = require("./app");
const connectDB = require("./configs/database");
const {PrivateChat,
    UnitChat,
    DepartmentChat,
    GeneralChat,} = require("./Models/chat");

// --- IMPORTANT: INITIALIZE HTTP SERVER AND SOCKET.IO SERVER ONCE AND CORRECTLY ---
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust this to your frontend URL in production for security
        methods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"],
    },
});

// Attach io to each request AFTER it's initialized
// This should be one of the first middleware so that `req.io` is available to all subsequent middleware and routes
app.use((req, res, next) => {
    req.io = io;
    next();
});
// --- END IMPORTANT INITIALIZATION ---


// Routes (require them after io is available for the middleware above)
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
const unitRouter = require('./Routes/unit');
const commentRouter = require("./Routes/comment");
const refreshRouter = require("./Routes/refreshToken");

const port = process.env.PORT || 5000;

// Enable CORS for all routes
const corsOptions = {
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    optionSuccessStatus: 200,
};

// Middleware (CRUCIAL ORDERING)
app.use(cors(corsOptions)); // CORS first

// Add debug: true here to see fileUpload's internal logs
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 },
    createParentPath: true,
    debug: true, // <-- ADDED THIS FOR DEBUGGING
}));

// These general body parsers should ideally come AFTER fileUpload for requests
// that are 'multipart/form-data' and handled by fileUpload.
// fileUpload is designed to handle both file and text fields from multipart/form-data.
app.use(express.json()); // For application/json requests
app.use(bodyParser.urlencoded({ extended: true })); // For application/x-www-form-urlencoded requests


// Routes
app.use("/api/v1/roles", roleRouter);
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
app.use("/api/v1/refresh-token", refreshRouter);

// Map: userId -> Set<socketId> (for tracking all active sockets for a user)
const userSocketMap = new Map();

// Utility to generate consistent chat room IDs (sorted to avoid mismatch)
function getRoomId(senderId, receiverId) {
  return [senderId, receiverId].sort().join('_');
}
  
io.on("connection", (socket) => {
    
    console.log(`User connected: ${socket.id}`);

    socket.on('authenticate', (userId) => {
        if (userId) {
            socket.userId = userId;
            if (!userSocketMap.has(userId)) {
                userSocketMap.set(userId, new Set());
            }
            userSocketMap.get(userId).add(socket.id);
            // console.log(`User ${userId} authenticated and mapped to socket ${socket.id}`);
        } else {
            console.warn(`Authentication failed for socket ${socket.id}: No userId provided.`);
            socket.disconnect(true);
        }
    });

    // Expect chatId to be a normalized room id, or you can modify to accept two userIds and normalize here
    socket.on("joinRoom", (chatId) => {
        socket.join(chatId);
        // console.log(`Socket ${socket.id} joined room: ${chatId}`);
    });

    socket.on("leaveRoom", (chatId) => {
        socket.leave(chatId);
        // console.log(`Socket ${socket.id} left room: ${chatId}`);
    });

    socket.on("typing", ({ chatId, userId, isTyping }) => {
        socket.to(chatId).emit('userTyping', { userId, chatId, isTyping });
        // console.log(`User ${userId} is typing in room ${chatId}: ${isTyping}`);
    });

  

    socket.on('markAsRead', async ({ messageId, senderId, receiverId }) => {
        try {
            const updatedMessage = await PrivateChat.findByIdAndUpdate(
                messageId,
                { $set: { read: true } },
                { new: true }
            );
            if (updatedMessage) {
                const roomId = getRoomId(senderId, receiverId);
                // console.log(`Message ${messageId} in chat ${roomId} marked as read.`);
                io.to(roomId).emit('messageRead', { messageId, chatId: roomId });
            } else {
                console.warn(`Message ${messageId} not found to mark as read.`);
            }
        } catch (error) {
            console.error('Error marking message as read:', error);
            socket.emit('error', 'Failed to mark message as read.');
        }
    });

    // Your other chat types remain unchanged
    // (unit_chat, department_chat, general_chat, post, group_chat, etc.)

    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
        if (socket.userId && userSocketMap.has(socket.userId)) {
            userSocketMap.get(socket.userId).delete(socket.id);
            if (userSocketMap.get(socket.userId).size === 0) {
                userSocketMap.delete(socket.userId);
                console.log(`User ${socket.userId} removed from map (all sockets disconnected).`);
            }
            console.log(`User ${socket.userId} removed socket ${socket.id} from map.`);
        }
    });
});

io.userSocketMap = userSocketMap;

connectDB();

server.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});