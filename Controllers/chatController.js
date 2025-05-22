const mongoose = require('mongoose');
const Chat = require('../Models/chat');
const { PrivateChat,  } = require("../Models/chat"); // Ensure correct import
const Message = require('../Models/post');
const Unit = require('../Models/unit');
const User = require('../Models/user');
const Department = require('../Models/departments');
const Notification = require('../Models/notification');
const logger = require('../Middlewares/logger');
const { uploadToCloudinary, uploadVideoToCloudinary } = require('../Middlewares/cloudinaryUpload');


// Helper: Validate ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
//Send a private message (1-on-1 chat)
const sendPrivateMessage = async (req, res) => {
  try {
    const { receiverId } = req.params;
    const { message = '', attachments = [], reactions = [] } = req.body;
    const senderId = req.user._id;

    // Validation (same as before)
    if (!isValidObjectId(receiverId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }
    if ((!message || !message.trim()) && (!Array.isArray(attachments) || attachments.length === 0)) {
      return res.status(400).json({ message: "Message content or attachments are required." });
    }
    if (senderId.toString() === receiverId) {
      return res.status(400).json({ message: "You cannot send a message to yourself." });
    }
    const receiver = await User.findById(receiverId);
    if (!receiver) return res.status(404).json({ message: "Recipient user not found." });

    // Upload attachments to Cloudinary
    let uploadedAttachments = [];
    for (const file of attachments) {
      if (!file.base64 || !file.type) {
        return res.status(400).json({ message: "Each attachment must have base64 string and type." });
      }

      if (file.type === "image") {
        // convert base64 string to buffer
        const base64Data = file.base64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadToCloudinary(buffer, "chat_uploads");
        uploadedAttachments.push({ url: result.secure_url, cld_id: result.public_id });
      } else if (file.type === "video") {
        const base64Data = file.base64.replace(/^data:video\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadVideoToCloudinary(buffer, "chat_uploads");
        uploadedAttachments.push({ url: result.videoUrl, cld_id: result.videoCldId });
      } else {
        return res.status(400).json({ message: "Unsupported attachment type" });
      }
    }

    // Validate reactions (same)
    if (!Array.isArray(reactions) || reactions.some(r => !r.user || typeof r.type !== 'string')) {
      return res.status(400).json({ message: "Reactions must be an array of { user, type } objects." });
    }

    // Create new message with uploaded attachments
    const newMessage = new PrivateChat({
      sender: senderId,
      receiver: receiverId,
      message: message.trim() || '',
      attachments: uploadedAttachments,
      reactions,
    });

    await newMessage.save();

    await Notification.create({
      user: receiverId,
      message: `New message from ${req.user.name}`,
    });

    return res.status(201).json(newMessage);

  } catch (error) {
    console.error("Error sending private message:", error);
    return res.status(500).json({ message: "Server error. Please try again later." });
  }
};
// Get private messages
const getPrivateMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    const { before } = req.query; // timestamp string (ISO or ms)

    // Validate userId format
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    const limit = 20; // how many messages to fetch at once

    // Mark all unread messages *from* userId to currentUser as read
    await PrivateChat.updateMany(
      {
        sender: userId,
        receiver: currentUserId,
        read: false,
      },
      { $set: { read: true } }
    );

    // Build filter for fetching messages before the 'before' timestamp if provided
    const dateFilter = before ? { createdAt: { $lt: new Date(before) } } : {};

    // Fetch messages between the two users before 'before' timestamp, sorted newest first
    const messages = await PrivateChat.find({
      $and: [
        {
          $or: [
            { sender: currentUserId, receiver: userId },
            { sender: userId, receiver: currentUserId },
          ],
        },
        dateFilter,
      ],
    })
      .sort({ createdAt: -1 }) // newest first for easier prepend on client side
      .limit(limit)
      .populate("sender", "username firstName lastName userImage")
      .populate("receiver", "username firstName lastName userImage");

    // Reverse so oldest messages are first (for natural chat order)
    messages.reverse();

    return res.status(200).json({
      success: true,
      messages,
      hasMore: messages.length === limit, // if true, client can request more before earliest date
    });
  } catch (error) {
    console.error("Error retrieving private messages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

// Send a unit message
const sendUnitMessage = async (req, res) => {
  try {
    const { unitId } = req.params;
    const { message = '', attachments = [], reactions = [] } = req.body;
    const senderId = req.user._id;

    // Validate unitId
    if (!isValidObjectId(unitId)) {
      return res.status(400).json({ message: "Invalid unit ID format." });
    }

    // Validate message or attachments presence
    if ((!message || !message.trim()) && (!Array.isArray(attachments) || attachments.length === 0)) {
      return res.status(400).json({ message: "Message content or attachments are required." });
    }

    // Check sender exists
    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(404).json({ message: "User not found." });
    }

    // Check unit exists
    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ message: "Unit not found." });
    }

    // Check if sender is member of the unit
    if (!unit.members.some(memberId => memberId.toString() === senderId.toString())) {
      return res.status(403).json({ message: "You are not a member of this unit." });
    }

    // Upload attachments to Cloudinary
    let uploadedAttachments = [];
    for (const file of attachments) {
      if (!file.base64 || !file.type) {
        return res.status(400).json({ message: "Each attachment must have base64 string and type." });
      }

      if (file.type === "image") {
        const base64Data = file.base64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadToCloudinary(buffer, "unit_chat_uploads");
        uploadedAttachments.push({ url: result.secure_url, cld_id: result.public_id });
      } else if (file.type === "video") {
        const base64Data = file.base64.replace(/^data:video\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadVideoToCloudinary(buffer, "unit_chat_uploads");
        uploadedAttachments.push({ url: result.videoUrl, cld_id: result.videoCldId });
      } else {
        return res.status(400).json({ message: "Unsupported attachment type" });
      }
    }

    // Validate reactions
    if (!Array.isArray(reactions) || reactions.some(r => !r.user || typeof r.type !== 'string')) {
      return res.status(400).json({ message: "Reactions must be an array of { user, type } objects." });
    }

    // Create the new chat message
    const newMessage = new Chat({
      sender: senderId,
      unit: unitId,
      message: message.trim() || '',
      attachments: uploadedAttachments,
      reactions,
      chatType: "unit",
    });

    await newMessage.save();

    // Notify all unit members (except sender)
    const unitMembers = await User.find({ _id: { $in: unit.members, $ne: senderId } });
    await Promise.all(unitMembers.map(member =>
      Notification.create({
        user: member._id,
        message: `New message in ${unit.name} unit chat`,
      })
    ));

    res.status(201).json(newMessage);

  } catch (error) {
    console.error("Error sending unit message:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// Get unit messages
const getUnitMessages = async (req, res) => {
  try {
    const { unitId } = req.params;
    const userId = req.user._id;

    // Validate unitId format
    if (!isValidObjectId(unitId)) {
      return res.status(400).json({ message: "Invalid unit ID format." });
    }

    // Find the unit and check membership
    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    if (!unit.members.some(memberId => memberId.equals(userId))) {
      return res.status(403).json({ message: "You are not a member of this unit" });
    }

    // Pagination query param for infinite scroll
    const { before } = req.query;
    const limit = 20;

    // Fetch messages for this unit's chat
    const messages = await Chat.find({
      chatType: "unit",
      unit: unitId,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "username firstName lastName userImage");

    // Reverse to oldest first for client rendering
    messages.reverse();

    // Optional: mark unread messages as read for this user
    await Chat.updateMany(
      {
        chatType: "unit",
        unit: unitId,
        "readBy": { $ne: userId }, // not read by this user
      },
      {
        $addToSet: { readBy: userId }
      }
    );

    // Send response
    return res.status(200).json({
      success: true,
      messages,
      hasMore: messages.length === limit,
    });
  } catch (error) {
    console.error("Error getting unit messages:", error);
    return res.status(500).json({ message: "Server error. Please try again later." });
  }
};


// Send a department message
const sendDepartmentMessage = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const senderId = req.user._id;
    const { message = '' } = req.body;
    const files = req.files || []; // assuming you're getting files from multipart/form-data

    if (!isValidObjectId(departmentId)) {
      return res.status(400).json({ message: "Invalid department ID format." });
    }

    if ((!message.trim()) && files.length === 0) {
      return res.status(400).json({ message: "Message content or attachments are required." });
    }

    if (files.length > 5) {
      return res.status(400).json({ message: "Maximum 5 attachments allowed." });
    }

    // Check file sizes (max 10MB each)
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ message: `File ${file.originalname} exceeds 10MB limit.` });
      }
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    // Upload attachments to Cloudinary
    const attachments = [];
    for (const file of files) {
      let uploadResult;
      if (file.mimetype.startsWith('image')) {
        uploadResult = await uploadToCloudinary(file.buffer, 'department_chat_uploads');
        attachments.push({ url: uploadResult.secure_url, cld_id: uploadResult.public_id });
      } else if (file.mimetype.startsWith('video')) {
        uploadResult = await uploadVideoToCloudinary(file.buffer, 'department_chat_uploads');
        attachments.push({ url: uploadResult.videoUrl, cld_id: uploadResult.videoCldId });
      } else {
        return res.status(400).json({ message: `Unsupported file type: ${file.mimetype}` });
      }
    }

    const chatMessage = new Chat.DepartmentChat({
      department: departmentId,
      sender: senderId,
      message: message.trim(),
      attachments,
      createdAt: new Date(),
    });

    await chatMessage.save();

    return res.status(201).json({ success: true, chatMessage });
  } catch (error) {
    console.error("Error sending department message:", error);
    return res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// Get all messages for a department
const getDepartmentMessages = async (req, res) => {
  const { departmentId } = req.params;

  if (!isValidObjectId(departmentId)) {
    return res.status(400).json({ message: "Invalid department ID format." });
  }

  try {
    const messages = await Chat.DepartmentChat.find({ department: departmentId })
      .populate("sender", "name email") // populate sender details
      .sort({ createdAt: 1 }); // oldest first

    // Optional: You could include a hasMore flag if you want pagination/infinite scroll

    res.status(200).json({
      success: true,
      messages,
      count: messages.length,
    });
  } catch (error) {
    logger.error("Error fetching department messages:", error);
    console.error("Error fetching department messages:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};
// Send a general chat message
const sendGeneralMessage = async (req, res) => {
  try {
    const { message = '', attachments = [], reactions = [] } = req.body;
    const senderId = req.user._id;

    // Check sender exists
    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(404).json({ message: "User not found" });
    }

    // Validate message or attachments presence
    if ((!message || !message.trim()) && (!Array.isArray(attachments) || attachments.length === 0)) {
      return res.status(400).json({ message: "Message content or attachments are required." });
    }

    // Upload attachments to Cloudinary
    let uploadedAttachments = [];
    for (const file of attachments) {
      if (!file.base64 || !file.type) {
        return res.status(400).json({ message: "Each attachment must have base64 string and type." });
      }

      if (file.type === "image") {
        const base64Data = file.base64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadToCloudinary(buffer, "general_chat_uploads");
        uploadedAttachments.push({ url: result.secure_url, cld_id: result.public_id });
      } else if (file.type === "video") {
        const base64Data = file.base64.replace(/^data:video\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const result = await uploadVideoToCloudinary(buffer, "general_chat_uploads");
        uploadedAttachments.push({ url: result.videoUrl, cld_id: result.videoCldId });
      } else {
        return res.status(400).json({ message: "Unsupported attachment type" });
      }
    }

    // Validate reactions
    if (!Array.isArray(reactions) || reactions.some(r => !r.user || typeof r.type !== 'string')) {
      return res.status(400).json({ message: "Reactions must be an array of { user, type } objects." });
    }

    // Create new general chat message
    const newMessage = new Chat({
      sender: senderId,
      message: message.trim() || '',
      attachments: uploadedAttachments,
      reactions,
      chatType: "general",
    });

    await newMessage.save();

    // Notify all users except sender
    const users = await User.find({ _id: { $ne: senderId } });
    await Promise.all(users.map(user =>
      Notification.create({
        user: user._id,
        message: "New message in the general chat",
      })
    ));

    res.status(201).json(newMessage);

  } catch (error) {
    console.error("Error sending general message:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

// Get general chat messages
const getGeneralMessages = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find the general chat (assuming a single global chat with chatType 'general')
    // If you don't have users array for general chat, just find by chatType only
    const chat = await Chat.findOne({ chatType: 'general' });
    if (!chat) {
      return res.status(404).json({ message: 'General chat not found' });
    }

    // Optional: Confirm user is allowed (if you have access control for general chat)
    // If no users array in general chat, skip this
    if (chat.users && !chat.users.includes(userId)) {
      return res.status(403).json({ message: 'You are not a member of the general chat' });
    }

    // Fetch messages related to general chat
    const messages = await Message.find({ chat: chat._id, chatType: 'general' })
      .populate('sender', 'username firstName lastName avatar') // Populate sender info nicely
      .sort({ createdAt: 1 }); // Oldest first, easy scroll up

    // Update lastMessage field in chat to newest message (if any)
    if (messages.length > 0) {
      chat.lastMessage = messages[messages.length - 1]._id;
      await chat.save();
    }

    res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error('Error getting general messages:', error);
    res.status(500).json({ message: 'Error getting general messages', error: error.message });
  }
};

// Delete a message (Only the sender can delete)
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUserId = req.user._id;

    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    const message = await Chat.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.sender.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    await message.deleteOne();

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
  
  // Get notifications for the logged-in user
 const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User not authenticated" });
    }

    const notifications = await Notification.find({ user: userId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

  

module.exports = {
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
};
