require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const connectDB = require("./configs/database");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");
const cors = require("cors");

// Attach io to each request
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Store io globally
global.io = new Server(http.createServer(app), {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"],
  },
});



const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"],
  },
});

// Routes
const roleRouter = require("./Routes/role");
const userRouter = require("./Routes/user");
const adminRouter = require("./Routes/admin");
const chatRouter = require("./Routes/chat") // pass io to route
const replyRouter = require("./Routes/reply");
const postRouter = require("./Routes/post");
const searchRouter = require("./Routes/search");
const departmentRouter = require("./Routes/department");
const unitHeadRouter = require("./Routes/unitHead");
const churchRouter = require("./Routes/church");
const resendVerificationRouter = require("./Routes/resendVerification");
const verifyRegisterRouter = require("./Routes/verifyRegister");
const chatGroupRouter = require("./Routes/chatGroup");
const unitRouter = require('./Routes/unit')
// const commentHandlers = require("./Controllers/commentController")(global.io);
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


// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.json());

// Attach io to each request
app.use((req, res, next) => {
  req.io = io;
  next();
});


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
app.use("/api/v1/chats", chatRouter)
app.use("/api/v1/units", unitRouter);
app.use("/api/v1/comments", commentRouter);
app.use("/api/v1/refresh-token", refreshRouter);

// Socket.io connection
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // ** Chat System **
  socket.on("join_private_chat", ({ senderId, receiverId }) => {
    const chatRoom = [senderId, receiverId].sort().join("_");
    socket.join(chatRoom);
    console.log(`User joined private chat: ${chatRoom}`);
  });

  socket.on("send_private_message", ({ senderId, receiverId, message }) => {
    const chatRoom = [senderId, receiverId].sort().join("_");
    io.to(chatRoom).emit("receive_private_message", { senderId, message });
  });

  socket.on("join_unit_chat", (unitId) => {
    socket.join(unitId);
    console.log(`User joined unit chat: ${unitId}`);
  });

  socket.on("send_unit_message", ({ unitId, senderId, message }) => {
    io.to(unitId).emit("receive_unit_message", { senderId, message });
  });

   // ** Department Chat System **  
   socket.on("join_department_chat", (departmentId) => {
    socket.join(departmentId);
    console.log(`User joined department chat: ${departmentId}`);
  });

  socket.on("send_department_message", async ({ departmentId, senderId, message, attachments }) => {
    const newMessage = {
      senderId,
      message,
      attachments,
      createdAt: new Date(),
    };

    // Broadcast message to everyone in the department room
    io.to(departmentId).emit("receive_department_message", newMessage);
  });

  socket.on("join_general_chat", () => {
    socket.join("general_chat");
    console.log("User joined general chat");
  });

  socket.on("send_general_message", ({ senderId, message }) => {
    io.to("general_chat").emit("receive_general_message", { senderId, message });
  });

  // ** Real-Time Comments & Replies **

  // User joins a post room (for comments & replies)
  socket.on("join_post", (postId) => {
    socket.join(postId);
    console.log(`User joined post room: ${postId}`);
  });

  // Group Chat System
  socket.on("join_group_chat", (id) => {
    socket.join(id);
    console.log(`User joined group chat: ${id}`);
  });

  // New Comment
  socket.on("new_comment", (comment) => {
    io.to(comment.post).emit("receive_comment", comment);
  });

  // New Reply
  socket.on("new_reply", (reply) => {
    io.to(reply.comment.post).emit("receive_reply", reply);
  });

  // Comment Like/Unlike
  socket.on("comment_like_unlike", (data) => {
    io.to(data.post).emit("update_comment_like", data);
  });

  // Reply Like/Unlike
  socket.on("reply_like_unlike", (data) => {
    io.to(data.comment.post).emit("update_reply_like", data);
  });

  // Delete Comment
  socket.on("delete_comment", ({ commentId, postId }) => {
    io.to(postId).emit("comment_deleted", commentId);
  });

  // Delete Reply
  socket.on("delete_reply", ({ replyId, postId }) => {
    io.to(postId).emit("reply_deleted", replyId);
  });

  // Handle User Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// Connect to Database
connectDB();

// Start server
server.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});
