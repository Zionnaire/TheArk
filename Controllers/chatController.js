const mongoose = require("mongoose");
const Chat = require("../Models/chat");
const {
  PrivateChat,
  UnitChat,
  DepartmentChat,
  GeneralChat,
} = require("../Models/chat"); // Ensure correct import
const Unit = require("../Models/unit");
const User = require("../Models/user");
const Department = require("../Models/departments");
const Notification = require("../Models/notification");
const Post = require("../Models/post");

const {
  uploadToCloudinary,
  uploadVideoToCloudinary,
} = require("../Middlewares/cloudinaryUpload");

const chatIo = (io) => {
  // Helper: Validate ObjectId
  const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

 
// Helper to normalize room IDs (make sure to keep this in your utils or here)
function getRoomId(senderId, receiverId) {
  return [senderId.toString(), receiverId.toString()].sort().join('_');
}

  //Send a message (All chats)
const sendMessage = async (req, res) => {
  try {
  

    const { chatType, recipientId: chatIdOrRecipientId } = req.params;
    const { message = "", reactions = "", tempId } = req.body;
    const senderId = req.user.id;
    const senderName = req.user.firstName || req.user.userName || 'Someone';

    const allowedTypes = ["private", "unit", "department", "general"];
    if (!chatType || !allowedTypes.includes(chatType)) {
      return res.status(400).json({ message: "Invalid or missing chat type." });
    }

    if (chatType !== "general" && !chatIdOrRecipientId) {
      return res.status(400).json({ message: `Missing ID parameter for ${chatType} chat.` });
    }

    let parsedReactions = [];
    if (reactions) {
      try {
        const parsed = JSON.parse(reactions);
        if (Array.isArray(parsed) && parsed.every(r => r.user && typeof r.type === "string")) {
          parsedReactions = parsed;
        } else {
          return res.status(400).json({ message: "Invalid reactions format." });
        }
      } catch (jsonError) {
        console.error("JSON parsing error for reactions:", jsonError);
        return res.status(400).json({ message: "Invalid reactions format." });
      }
    }

    const attachments = req.files?.attachments;
    const files = attachments ? (Array.isArray(attachments) ? attachments : [attachments]) : [];
    const uploadedAttachments = [];

    if (!message.trim() && files.length === 0) {
      return res.status(400).json({ message: "Message or attachments required." });
    }

    for (const file of files) {
      if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("video/")) {
        return res.status(400).json({ message: `Unsupported attachment type: ${file.mimetype}` });
      }
      try {
        console.log("File upload structure:", file);
        const buffer = file.data;
        const uploadResult = file.mimetype.startsWith("image/")
          ? await uploadToCloudinary(buffer, "chat_uploads")
          : await uploadVideoToCloudinary(buffer, "chat_uploads");

        uploadedAttachments.push({
          url: file.mimetype.startsWith("image/") ? uploadResult.secure_url : uploadResult.videoUrl,
          cld_id: uploadResult.public_id || uploadResult.videoCldId,
          type: file.mimetype
        });
      } catch (error) {
        console.error(`Error uploading attachment ${file.name}:`, error);
        return res.status(500).json({ message: `Failed to upload attachment: ${file.name}` });
      }
    }

    let newMessage;
    let chatRoomId;
    let senderTargetSockets = new Set();
    if (req.io && req.io.userSocketMap.has(senderId.toString())) {
      senderTargetSockets = req.io.userSocketMap.get(senderId.toString());
    }

    switch (chatType) {
      case "private":
        if (!isValidObjectId(chatIdOrRecipientId)) {
          return res.status(400).json({ message: "Invalid recipient ID." });
        }
        if (senderId.toString() === chatIdOrRecipientId) {
          return res.status(400).json({ message: "Cannot message yourself." });
        }

        const receiver = await User.findById(chatIdOrRecipientId);
        if (!receiver) {
          return res.status(404).json({ message: "Recipient not found." });
        }

        // Use normalized room ID helper here
        chatRoomId = getRoomId(senderId, chatIdOrRecipientId);

        newMessage = new PrivateChat({
          chatId: chatRoomId,
          senderId: senderId,
          receiverId: chatIdOrRecipientId,
          message: message.trim(),
          attachments: uploadedAttachments,
          reactions: parsedReactions
        });

        await Notification.create({
            senderId: senderId,
          user: chatIdOrRecipientId,
          type: "message",
          message: `New message from ${senderName}`,
          content: `New message from ${senderName}`,
          relatedChat: newMessage._id
        });
        break;

      case "unit":
        if (!isValidObjectId(chatIdOrRecipientId)) {
          return res.status(400).json({ message: "Invalid unit ID." });
        }
        const unit = await Unit.findById(chatIdOrRecipientId);
        if (!unit) {
          return res.status(404).json({ message: "Unit not found." });
        }

        chatRoomId = `unit_${chatIdOrRecipientId}`;

        newMessage = new UnitChat({
          chatId: chatRoomId,
          unit: chatIdOrRecipientId,
          senderId: senderId,
          message: message.trim(),
          attachments: uploadedAttachments,
          reactions: parsedReactions
        });
        break;

      case "department":
        if (!isValidObjectId(chatIdOrRecipientId)) {
          return res.status(400).json({ message: "Invalid department ID." });
        }
        const department = await Department.findById(chatIdOrRecipientId);
        if (!department) {
          return res.status(404).json({ message: "Department not found." });
        }

        chatRoomId = `department_${chatIdOrRecipientId}`;

        newMessage = new DepartmentChat({
          chatId: chatRoomId,
          department: chatIdOrRecipientId,
          senderId: senderId,
          message: message.trim(),
          attachments: uploadedAttachments,
          reactions: parsedReactions
        });
        break;

      case "general":
        chatRoomId = "general_chat";

        newMessage = new GeneralChat({
          chatId: chatRoomId,
          senderId: senderId,
          message: message.trim(),
          attachments: uploadedAttachments,
          reactions: parsedReactions,
          tempId: tempId
        });
        break;

      default:
        return res.status(400).json({ message: "Unsupported chat type." });
    }

    await newMessage.save();
    // console.log("Message saved to database:", newMessage._id);

    if (req.io) {
      const emittedMessage = {
        ...newMessage.toObject(),
        senderId: newMessage.senderId.toString(),
        receiverId: newMessage.receiverId?.toString(),
        tempId: tempId
      };

      req.io.to(chatRoomId).emit('receiveMessage', emittedMessage);
      console.log(`[ChatController] Emitted 'receiveMessage' to room ${chatRoomId}`);

      if (senderTargetSockets.size > 0) {
        req.io.to([...senderTargetSockets]).emit('messageSentConfirmation', {
          tempId: tempId,
          _id: newMessage._id.toString()
        });
        // console.log(`[ChatController] Emitted 'messageSentConfirmation' to sender's sockets for tempId: ${tempId}`);
      }
    } else {
      console.warn("[ChatController] req.io not available for emitting message.");
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: newMessage.toObject()
    });

  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};


module.exports = { sendMessage }; // Export the controller

// Get messages
  const getChatMessages = async (req, res) => {
    try {
      const currentUserId = req.user._id;
      const { chatType, id } = req.params; // e.g., chatType = "private" | "unit" | "department" | "general"
      const { before } = req.query; // timestamp for pagination
      const limit = 20;

      if (!chatType) {
        return res.status(400).json({ message: "Chat type is required." });
      }

      // Validate id for chat types that require it (not general)
      if (
        chatType !== "general" &&
        (!id || !mongoose.Types.ObjectId.isValid(id))
      ) {
        return res.status(400).json({ message: "Invalid or missing chat id." });
      }

      let Model,
        filter = {},
        dateFilter = {};

      if (before) {
        dateFilter = { createdAt: { $lt: new Date(before) } };
      }

      switch (chatType) {
        case "private":
          Model = PrivateChat;
          // Only fetch messages between current user and the other user (id)
          filter = {
            $and: [
              {
                $or: [
                  { senderId: currentUserId, receiverId: id },
                  { senderId: id, receiverId: currentUserId },
                ],
              },
              dateFilter,
            ],
          };
          break;

        case "unit":
          Model = UnitChat;
          filter = { unit: id, ...dateFilter };
          // verify currentUserId is a member of the unit here
          const unit = await Unit.findOne({
            _id: id,
            "members.userId": currentUserId,
          });
          if (!unit) {
            return res.status(403).json({
              message: "Access denied: You're not a member of this unit.",
            });
          }

          break;

        case "department":
          Model = DepartmentChat;
          filter = { department: id, ...dateFilter };
          // verify currentUserId is a member of the department here
          const department = await Department.findOne({
            _id: id,
            "members.userId": currentUserId,
          });
          if (!department) {
            return res.status(403).json({
              message: "Access denied: You're not a member of this department.",
            });
          }

          break;

        case "general":
          Model = GeneralChat;
          filter = dateFilter; // no id needed
          break;

        default:
          return res.status(400).json({ message: "Invalid chat type." });
      }

      const messages = await Model.find(filter)
        .sort({ createdAt: -1 }) // newest first for pagination
        .limit(limit)
        .populate("senderId", "username firstName lastName userImage");

      // Reverse to get oldest first for chat UI
      messages.reverse();

      return res.status(200).json({
        success: true,
        messages,
        hasMore: messages.length === limit,
      });
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  };

  // Delete a message (Only the sender can delete)
  const deleteMessage = async (req, res) => {
    try {
      const { messageId } = req.params;
      const { chatType } = req.query; // "private", "unit", "department", "general"
      const currentUserId = req.user._id;

      if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(400).json({ message: "Invalid message ID" });
      }

      let Model;
      switch (chatType) {
        case "private":
          Model = PrivateChat;
          break;
        case "unit":
          Model = UnitChat;
          break;
        case "department":
          Model = DepartmentChat;
          break;
        case "general":
          Model = GeneralChat;
          break;
        default:
          return res.status(400).json({ message: "Invalid chat type" });
      }

      const message = await Model.findById(messageId);

      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }

      if (message.senderId.toString() !== currentUserId.toString()) {
        return res
          .status(403)
          .json({ message: "You can only delete your own messages" });
      }

      await message.deleteOne();

      res.status(200).json({ message: "Message deleted successfully" });
    } catch (error) {
      console.error("Error deleting message:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  };

  const toggleReaction = async (req, res) => {
    const getChatModel = (chatType) => {
      switch (chatType) {
        case "private":
          return PrivateChat;
        case "unit":
          return UnitChat;
        case "department":
          return DepartmentChat;
        case "general":
          return GeneralChat;
        default:
          return null;
      }
    };

    try {
      const { chatType, chatId, messageId } = req.params;
      const { userId, reactionType } = req.body;

      if (
        !mongoose.Types.ObjectId.isValid(chatId) ||
        !mongoose.Types.ObjectId.isValid(messageId)
      ) {
        return res.status(400).json({ message: "Invalid chatId or messageId" });
      }

      if (!userId || !reactionType || typeof reactionType !== "string") {
        return res
          .status(400)
          .json({ message: "userId and reactionType required" });
      }

      const ChatModel = getChatModel(chatType);
      if (!ChatModel) {
        return res.status(400).json({ message: "Invalid chat type" });
      }

      // Find message by id
      const message = await ChatModel.findById(messageId);
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }

      // Ensure reactions array exists
      if (!Array.isArray(message.reactions)) {
        message.reactions = [];
      }

      // Check if user already reacted with this type
      const existingIndex = message.reactions.findIndex(
        (r) =>
          r.user.toString() === userId.toString() && r.type === reactionType
      );

      if (existingIndex > -1) {
        // Remove reaction (toggle off)
        message.reactions.splice(existingIndex, 1);
      } else {
        // Add reaction
        message.reactions.push({ user: userId, type: reactionType });
      }

      await message.save();

      return res.status(200).json(message);
    } catch (error) {
      console.error("Toggle reaction error:", error);
      return res.status(500).json({ message: "Server error" });
    }
  };

  // Get notifications for the logged-in user
  const getNotifications = async (req, res) => {
    try {
      const userId = req.user._id;
      const { page = 1, limit = 20 } = req.query;

      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized: User not authenticated" });
      }

      const skip = (page - 1) * limit;

      const notifications = await Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Notification.countDocuments({ user: userId });

      res.status(200).json({
        success: true,
        total,
        page: parseInt(page),
        notifications,
        hasMore: skip + notifications.length < total,
      });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  };

const getPrivateMessages = async (req, res) => {
  try {
    const { chatId } = req.params; // Expect chatId in the URL params
    const currentUserId = req.user.id;
    const { before } = req.query; // optional timestamp string

    // Validate chatId format
    if (!chatId || typeof chatId !== 'string' || !chatId.includes('_')) {
      return res.status(400).json({ message: "Invalid chat ID format." });
    }

    // Sort chatId for consistent querying
    const [user1Id, user2Id] = chatId.split('_').sort();
    const sortedChatId = `${user1Id}_${user2Id}`;

    const recipientId = user1Id === currentUserId ? user2Id : user1Id;

    const limit = 20; // messages per fetch

    // Mark unread messages from the other user to the current user as read
    await PrivateChat.updateMany(
      {
        senderId: recipientId,
        receiverId: currentUserId,
        chatId: sortedChatId,
        read: false,
      },
      { $set: { read: true } }
    );

    // Optional date filter
    const dateFilter = before ? { createdAt: { $lt: new Date(before) } } : {};

    // Find all messages for this sorted chatId
    const messages = await PrivateChat.find({
      chatId: sortedChatId,
      ...dateFilter,
    })
      .sort({ createdAt: -1 }) // newest first
      .limit(limit)
      .populate("senderId", "username firstName lastName userImage")
      .populate("receiverId", "username firstName lastName userImage");

    messages.reverse(); // oldest first for UI
    console.log("Retrieved private messages for chatId:", sortedChatId);

    return res.status(200).json({
      success: true,
      messages,
      hasMore: messages.length === limit,
    });

  } catch (error) {
    console.error("Error retrieving private messages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

  // GET /api/v1/private/:recipientId/exists
  const checkPrivateChatExists = async (req, res) => {
    try {
      const currentUserId = req.user.id;
      const { recipientId } = req.params;

      console.log("Backend currentUserId:", currentUserId);
      console.log("Backend recipientId:", recipientId);

      const existingChat = await PrivateChat.findOne({
        $or: [
          { senderId: currentUserId, receiverId: recipientId },
          { senderId: recipientId, receiverId: currentUserId },
        ],
      });

      console.log("Found existing chat:", existingChat);
console.log("Existing chatId:", existingChat.chatId);


     if (existingChat && existingChat.chatId) {
  return res.status(200).json({ exists: true, chatId: existingChat.chatId });
} else {
  return res.status(200).json({ exists: true, chatId: null, message: "Chat exists but chatId missing" });
}

    } catch (err) {
      console.error(err);
      return res.status(500).json({ exists: false, message: "Server error" });
    }
  };

const createPrivateChat = async (req, res) => {
  try {
    const currentUserId = req.user?.id;
    const { recipientId } = req.params;

    if (!currentUserId || !recipientId) {
      console.error("Missing sender or recipient ID", { currentUserId, recipientId });
      return res.status(400).json({
        success: false,
        message: "Sender or recipient ID is missing",
      });
    }

    // console.log(
    //   "Backend - Creating chat between:",
    //   currentUserId,
    //   "and",
    //   recipientId
    // );

    // Check if a private chat already exists in PrivateChat model
    const existingPrivateChat = await PrivateChat.findOne({
      $or: [
        { senderId: currentUserId, receiverId: recipientId },
        { senderId: recipientId, receiverId: currentUserId },
      ],
    });

    if (existingPrivateChat) {
      return res.status(200).json({
        message: "Private chat already exists",
        chatId: existingPrivateChat.chatId,
      });
    }

    // Generate a unique chatId (for PrivateChat model)
    const sortedIds = [String(currentUserId), String(recipientId)].sort();
    const privateChatId = `${sortedIds[0]}_${sortedIds[1]}`;
    console.log("Generated Private Chat ID:", privateChatId);

    // Create a new PrivateChat document
    const newPrivateChat = new PrivateChat({
      chatId: privateChatId,
      senderId: currentUserId,
      receiverId: recipientId,
    });

    const savedPrivateChat = await newPrivateChat.save();

    // Create a new Chat document (for the generic Chat model)
    const newGenericChat = new Chat({
      type: 'private',
      participants: [currentUserId, recipientId],
      _id: savedPrivateChat._id, // Use the _id from PrivateChat for consistency (optional, but can be useful)
    });

    const savedGenericChat = await newGenericChat.save();

    // Dynamically update both users' privateChats arrays with the _id of the generic Chat document
    await Promise.all([
      User.findByIdAndUpdate(currentUserId, {
        $addToSet: { privateChats: savedGenericChat._id },
      }),
      User.findByIdAndUpdate(recipientId, {
        $addToSet: { privateChats: savedGenericChat._id },
      }),
    ]);

    return res.status(201).json({
      message: "Private chat created successfully",
      chatId: savedPrivateChat.chatId, // Still return the PrivateChat chatId for other uses if needed
    });

  } catch (err) {
    console.error("Error creating private chat:", err);
    return res.status(500).json({ message: "Failed to create private chat" });
  }
};


  const getPrivateChatList = async (req, res) => {
    try {
      const currentUserId = req.user._id;
      console.log("Backend", currentUserId);

      // Fetch distinct chat pairs involving current user
      const messages = await PrivateChat.aggregate([
        {
          $match: {
            $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
          },
        },
        {
          $sort: { createdAt: -1 },
        },
        {
          $group: {
            _id: {
              user: {
                $cond: [
                  { $eq: ["$senderId", currentUserId] },
                  "$receiverId",
                  "$senderId",
                ],
              },
            },
            lastMessage: { $first: "$$ROOT" },
          },
        },
      ]);

      // Populate sender and receiver if needed
      const populated = await PrivateChat.populate(
        messages.map((m) => m.lastMessage),
        [
          { path: "senderId", select: "username firstName lastName userImage" },
          { path: "receiverId", select: "username firstName lastName userImage" },
        ]
      );

      return res.status(200).json(
        populated.map((msg) => ({
          id: msg._id,
          name: msg.senderId._id.equals(currentUserId)
            ? `${msg.receiverId.firstName} ${msg.receiverId.lastName}`
            : `${msg.senderId.firstName} ${msg.senderId.lastName}`,
          lastMessage: msg.text,
          lastMessageTimestamp: msg.createdAt,
          type: "private",
        }))
      );
    } catch (err) {
      console.error("Failed to get private chat list:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  };

  const getUnitChatList = async (req, res) => {
    try {
      const currentUser = req.user;
      const unitId = currentUser.unitId;

      if (!unitId)
        return res.status(400).json({ message: "User not assigned to a unit" });
      console.log("This is the unit ID", unitId);

      // Match correct schema field
      const lastMessage = await UnitChat.findOne({ unit: unitId })
        .sort({ createdAt: -1 })
        .populate("senderId", "firstName lastName")
        .lean();

      const preview = lastMessage
        ? {
            id: unitId.toString(),
            name: currentUser.unitName || "Your Unit",
            lastMessage: lastMessage.message,
            lastMessageTimestamp: lastMessage.createdAt,
            type: "unit",
          }
        : null;

      res.status(200).json(preview ? [preview] : []);
    } catch (err) {
      console.error("Error in getUnitChatList:", err);
      res.status(500).json({ message: "Failed to fetch unit chats" });
    }
  };

  const getDepartmentChatList = async (req, res) => {
    try {
      const currentUser = req.user;
      const departmentId = currentUser.departmentId;

      if (!departmentId)
        return res
          .status(400)
          .json({ message: "User not assigned to a department" });
      console.log("This is the department ID", departmentId);

      const lastMessage = await DepartmentChat.findOne({
        department: departmentId,
      })
        .sort({ createdAt: -1 })
        .populate("senderId", "firstName lastName")
        .lean();

      const preview = lastMessage
        ? {
            id: departmentId.toString(),
            name: currentUser.departmentName || "Your Department",
            lastMessage: lastMessage.message,
            lastMessageTimestamp: lastMessage.createdAt,
            type: "department",
          }
        : null;

      res.status(200).json(preview ? [preview] : []);
    } catch (err) {
      console.error("Error in getDepartmentChatList:", err);
      res.status(500).json({ message: "Failed to fetch department chats" });
    }
  };

  const getGeneralChatList = async (req, res) => {
    try {
      // Get latest general message (no filter)
      const lastMessage = await GeneralChat.findOne()
        .sort({ createdAt: -1 })
        .populate("senderId", "firstName lastName")
        .lean();

      const preview = lastMessage
        ? {
            id: "general", // fixed ID
            name: "General Chat",
            lastMessage: lastMessage.message,
            lastMessageTimestamp: lastMessage.createdAt,
            type: "general",
          }
        : null;

      res.status(200).json(preview ? [preview] : []);
    } catch (err) {
      console.error("Error in getGeneralChatList:", err);
      res.status(500).json({ message: "Failed to fetch general chats" });
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

      if (!unit.members.some((memberId) => memberId.equals(userId))) {
        return res
          .status(403)
          .json({ message: "You are not a member of this unit" });
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
        .populate("senderId", "username firstName lastName userImage");

      // Reverse to oldest first for client rendering
      messages.reverse();

      // Optional: mark unread messages as read for this user
      await Chat.updateMany(
        {
          chatType: "unit",
          unit: unitId,
          readBy: { $ne: userId }, // not read by this user
        },
        {
          $addToSet: { readBy: userId },
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
      return res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  };

  // Get all messages for a department
  const getDepartmentMessages = async (req, res) => {
    const { departmentId } = req.params;

    if (!isValidObjectId(departmentId)) {
      return res.status(400).json({ message: "Invalid department ID format." });
    }

    try {
      const messages = await Chat.DepartmentChat.find({
        department: departmentId,
      })
        .populate("senderId", "name email") // populate sender details
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
      res
        .status(500)
        .json({ message: "Server error. Please try again later." });
    }
  };

  // Get general chat messages
  const getGeneralMessages = async (req, res) => {
    try {
      const userId = req.user._id;

      // Find the general chat (assuming a single global chat with chatType 'general')
      // If you don't have users array for general chat, just find by chatType only
      const chat = await Chat.findOne({ chatType: "general" });
      if (!chat) {
        return res.status(404).json({ message: "General chat not found" });
      }

      // Confirm user is allowed (if you have access control for general chat)
      // If no users array in general chat, skip this
      if (chat.users && !chat.users.includes(userId)) {
        return res
          .status(403)
          .json({ message: "You are not a member of the general chat" });
      }

      // Fetch messages related to general chat
      const messages = await Post.find({ chat: chat._id, chatType: "general" })
        .populate("senderId", "username firstName lastName avatar") // Populate sender info nicely
        .sort({ createdAt: 1 }); // Oldest first, easy scroll up

      // Update lastMessage field in chat to newest message (if any)
      if (messages.length > 0) {
        chat.lastMessage = messages[messages.length - 1]._id;
        await chat.save();
      }

      res.status(200).json({ success: true, messages });
    } catch (error) {
      console.error("Error getting general messages:", error);
      res.status(500).json({
        message: "Error getting general messages",
        error: error.message,
      });
    }
  };
  
  
const getCombinedChatlist = async (req, res) => {
  try {
    const userId = req.user.id?.toString();
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized - User ID not found in request' });
    }

    const user = await User.findById(userId)
      .populate('privateChats')
      .populate('unitChats')
      .populate('departmentChats')
      .populate('generalChats');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const privateChatsPromise = PrivateChat.find({
      _id: { $in: user.privateChats || [] },
    })
      .populate({ path: 'senderId', select: 'userName userImage' })
      .populate({ path: 'receiverId', select: 'userName userImage' })
      .sort({ createdAt: -1 });

    const unitChatsPromise = UnitChat.find({
      _id: { $in: user.unitChats || [] },
    })
      .populate({ path: 'unit', select: 'name' })
      .populate({ path: 'senderId', select: 'userName userImage' })
      .sort({ createdAt: -1 });

    const departmentChatsPromise = DepartmentChat.find({
      _id: { $in: user.departmentChats || [] },
    })
      .populate({ path: 'department', select: 'name' })
      .populate({ path: 'senderId', select: 'userName userImage' })
      .sort({ createdAt: -1 });

    const generalChatsPromise = GeneralChat.find({
      _id: { $in: user.generalChats || [] },
    })
      .populate({ path: 'senderId', select: 'userName userImage' })
      .sort({ createdAt: -1 });

    const [privateChatsResult, unitChatsResult, departmentChatsResult, generalChatsResult] = await Promise.all([
      privateChatsPromise,
      unitChatsPromise,
      departmentChatsPromise,
      generalChatsPromise,
    ]);

    const normalized = [
      ...(privateChatsResult || []).map((chat) => {
        const senderId = chat.senderId?._id?.toString();
        const receiverId = chat.receiverId?._id?.toString();

        // 🚫 Skip self-chats
        if (!senderId || !receiverId || senderId === receiverId) return null;

        const otherParticipant = senderId === userId ? chat.receiverId : chat.senderId;

        return {
id: `${chat.senderId._id}_${chat.receiverId._id}`, 
          type: 'private',
          name: otherParticipant?.userName || 'Private Chat',
          userImage: otherParticipant?.userImage || [],
          lastMessage: chat.lastMessage || '',
          lastMessageTimestamp: chat.createdAt,
          unreadCount: 0,
          participants: [
            {
              id: otherParticipant?._id?.toString(),
              userName: otherParticipant?.userName,
              userImage: otherParticipant?.userImage,
            },
          ],
        };
      }).filter(Boolean), // ✅ Filter out nulls caused by self-chats or missing data

      ...(unitChatsResult || []).map((chat) => ({
        id: chat._id.toString(),
        type: 'unit',
        name: chat.unit?.name || 'Unit Chat',
        lastMessage: chat.message || '',
        lastMessageTimestamp: chat.createdAt,
        unreadCount: 0,
        participants: [],
      })),

      ...(departmentChatsResult || []).map((chat) => ({
        id: chat._id.toString(),
        type: 'department',
        name: chat.department?.name || 'Department Chat',
        lastMessage: chat.message || '',
        lastMessageTimestamp: chat.createdAt,
        unreadCount: 0,
        participants: [],
      })),

      ...(generalChatsResult || []).map((chat) => ({
        id: chat._id.toString(),
        type: 'general',
        name: 'General Chat',
        lastMessage: chat.message || '',
        lastMessageTimestamp: chat.createdAt,
        unreadCount: 0,
        participants: [],
      })),
    ];

    normalized.sort(
      (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
    );

    return res.status(200).json({ data: normalized });
  } catch (error) {
    console.error('Error fetching combined chat list:', error);
    return res.status(500).json({ message: 'Failed to fetch combined chat list' });
  }
};

  return {
    createPrivateChat,
    deleteMessage,
    getNotifications,
    sendMessage,
    getChatMessages,
    toggleReaction,
    getGeneralMessages,
    getDepartmentMessages,
    getPrivateMessages,
    getUnitMessages,
    getPrivateChatList,
    getUnitChatList,
    getDepartmentChatList,
    getGeneralChatList,
    checkPrivateChatExists,
    getCombinedChatlist
  };
};

module.exports = chatIo;
