const mongoose = require("mongoose");
const Chat = require("../Models/AllChats"); // Import the main Chat model that holds all chat types
const Message = require("../Models/messages"); // New: Import your new Message model for individual messages
const {
  PrivateChat,
  UnitChat,
  DepartmentChat,
  GeneralChat,
} = require("../Models/chat");
const Unit = require("../Models/unit");
const User = require("../Models/user");
const Department = require("../Models/departments");
const Notification = require("../Models/notification");
const Announcement = require("../Models/announcements");
const Post = require("../Models/post");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * 
  Okay...I think the best way to maintain a good app is to send messages or posts through Socket and not calling HTTP all the time...If you think this is the best approach to this live messaging, I would like to implement it with full cache...So maybe we should start from the backend and work it up to the frontend...So tell me what you need from from the Backend 
 * 
 */

const {
  uploadToCloudinary,
  uploadVideoToCloudinary,
  uploadDocumentToCloudinary,
} = require("../Middlewares/cloudinaryUpload");
const Church = require("../Models/churchesAdmin");

const chatIo = (io) => {
  // Helper: Validate ObjectId
  const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

  // Helper to consistently determine the privateChatIdentifier from participant IDs
  const getPrivateChatIdentifier = (participant1Id, participant2Id) => {
    const sortedIds = [String(participant1Id), String(participant2Id)].sort();
    return `${sortedIds[0]}_${sortedIds[1]}`;
  };

  const checkPrivateChatExists = async (req, res) => {
    try {
      const currentUserId = req.user._id; // Assuming req.user._id is correctly populated
      const { recipientId } = req.params;

      console.log("Backend currentUserId:", currentUserId);
      console.log("Backend recipientId:", recipientId);

      // Ensure IDs are strings for sorting, as they might be ObjectId objects for consistency
      const sortedParticipantIds = [
        currentUserId.toString(),
        recipientId.toString(),
      ].sort();

      // 1. Query the generic Chat model first
      // This is the main source of truth for whether a conversation exists
      const existingGenericChat = await Chat.findOne({
        chatType: "private", // Filter for private chats
        participants: { $all: sortedParticipantIds }, // Check if both participants are present
      }).populate("privateChatRef"); // Populate to get access to the specific PrivateChat document if it exists

      console.log("Found existing generic chat:", existingGenericChat);

      if (existingGenericChat) {
        // A generic chat exists. Now, check if its specific PrivateChat reference is also valid.
        if (
          existingGenericChat.privateChatRef &&
          existingGenericChat.privateChatRef.chatId
        ) {
          console.log("Existing generic chatId:", existingGenericChat._id);
          console.log(
            "Associated PrivateChat identifier:",
            existingGenericChat.privateChatRef.chatId
          );

          return res.status(200).json({
            exists: true,
            chatId: existingGenericChat._id, // Return the _id of the generic Chat document
            privateChatIdentifier: existingGenericChat.privateChatRef.chatId, // Optional: The old string ID from PrivateChat
            message: "Generic private chat found and ID retrieved.",
          });
        } else {
          // This scenario means a generic chat document exists, but its linked PrivateChat
          // document is missing or malformed (missing chatId). This indicates a data integrity issue.
          console.warn(
            `Generic Chat ${existingGenericChat._id} found, but associated PrivateChatRef is missing or invalid!`
          );
          // You might decide to return `exists: false` here, as the chat is incomplete,
          // or a different status code like 500 if this should never happen.
          return res.status(200).json({
            exists: false,
            chatId: null,
            message:
              "Generic chat exists, but its associated private chat details are incomplete. Consider data repair.",
          });
        }
      } else {
        // No generic chat found between these users.
        console.log(
          "No existing generic private chat found between these users."
        );
        return res.status(200).json({
          exists: false,
          chatId: null,
          message: "No existing private chat found. A new chat can be created.",
        });
      }
    } catch (err) {
      console.error("Error in checkPrivateChatExists:", err);
      // Handle specific Mongoose errors if needed, otherwise, generic 500.
      return res.status(500).json({
        exists: false,
        message: "Server error checking chat existence.",
        error: err.message, // Include error message for debugging
      });
    }
  };

  const createPrivateChat = async (req, res) => {
    try {
      const currentUserId = req.user._id; // Assumed to be populated by verifyToken middleware
      const { recipientId } = req.params; // Get recipientId from URL parameters

      if (!currentUserId || !recipientId) {
        console.error("Missing sender or recipient ID for chat creation", {
          currentUserId,
          recipientId,
        });
        return res.status(400).json({
          success: false,
          message: "Sender or recipient ID is missing.",
        });
      }

      if (currentUserId === recipientId) {
        return res.status(400).json({
          success: false,
          message: "Cannot create a private chat with yourself.",
        });
      }

      // 1. Generate the deterministic identifier for the specific PrivateChat document
      const privateChatIdentifier = getPrivateChatIdentifier(
        currentUserId,
        recipientId
      );

      // 2. Try to find the Generic Chat document that links to this private conversation
      // This is the primary chat instance the frontend will use.
      let existingGenericChat = await Chat.findOne({
        chatType: "private",
        // Find where participants array contains BOTH (currentUserId AND recipientId)
        participants: { $all: [currentUserId, recipientId] },
      }).populate("privateChatRef"); // Populate to ensure we can check the privateChatRef's ID

      if (existingGenericChat) {
        console.log(
          `[Backend] Generic private chat document already exists (ID: ${existingGenericChat._id}). Returning existing chat.`
        );
        // If a generic chat already exists, return its _id.
        // The frontend uses this _id for navigation and message fetching.
        return res.status(200).json({
          success: true,
          message: "Private chat already exists.",
          chatId: existingGenericChat._id.toString(), // The Mongoose _id of the Generic Chat
          privateChatIdentifier: existingGenericChat.privateChatRef
            ? existingGenericChat.privateChatRef.chatId
            : privateChatIdentifier, // The deterministic string ID
        });
      }

      console.log(
        `[Backend] No existing generic private chat found for identifier: ${privateChatIdentifier}. Proceeding to create.`
      );

      // 3. Create the specific PrivateChat document (if generic chat doesn't exist)
      // This document holds details unique to the one-on-one conversation.
      const newPrivateChat = new PrivateChat({
        chatId: privateChatIdentifier, // This is your unique index field for privatechats
        senderId: currentUserId, // Or just use `participants` in PrivateChat as well
        receiverId: recipientId,
        // lastMessage, attachments, reactions, read are now handled by the Message model and Generic Chat model
      });
      const savedPrivateChat = await newPrivateChat.save();
      console.log(
        "Specific PrivateChat document saved with _id:",
        savedPrivateChat._id
      );

      // 4. Create the Generic Chat document that links to the PrivateChat
      // This is the main chat entry for both users in their chat lists.
      const newGenericChat = new Chat({
        chatType: "private",
        participants: [currentUserId, recipientId], // Store participants as ObjectIds
        privateChatRef: savedPrivateChat._id, // Link to the specific PrivateChat document
        lastMessageTimestamp: new Date(), // Initialize timestamp for sorting in chat list
        unreadCounts: [
          // Initialize unread counts for both participants
          { user: currentUserId, count: 0 },
          { user: recipientId, count: 0 },
        ],
      });
      const savedGenericChat = await newGenericChat.save();
      console.log(
        "Generic Chat document saved with _id:",
        savedGenericChat._id
      );

      // 5. Update both users' chat arrays to reference the new generic Chat document
      // The `privateChats` array in the User model now references the generic `Chat` model's `_id`
      await Promise.all([
        User.findByIdAndUpdate(
          currentUserId,
          { $addToSet: { privateChats: savedGenericChat._id } },
          { new: true }
        ),
        User.findByIdAndUpdate(
          recipientId,
          { $addToSet: { privateChats: savedGenericChat._id } },
          { new: true }
        ),
      ]);
      console.log("Users' privateChats arrays updated with generic chat _id.");

      // 6. Return success response with the generic chat's _id for frontend navigation
      return res.status(201).json({
        success: true,
        message: "Private chat created successfully",
        chatId: savedGenericChat._id.toString(), // Frontend uses this ID for ChatRoomScreen
        privateChatIdentifier: savedPrivateChat.chatId, // The deterministic string identifier (for backend uniqueness)
      });
    } catch (err) {
      console.error("[Backend] Error creating private chat:", err);
      if (err.code === 11000) {
        // MongoDB duplicate key error
        // This means the `privateChatIdentifier` was duplicated during the `newPrivateChat.save()`
        // which implies the initial `Chat.findOne` didn't catch it. This should be rare with the
        // current logic, but if it happens, it means a race condition is still possible.
        // In such a case, you might attempt to retrieve the existing chat, but for now, log and return conflict.
        console.warn(
          `[Backend] Duplicate key error (E11000) for chatId: ${err.keyValue?.chatId}.`
        );
        return res.status(409).json({
          success: false,
          message:
            "Chat already exists. Please try fetching the chat list again.",
          error: err.message,
        });
      }
      // Handle other validation errors from Mongoose
      if (err.name === "ValidationError") {
        const errors = Object.keys(err.errors).map((key) => ({
          path: err.errors[key].path,
          message: err.errors[key].message,
          value: err.errors[key].value,
        }));
        return res.status(400).json({
          success: false,
          message: "Validation failed during chat creation",
          errors: errors,
        });
      }
      return res.status(500).json({
        success: false,
        message: "Failed to create private chat",
        error: err.message,
      });
    }
  };

  const getCombinedChatlist = async (req, res) => {
    try {
      const userId = req.user._id;
      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized - User ID not found in request" });
      }

      console.log(`[Backend] getCombinedChatList called for userId: ${userId}`);

      // Fetch chats where the user is a participant
      let query = { participants: userId };
      if (req.query.includeGeneralChat === "true") {
        query = { $or: [{ participants: userId }, { chatType: "general" }] };
      }

      const chats = await Chat.find(query)
        .populate({
          path: "participants",
          select: "userName firstName lastName userImage isOnline",
        })
        .populate({
          path: "unit",
          select: "unitName unitLogo",
        })
        .populate({
          path: "department",
          select: "deptName unit",
          populate: { path: "unit", select: "unitName unitLogo" },
        })
        .populate({
          path: "church",
          select: "churchName churchLogo",
        })
        .lean();

      if (!chats || chats.length === 0) {
        console.log(`[Backend] No chats found for userId: ${userId}`);
        return res
          .status(200)
          .json({ data: [], message: "No chats found for this user." });
      }

      const normalizedChatList = await Promise.all(
        chats.map(async (chat) => {
          let chatName = "Unknown Chat";
          let userImage = [];
          let privateRecipientId = null;
          let privateRecipientImage = [];
          let unitId = chat.unit?._id?.toString();
          let departmentId = chat.department?._id?.toString();

          // Fetch last message
          const lastMessage = await Message.findOne({ chat: chat._id })
            .sort({ createdAt: -1 })
            .lean();

          // Unread count
          const userUnreadEntry = chat.unreadCounts?.find(
            (uc) => uc.user.toString() === userId.toString()
          );
          const unreadCount = userUnreadEntry ? userUnreadEntry.count : 0;

          switch (chat.chatType) {
            case "private":
              const otherParticipant = chat.participants.find(
                (p) => p._id.toString() !== userId.toString()
              );
              if (otherParticipant) {
                chatName =
                  otherParticipant.userName ||
                  `${otherParticipant.firstName || ""} ${
                    otherParticipant.lastName || ""
                  }`.trim() ||
                  "Private Chat";
                userImage = otherParticipant.userImage?.length
                  ? otherParticipant.userImage.map((img) => ({
                      url: img.url || "",
                      cld_id: img.cld_id || "",
                    }))
                  : [];
                privateRecipientId = otherParticipant._id.toString();
                privateRecipientImage = otherParticipant.userImage?.length
                  ? otherParticipant.userImage.map((img) => ({
                      url: img.url || "",
                      cld_id: img.cld_id || "",
                    }))
                  : [];
              }
              break;
            case "unit":
              if (chat.unit) {
                chatName = chat.unit.unitName || "Unit Chat";
                userImage = chat.unit.unitLogo?.length
                  ? chat.unit.unitLogo.map((img) => ({
                      url: img.url || "",
                      cld_id: img.cld_id || "",
                    }))
                  : [];
              }
              break;
            case "department":
              if (chat.department) {
                chatName = chat.department.deptName || "Department Chat";
                userImage = chat.department.unit?.unitLogo?.length
                  ? chat.department.unit.unitLogo.map((img) => ({
                      url: img.url || "",
                      cld_id: img.cld_id || "",
                    }))
                  : [];
                unitId = chat.department.unit?._id?.toString();
              }
              break;
            case "general":
              if (chat.church) {
                chatName = chat.church.churchName || "General Church Chat";
                userImage = chat.church.churchLogo?.length
                  ? chat.church.churchLogo.map((img) => ({
                      url: img.url || "",
                      cld_id: img.cld_id || "",
                    }))
                  : [];
              }
              break;
            default:
              chatName = "Unknown Chat Type";
          }

          return {
            id: chat._id.toString(),
            chatType: chat.chatType,
            name: chatName,
            lastMessage: lastMessage
              ? lastMessage.messageText ||
                lastMessage.attachments?.[0] ||
                "No messages yet..."
              : "No messages yet...",
            lastMessageTimestamp: lastMessage?.createdAt || chat.createdAt,
            userImage,
            churchId: chat.church?._id?.toString(),
            churchName: chat.church?.churchName || "",
            churchLogo: chat.church?.churchLogo?.length
              ? chat.church.churchLogo.map((img) => ({
                  url: img.url || "",
                  cld_id: img.cld_id || "",
                }))
              : [],
            privateRecipientId,
            privateRecipientImage,
            userName:
              chat.chatType === "private"
                ? chat.participants.find(
                    (p) => p._id.toString() !== userId.toString()
                  )?.userName
                : undefined,
            firstName:
              chat.chatType === "private"
                ? chat.participants.find(
                    (p) => p._id.toString() !== userId.toString()
                  )?.firstName
                : undefined,
            lastName:
              chat.chatType === "private"
                ? chat.participants.find(
                    (p) => p._id.toString() !== userId.toString()
                  )?.lastName
                : undefined,
            isOnline:
              chat.chatType === "private"
                ? chat.participants.find(
                    (p) => p._id.toString() !== userId.toString()
                  )?.isOnline || false
                : false,
            unreadCount,
            isMuted: chat.isMuted || false,
            isArchived: chat.isArchived || false,
            unitId,
            departmentId,
            participants: chat.participants
              .filter((p) => mongoose.Types.ObjectId.isValid(p._id))
              .map((p) => ({
                _id: p._id.toString(),
                userName: p.userName,
                firstName: p.firstName,
                lastName: p.lastName,
                userImage: p.userImage?.length
                  ? p.userImage.map((img) => ({
                      url: img.url || "",
                      cld_id: img.cld_id || "",
                    }))
                  : [],
                isOnline: p.isOnline || false,
              })),
          };
        })
      );

      normalizedChatList.sort(
        (a, b) =>
          new Date(b.lastMessageTimestamp).getTime() -
          new Date(a.lastMessageTimestamp).getTime()
      );

      console.log(`[Backend] getCombinedChatList success`, {
        userId,
        chatCount: normalizedChatList.length,
      });

      return res.status(200).json({ data: normalizedChatList });
    } catch (error) {
      console.error("[Backend] Error fetching combined chat list:", {
        message: error.message,
        stack: error.stack,
        userId: req.user?._id,
      });
      return res.status(500).json({
        message: "Failed to fetch combined chat list",
        error: error.message,
      });
    }
  };

const sendMessage = async (req, res) => {
  try {
    const { chatType, recipientId: targetId } = req.params;
    const { message = "", reactions = "[]", tempId, replyTo } = req.body;
    const senderId = req.user._id;
    const senderDetails = req.user;

    const allowedTypes = ["private", "unit", "department", "general"];
    if (!chatType || !allowedTypes.includes(chatType)) {
      return res.status(400).json({ message: "Invalid or missing chat type." });
    }

    if (chatType !== "general" && !targetId) {
      return res.status(400).json({ message: `Missing ID parameter for ${chatType} chat.` });
    }

    let parsedReactions = [];
    try {
      const parsed = JSON.parse(reactions);
      if (
        Array.isArray(parsed) &&
        parsed.every((r) => typeof r === "object" && r.user && typeof r.type === "string")
      ) {
        parsedReactions = parsed;
      } else if (reactions !== "[]") {
        return res.status(400).json({ message: "Invalid reactions format." });
      }
    } catch (jsonError) {
      console.error("[sendMessage] JSON parsing error for reactions:", jsonError);
      return res.status(400).json({ message: "Invalid reactions format." });
    }

    const attachments = req.files?.attachments;
    const files = attachments
      ? Array.isArray(attachments)
        ? attachments
        : [attachments]
      : [];
    const uploadedAttachments = [];

    if (!message.trim() && files.length === 0 && !replyTo) {
      return res.status(400).json({
        message: "Message, attachments, or a reply target required.",
      });
    }

    for (const file of files) {
      try {
        const buffer = file.data;
        let uploadResult;
        if (file.mimetype.startsWith("image/")) {
          uploadResult = await uploadToCloudinary(buffer, "chat_uploads");
        } else if (file.mimetype.startsWith("video/")) {
          uploadResult = await uploadVideoToCloudinary(buffer, "chat_uploads");
        } else {
          uploadResult = await uploadDocumentToCloudinary(buffer, "chat_Uploads", file.mimetype);
        }

        uploadedAttachments.push({
          url: uploadResult.secure_url || uploadResult.videoUrl || uploadResult.fileUrl,
          cld_id: uploadResult.public_id || uploadResult.videoCldId || uploadResult.fileCldId,
          type: file.mimetype || "application/octet-stream",
          name: file.name ? decodeURIComponent(file.name) : "Unknown",
          size: file.size ? file.size.toString() : "Unknown",
        });
      } catch (error) {
        console.error(`[sendMessage] Error uploading attachment ${file.name}:`, error);
        return res.status(500).json({ message: `Failed to upload attachment: ${file.name}` });
      }
    }

    let genericChatDocument;
    let chatRoomId;
    let actualChatParticipants = [];
    let unitId;

    switch (chatType) {
      case "private":
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
          return res.status(400).json({ message: "Invalid recipient ID for private chat." });
        }
        if (senderId.toString() === targetId) {
          return res.status(400).json({ message: "Cannot send message to yourself." });
        }

        const receiver = await User.findById(targetId);
        if (!receiver) {
          return res.status(404).json({ message: "Recipient not found." });
        }

        const sortedParticipantIds = [String(senderId), String(targetId)].sort();
        genericChatDocument = await Chat.findOne({
          chatType: "private",
          participants: { $all: sortedParticipantIds },
        });

        if (!genericChatDocument) {
          console.log(`[sendMessage] Creating new private chat for sender ${senderId} and recipient ${targetId}.`);
          const privateChatIdentifier = `${sortedParticipantIds[0]}_${sortedParticipantIds[1]}`;
          const newPrivateChatRef = await new PrivateChat({
            chatId: privateChatIdentifier,
            senderId: senderId,
            receiverId: targetId,
          }).save();

          genericChatDocument = await new Chat({
            chatType: "private",
            participants: [senderId, targetId],
            privateChatRef: newPrivateChatRef._id,
            unreadCounts: [
              { user: senderId, count: 0 },
              { user: targetId, count: 0 },
            ],
          }).save();

          await Promise.all([
            User.findByIdAndUpdate(senderId, {
              $addToSet: { privateChats: genericChatDocument._id },
            }),
            User.findByIdAndUpdate(targetId, {
              $addToSet: { privateChats: genericChatDocument._id },
            }),
          ]);
        }
        chatRoomId = genericChatDocument._id.toString();
        actualChatParticipants = genericChatDocument.participants.map((id) => id.toString());
        break;

      case "unit":
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
          return res.status(400).json({ message: "Invalid chat ID for unit chat." });
        }
        genericChatDocument = await Chat.findById(targetId);
        if (!genericChatDocument || genericChatDocument.chatType !== "unit") {
          const unit = await Unit.findOne({ chatId: targetId }).select("members name unitHead _id");
          if (!unit) {
            return res.status(404).json({
              message: "Unit chat not found and no associated unit found.",
            });
          }
          console.log(`[sendMessage] Creating new unit chat for unit ${unit._id}.`);
          genericChatDocument = await new Chat({
            chatType: "unit",
            unit: unit._id,
            participants: unit.members
              .concat(unit.unitHead)
              .filter((id, index, self) => id && self.indexOf(id) === index),
            unreadCounts: unit.members
              .concat(unit.unitHead)
              .filter((id, index, self) => id && self.indexOf(id) === index)
              .map((member) => ({
                user: member,
                count: 0,
              })),
            name: `${unit.unitName} Chat`,
            description: `Chat for ${unit.unitName}`,
          }).save();
          unit.chatId = genericChatDocument._id;
          await unit.save();
        }
        if (!genericChatDocument.unit) {
          return res.status(404).json({ message: "Unit reference missing in chat." });
        }
        const unit = await Unit.findById(genericChatDocument.unit).select("members unitName unitHead");
        if (!unit) {
          return res.status(404).json({ message: "Unit not found." });
        }
        if (
          !unit.members.some((member) => member.equals(senderId)) &&
          !unit.unitHead.equals(senderId)
        ) {
          return res.status(403).json({ message: "You are not a member or head of this unit." });
        }
        chatRoomId = genericChatDocument._id.toString();
        actualChatParticipants = unit.members.concat(unit.unitHead).map((m) => m._id.toString());
        unitId = unit._id.toString();
        break;

      case "department":
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
          console.warn(`[sendMessage] Invalid department ID: ${targetId}`);
          return res.status(400).json({ message: "Invalid department ID." });
        }
        const department = await Department.findById(targetId).select("members deptName unit");
        if (!department) {
          console.warn(`[sendMessage] Department not found for departmentId: ${targetId}`);
          return res.status(404).json({ message: "Department not found." });
        }
        if (!department.members.some((member) => member.toString() === senderId.toString())) {
          console.warn(`[sendMessage] User ${senderId} not a member of department ${targetId}`);
          return res.status(403).json({ message: "You are not a member of this department." });
        }
        const unitDoc = await Unit.findById(department.unit).select("members");
        if (
          !unitDoc ||
          !unitDoc.members.some((member) => member.toString() === senderId.toString())
        ) {
          console.warn(`[sendMessage] User ${senderId} not in unit ${department.unit} for department ${targetId}`);
          return res.status(403).json({ message: "You are not a member of the unit." });
        }
        genericChatDocument = await Chat.findOne({
          chatType: "department",
          department: targetId,
        });
        if (!genericChatDocument) {
          console.log(`[sendMessage] Creating new department chat for department ${targetId}`);
          genericChatDocument = await new Chat({
            chatType: "department",
            department: targetId,
            participants: department.members,
            unreadCounts: department.members.map((member) => ({
              user: member,
              count: 0,
            })),
            name: `${department.deptName} Chat`,
            description: `Chat for ${department.deptName}`,
            unit: department.unit,
          }).save();
          await Department.findByIdAndUpdate(targetId, {
            chatId: genericChatDocument._id,
          });
          await User.updateMany(
            { _id: { $in: department.members } },
            {
              $addToSet: {
                departmentChats: {
                  id: genericChatDocument._id,
                  name: department.deptName,
                },
              },
            }
          );
        }
        chatRoomId = genericChatDocument._id.toString();
        actualChatParticipants = department.members.map((m) => m._id.toString());
        break;

      case "general":
        genericChatDocument = await Chat.findOne({ chatType: "general" });
        if (!genericChatDocument) {
          console.log("[sendMessage] Creating new general chat.");
          const newGeneralChatRef = await new GeneralChat({
            chatId: "general_chat",
          }).save();
          genericChatDocument = await new Chat({
            chatType: "general",
            participants: [],
            generalChatRef: newGeneralChatRef._id,
            unreadCounts: [],
            name: "General Church Chat",
            description: "Chat for all church members",
          }).save();
        }
        chatRoomId = genericChatDocument._id.toString();
        const allUsers = await User.find({}).select("_id").lean();
        const church = await Church.findOne({}).select("_id churchName churchLogo").lean();
        actualChatParticipants = allUsers.map((u) => u._id.toString());
        break;

      default:
        return res.status(400).json({ message: "Unsupported chat type." });
    }

    if (!genericChatDocument) {
      return res.status(500).json({ message: "Could not establish or find chat context." });
    }

    const newMessage = new Message({
      chat: genericChatDocument._id,
      sender: senderId,
      messageText: message.trim() || "",
      attachments: uploadedAttachments,
      reactions: parsedReactions,
      contentType:
        uploadedAttachments.length > 0
          ? uploadedAttachments[0].type.startsWith("image")
            ? "image"
            : uploadedAttachments[0].type.startsWith("video")
            ? "video"
            : "file"
          : message.trim()
          ? "text"
          : "reaction_only",
      replyTo: replyTo && mongoose.Types.ObjectId.isValid(replyTo) ? replyTo : undefined,
      readBy: [{ user: senderId, readAt: new Date() }],
      metadata: req.body.announcementId ? { announcementId: req.body.announcementId } : {},
    });

    const savedMessage = await newMessage.save();
    console.log(`[sendMessage] Message saved: _id=${savedMessage._id}, chatType=${chatType}, chatRoomId=${chatRoomId}`);

    const populatedSavedMessage = await Message.findById(savedMessage._id)
      .populate("sender", "userName firstName lastName userImage")
      .populate({
        path: "replyTo",
        select: "messageText sender",
        populate: { path: "sender", select: "userName firstName lastName userImage" },
      })
      .populate({
        path: "chat",
        select: "name chatType participants church unit department",
        populate: [
          { path: "church", select: "churchName churchLogo _id" },
          { path: "unit", select: "unitName unitLogo _id" },
          { path: "department", select: "deptName deptLogo _id" },
        ],
      })
      .lean();

    // Handle missing sender for general chat messages
    if (!populatedSavedMessage.sender && chatType === "general") {
      populatedSavedMessage.sender = {
        _id: senderId.toString(),
        userName: senderDetails.userName || "Church Admin",
        firstName: senderDetails.firstName || "Church",
        lastName: senderDetails.lastName || "",
        userImage: senderDetails.userImage || [],
      };
    }

    populatedSavedMessage.messageText = populatedSavedMessage.messageText || "";

    const chatBeforeUpdate = await Chat.findById(genericChatDocument._id).lean();
    const updatedUnreadCounts = chatBeforeUpdate.unreadCounts.map((uc) => {
      if (uc.user.toString() !== senderId.toString()) {
        return { user: uc.user, count: uc.count + 1 };
      }
      return uc;
    });

    await Chat.findByIdAndUpdate(
      genericChatDocument._id,
      {
        lastMessageText:
          savedMessage.messageText ||
          (savedMessage.attachments.length > 0
            ? `Attachment (${savedMessage.attachments[0].name})`
            : savedMessage.replyTo
            ? "Replied to a message"
            : "System message"),
        lastMessageSender: savedMessage.sender,
        lastMessageAt: savedMessage.createdAt,
        unreadCounts: updatedUnreadCounts,
      },
      { new: true }
    );

    const io = req.app.get("io");
    if (io) {
      const messageToEmit = {
        _id: populatedSavedMessage._id.toString(),
        chatId: chatRoomId,
        senderId: populatedSavedMessage.sender ? populatedSavedMessage.sender._id.toString() : senderId.toString(),
        sender: populatedSavedMessage.sender || {
          _id: senderId.toString(),
          userName: senderDetails.userName || "Unknown",
          firstName: senderDetails.firstName || "Unknown",
          lastName: senderDetails.lastName || "",
          userImage: senderDetails.userImage || [],
        },
        messageText: populatedSavedMessage.messageText,
        attachments: populatedSavedMessage.attachments || [],
        type: populatedSavedMessage.contentType || "text",
        createdAt: populatedSavedMessage.createdAt.toISOString(),
        readBy: populatedSavedMessage.readBy.map((entry) => ({
          user: entry.user.toString(),
          readAt: entry.readAt.toISOString(),
        })),
        tempId: tempId || null,
        status: "sent",
        replyTo: populatedSavedMessage.replyTo || null,
        reactions: populatedSavedMessage.reactions || [],
        announcementId: populatedSavedMessage.metadata?.announcementId || null,
        chat: populatedSavedMessage.chat
          ? {
              _id: populatedSavedMessage.chat._id.toString(),
              name: populatedSavedMessage.chat.name,
              chatType: populatedSavedMessage.chat.chatType,
              church: populatedSavedMessage.chat.church
                ? {
                    _id: populatedSavedMessage.chat.church._id.toString(),
                    churchName: populatedSavedMessage.chat.church.churchName || "General Chat",
                    churchLogo: populatedSavedMessage.chat.church.churchLogo || [],
                  }
                : null,
              unitId: populatedSavedMessage.chat.unit ? populatedSavedMessage.chat.unit.toString() : null,
              departmentId: populatedSavedMessage.chat.department ? populatedSavedMessage.chat.department.toString() : null,
              participants: Array.isArray(populatedSavedMessage.chat.participants)
                ? populatedSavedMessage.chat.participants.map((p) => p.toString())
                : [],
            }
          : null,
      };

      io.to(chatRoomId).emit("receiveMessage", messageToEmit);
      console.log(`[sendMessage] Emitted 'receiveMessage' to room ${chatRoomId}`);

      const senderSocketIds = io.userSocketMap.get(senderId.toString()) || [];
      if (senderSocketIds.length > 0) {
        io.to(senderSocketIds).emit("messageSentConfirmation", {
          ...messageToEmit,
          tempId: tempId || null,
        });
        console.log(`[sendMessage] Emitted 'messageSentConfirmation' to sender ${senderId} for tempId: ${tempId}`);
      }

      // Notification logic (unchanged)
      for (const participantId of actualChatParticipants) {
        if (participantId === senderId.toString()) {
          continue;
        }

        const participantSocketIds = io.userSocketMap.get(participantId) || [];
        if (participantSocketIds.length > 0) {
          let chatContext = {};
          switch (chatType) {
            case "private":
              const otherUser = await User.findById(targetId).select("userName firstName lastName userImage");
              chatContext = {
                chatId: genericChatDocument._id,
                model: "PrivateChat",
                type: "private",
                name: otherUser.userName || `${otherUser.firstName} ${otherUser.lastName}` || "Private Chat",
                image: otherUser.userImage && otherUser.userImage.length > 0
                  ? [{
                      url: otherUser.userImage[0].url,
                      cld_id: otherUser.userImage[0].cld_id || "",
                      type: otherUser.userImage[0].type || "image",
                      size: otherUser.userImage[0].size || 0,
                      name: otherUser.userImage[0].name || `profile-${targetId}`,
                    }]
                  : [],
              };
              break;
            case "unit":
              const unit = await Unit.findById(unitId).select("unitName _id");
              chatContext = {
                chatId: genericChatDocument._id,
                model: "UnitChat",
                type: "unit",
                name: unit.unitName || "Unit Chat",
                image: [],
              };
              break;
            case "department":
              const department = await Department.findById(targetId).select("deptName _id");
              chatContext = {
                chatId: genericChatDocument._id,
                model: "DepartmentChat",
                type: "department",
                name: department.deptName || "Department Chat",
                image: [],
              };
              break;
            case "general":
              chatContext = {
                chatId: genericChatDocument._id,
                model: "GeneralChat",
                type: "general",
                name: populatedSavedMessage.chat?.church?.churchName || populatedSavedMessage.chat?.name || "General Chat",
                image: populatedSavedMessage.chat?.church?.churchLogo || [],
              };
              break;
          }

          const notificationMessage = message.trim()
            ? `${message.substring(0, 50)}${message.length > 50 ? "..." : ""}`
            : uploadedAttachments.length > 0
            ? `New attachment (${uploadedAttachments[0].name})`
            : "New message";

          const notification = new Notification({
            recipient: participantId,
            sender: senderId,
            type: "message",
            message: notificationMessage,
            referenceModel: "Message",
            chat: genericChatDocument._id,
            chatContext,
            metadata: {
              messageId: savedMessage._id,
              ...(req.body.announcementId && { announcementId: req.body.announcementId }),
            },
          });
          await notification.save();

          const populatedNotification = await Notification.findById(notification._id)
            .populate("sender", "firstName lastName userName userImage");

          const formattedNotification = {
            _id: populatedNotification._id.toString(),
            type: populatedNotification.type,
            message: notificationMessage,
            read: populatedNotification.read,
            title: "New Message",
            createdAt: populatedNotification.createdAt.toISOString(),
            sender: {
              _id: populatedNotification.sender?._id.toString(),
              userName: populatedNotification.sender.userName || "",
              firstName: populatedNotification.sender.firstName || "",
              lastName: populatedNotification.sender.lastName || "",
              userImage: populatedNotification.sender.userImage?.[0]?.url || "",
            },
            referenceId: savedMessage._id.toString(),
            chat: {
              _id: populatedNotification.chat.toString(),
              type: chatContext.type,
              name: chatContext.name,
              image: chatContext.image,
            },
          };

          io.to(participantSocketIds).emit("newNotification", formattedNotification);
          console.log(`[sendMessage] Sent 'newNotification' to user ${participantId}`);
        } else {
          console.log(`[sendMessage] No socket connections for user ${participantId}, notification saved but not emitted`);
        }
      }
    } else {
      console.warn("[sendMessage] Socket.IO not available for emitting messages or notifications.");
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedSavedMessage,
      tempId: tempId || null,
    });
  } catch (error) {
    console.error("[sendMessage] Error sending message:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};
  const createUnitChat = async (req, res) => {
    try {
      const unitId = req.body.unitId || req.body._id;
      const currentUserId = req.user._id;

      console.log(`[Backend] createUnitChat called for unitId: ${unitId}`, {
        userId: currentUserId,
        requestBody: req.body,
      });

      if (!unitId) {
        console.log(`[Backend] Missing unitId`, { requestBody: req.body });
        return res
          .status(400)
          .json({ success: false, message: "Unit ID is required." });
      }

      const isValidId = mongoose.Types.ObjectId.isValid(unitId);
      console.log(`[Backend] ObjectId validation for unitId: ${unitId}`, {
        isValid: isValidId,
      });
      if (!isValidId) {
        console.log(`[Backend] Invalid unitId format`, {
          unitId,
          requestBody: req.body,
        });
        return res
          .status(400)
          .json({ success: false, message: "Invalid unit ID format." });
      }

      const unit = await Unit.findById(unitId);
      if (!unit) {
        console.log(`[Backend] Unit not found`, { unitId });
        return res
          .status(404)
          .json({ success: false, message: "Unit not found." });
      }

      if (
        !unit.members.some((memberId) => memberId.equals(currentUserId)) &&
        !unit.unitHead.equals(currentUserId)
      ) {
        console.log(`[Backend] User not authorized to create chat for unit`, {
          unitId,
          userId: currentUserId,
        });
        return res.status(403).json({
          success: false,
          message: "You must be a unit member or head to create a chat.",
        });
      }

      if (unit.chatId) {
        const existingChat = await Chat.findOne({
          _id: unit.chatId,
          chatType: "unit",
          unit: unitId,
        });
        if (existingChat) {
          console.log(`[Backend] Unit chat already exists`, {
            unitId,
            chatId: unit.chatId,
          });
          return res.status(200).json({
            success: true,
            chatId: unit.chatId,
            message: "Unit chat already exists.",
          });
        }
      }

      const chat = await Chat.create({
        chatType: "unit",
        unit: unitId,
        participants: [currentUserId, ...unit.members, unit.unitHead].filter(
          (id, index, self) => id && self.indexOf(id) === index
        ),
        unreadCounts: unit.members
          .concat(unit.unitHead)
          .filter((id, index, self) => id && self.indexOf(id) === index)
          .map((memberId) => ({
            user: memberId,
            count: 0,
          })),
        name: unit.unitName || `Unit Chat ${unitId}`,
        description: unit.description || "",
      });

      unit.chatId = chat._id;
      await unit.save();

      console.log(`[Backend] Unit chat created successfully`, {
        unitId,
        chatId: chat._id,
      });

      return res.status(201).json({
        success: true,
        chatId: chat._id,
        message: "Unit chat created successfully.",
      });
    } catch (error) {
      console.error("[Backend] Error creating unit chat:", {
        message: error.message,
        stack: error.stack,
        requestBody: req.body,
      });
      return res.status(500).json({
        success: false,
        message: "Internal server error creating unit chat.",
        error: error.message,
      });
    }
  };

  const getUnitChat = async (req, res) => {
    try {
      const unitId = req.params.unitId;
      const currentUserId = req.user._id;

      console.log(`[Backend] getUnitChat called for unitId: ${unitId}`, {
        userId: currentUserId,
        params: req.params,
      });

      if (!mongoose.Types.ObjectId.isValid(unitId)) {
        console.log(`[Backend] Invalid unitId format`, { unitId });
        return res
          .status(400)
          .json({ success: false, message: "Invalid unit ID format." });
      }

      const chat = await Chat.findOne({ unit: unitId, chatType: "unit" });
      if (!chat) {
        console.log(`[Backend] No chat found for unit`, { unitId });
        return res
          .status(404)
          .json({ success: false, message: "No chat found for this unit." });
      }

      if (!chat.participants.some((id) => id.equals(currentUserId))) {
        console.log(`[Backend] User not authorized to access chat`, {
          unitId,
          userId: currentUserId,
        });
        return res.status(403).json({
          success: false,
          message: "User is not a participant in this chat.",
        });
      }

      console.log(`[Backend] getUnitChat success`, {
        unitId,
        chatId: chat._id,
      });
      return res.status(200).json({
        success: true,
        chat: {
          _id: chat._id,
          chatType: chat.chatType,
          unit: chat.unit,
          participants: chat.participants,
          name: chat.name,
          description: chat.description,
          unreadCounts: chat.unreadCounts,
        },
      });
    } catch (error) {
      console.error(`[Backend] Error in getUnitChat:`, {
        message: error.message,
        stack: error.stack,
        unitId: req.params.unitId,
      });
      return res.status(500).json({
        success: false,
        message: "Internal server error retrieving unit chat.",
        error: error.message,
      });
    }
  };

  const createDepartmentChat = async (req, res) => {
    const { departmentId } = req.body;
    const user = req.user;

    console.log("chatController: createDepartmentChat request", {
      userId: user?._id.toString(),
      departmentId,
    });

    if (!departmentId) {
      console.log("chatController: Missing department ID", { departmentId });
      return res
        .status(400)
        .json({ success: false, message: "Department ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      console.log("chatController: Invalid department ID", { departmentId });
      return res
        .status(400)
        .json({ success: false, message: "Invalid department ID" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const department = await Department.findOne({
        _id: departmentId,
        members: user._id,
      })
        .populate("unit") // Populate the unit to get unitLogo
        .session(session);

      if (!department) {
        console.log(
          "chatController: Department not found or user not a member",
          {
            departmentId,
            userId: user._id.toString(),
          }
        );
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: "Department not found or user not a member",
        });
      }

      const existingChat = await Chat.findOne({
        chatType: "department",
        department: departmentId,
      }).session(session);

      if (existingChat) {
        console.log("chatController: Chat already exists for department", {
          departmentId,
          chatId: existingChat._id.toString(),
        });
        await Department.updateOne(
          { _id: departmentId },
          { $set: { chatId: existingChat._id } },
          { session }
        );
        await session.commitTransaction();
        return res.status(200).json({
          success: true,
          chatId: existingChat._id.toString(),
          message: "Chat already exists",
        });
      }

      const newChat = new Chat({
        chatType: "department",
        participants: [user._id, ...department.members], // Include all members
        department: departmentId,
        unit: department.unit?._id, // Set unit from department
        image: department.deptLogo?.[0]?.url || "", // Set image from unitLogo if available
        name: `${department.deptName} Chat`,
        description: `Chat room for ${department.deptName}`,
        createdAt: new Date(),
        unreadCounts: department.members
          .concat(user._id)
          .filter((id, index, self) => id && self.indexOf(id) === index)
          .map((memberId) => ({ user: memberId, count: 0 })),
      });
      await newChat.save({ session });

      await Department.updateOne(
        { _id: departmentId },
        { $set: { chatId: newChat._id } },
        { session }
      );

      await session.commitTransaction();

      console.log("chatController: Department chat created", {
        departmentId,
        chatId: newChat._id.toString(),
      });

      return res.status(201).json({
        success: true,
        chatId: newChat._id.toString(),
        message: "Department chat created successfully",
      });
    } catch (error) {
      await session.abortTransaction();
      console.error("chatController: Error creating department chat", {
        message: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: "Failed to create department chat",
        error: error.message,
      });
    } finally {
      session.endSession();
    }
  };

  // Get department chat
  // Updated getDepartmentChat controller
  const getDepartmentChat = async (req, res) => {
    try {
      const { departmentId } = req.params;
      const currentUserId = req.user._id;

      if (!mongoose.Types.ObjectId.isValid(departmentId)) {
        console.log(`[Backend] Invalid departmentId format`, { departmentId });
        return res.status(400).json({
          message: "Invalid department ID format (must be a valid ObjectId).",
        });
      }

      // Check if the user is a member of the department
      const department = await Department.findOne({
        _id: departmentId,
        members: currentUserId,
      });
      if (!department) {
        console.log(`[Backend] Department not found or user not a member`, {
          departmentId,
          userId: currentUserId,
        });
        return res
          .status(404)
          .json({ message: "Department not found or user not a member." });
      }

      // Find the chat and populate the department details
      const departmentChat = await Chat.findOne({
        department: departmentId,
        chatType: "department",
      })
        .populate({
          path: "department",
          select: "deptName deptLogo unit", // Select the fields you need from the department
        })
        .populate({
          path: "unit",
          select: "unitName unitLogo church",
        })
        .populate({
          path: "participants",
          select: "firstName lastName userName userImage",
        });

      if (!departmentChat) {
        console.log(`[Backend] Department chat not found`, { departmentId });
        // If the chat doesn't exist, we can return a 404, but a more user-friendly flow would be to create it on the client side.
        return res.status(404).json({ message: "Department chat not found." });
      }

      console.log(`[Backend] Department chat details`, {
        departmentId,
        chatId: departmentChat._id.toString(),
        participants: departmentChat.participants.map((p) => p._id.toString()),
      });

      // Return the enriched chat document
      return res.status(200).json({
        success: true,
        chat: departmentChat,
        message: "Department chat fetched successfully.",
      });
    } catch (error) {
      console.error("chatController: Error fetching department chat", {
        message: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: "Failed to fetch department chat",
        error: error.message,
      });
    }
  };

  // Create Gerneral Chat
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getOrCreateGeneralChat = async (req, res) => {
  const retryOperation = async (operation, retries = MAX_RETRIES) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (
          (error.message.includes("Write conflict") ||
            error.name === "MongoNetworkError") &&
          attempt < retries
        ) {
          console.log(
            `[Backend] Error detected (attempt ${attempt}/${retries}), retrying after ${RETRY_DELAY_MS}ms...`,
            error.message
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw error;
      }
    }
  };

  try {
    const { churchId } = req.body;
    const user = req.user;

    console.log("[Backend] getOrCreateGeneralChat request", {
      userId: user?._id?.toString(),
      churchId,
      userChurchId: user?.churchId?.toString(),
      role: user?.role,
    });

    if (!churchId || !mongoose.Types.ObjectId.isValid(churchId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid churchId is required" });
    }

    const result = await retryOperation(async () => {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const churchObjId = new mongoose.Types.ObjectId(churchId);
        const userId = new mongoose.Types.ObjectId(user._id);

        // --- 1. Fetch church + units
        const church = await Church.findById(churchObjId)
          .populate("churchMembers", "userName firstName lastName userImage")
          .populate("units", "members")
          .session(session);

        if (!church) {
          await session.abortTransaction();
          return res
            .status(404)
            .json({ success: false, message: "Church not found" });
        }

        // --- 2. Validate membership or admin status
        const isChurchMember = church.churchMembers.some(
          (m) => m._id && m._id.toString() === userId.toString()
        );
        const isUnitMember = church.units.some((u) =>
          u.members.some((mid) => mid.toString() === userId.toString())
        );
        const isChurchAdmin =
          user.churchId?.toString() === churchId || user.role === "churchAdmin";

        if (!isChurchMember && !isUnitMember && !isChurchAdmin) {
          await session.abortTransaction();
          return res.status(403).json({
            success: false,
            message: "User not a member of church, its units, or a churchAdmin",
          });
        }

        // --- 3. Look for existing general chat
        let chat = await Chat.findOne({
          chatType: "general",
          church: churchObjId,
        })
          .populate("participants", "userName firstName lastName userImage")
          .populate("church", "churchName churchLogo")
          .session(session);

        if (chat) {
          // Ensure user is in participants & unreadCounts
          if (
            !chat.participants.some((p) => p._id.toString() === userId.toString())
          ) {
            await Chat.updateOne(
              { _id: chat._id },
              { $addToSet: { participants: userId } },
              { session }
            );
            await Chat.updateOne(
              { _id: chat._id },
              { $addToSet: { unreadCounts: { user: userId, count: 0 } } },
              { session }
            );
          }

          await User.updateOne(
            { _id: userId },
            { $addToSet: { generalChatIds: chat._id } },
            { session }
          );

          await session.commitTransaction();

          return res.status(200).json({
            success: true,
            chatId: chat._id.toString(),
            participants: chat.participants.map((p) => p._id.toString()),
            message: "General chat already exists",
            churchName: church.churchName,
            churchLogo: church.churchLogo?.[0]?.url || null,
          });
        }

        // --- 4. Otherwise, create new general chat
        const uniqueMemberIds = new Set();
        church.churchMembers.forEach(
          (m) => m._id && uniqueMemberIds.add(m._id.toString())
        );
        church.units.forEach((u) =>
          u.members.forEach((mid) => uniqueMemberIds.add(mid.toString()))
        );
        uniqueMemberIds.add(userId.toString()); // Ensure the requesting user is included

        const participants = Array.from(uniqueMemberIds).map(
          (id) => new mongoose.Types.ObjectId(id)
        );
        const unreadCounts = participants.map((pid) => ({ user: pid, count: 0 }));

        const newChat = new Chat({
          chatType: "general",
          participants,
          church: churchObjId,
          name: `${church.churchName || "General"} Chat`,
          description: `Chat for all members of ${church.churchName || "the church"}`,
          unreadCounts,
        });

        await newChat.save({ session });

        await Church.updateOne(
          { _id: churchObjId },
          { $set: { generalChatId: newChat._id } },
          { session }
        );

        await User.updateMany(
          { _id: { $in: participants } },
          { $addToSet: { generalChatIds: newChat._id } },
          { session }
        );

        await session.commitTransaction();

        return res.status(201).json({
          success: true,
          chatId: newChat._id.toString(),
          participants: participants.map((p) => p.toString()),
          message: "General chat created successfully",
          churchName: church.churchName,
          churchLogo: church.churchLogo?.[0]?.url || null,
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    });

    return result;
  } catch (error) {
    console.error("[Backend] Error in getOrCreateGeneralChat", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getMessages = async (req, res) => {
  const retryOperation = async (operation, retries = MAX_RETRIES) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (
          (error.message.includes("Write conflict") ||
            error.name === "MongoNetworkError") &&
          attempt < retries
        ) {
          console.log(
            `[Backend] Error detected in getMessages (attempt ${attempt}/${retries}), retrying after ${RETRY_DELAY_MS}ms...`,
            error.message
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw error;
      }
    }
  };

  try {
    const { chatId } = req.params;
    const currentUserId = req.user._id;
    const { beforeId, limit: queryLimit, departmentId } = req.query;

    console.log(`[Backend] getMessages called for chatId: ${chatId}`);
    console.log(
      `[Backend] Query params: { beforeId: ${beforeId}, limit: ${queryLimit}, userId: ${currentUserId}, departmentId: ${departmentId} }`
    );

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({
        message: "Invalid chat ID format (must be a valid ObjectId).",
      });
    }

    const MAX_LIMIT = 50;
    const limit = Math.min(parseInt(queryLimit || "20", 10), MAX_LIMIT);
    if (isNaN(limit) || limit <= 0) {
      return res.status(400).json({ message: "Invalid limit provided." });
    }

    const result = await retryOperation(async () => {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        let chat = await Chat.findById(chatId)
          .populate("department", "deptName deptLogo _id members")
          .populate("unit", "unitLogo unitName _id members unitHead")
          .populate("church", "churchName churchLogo _id")
          .populate("participants", "userName userImage _id isOnline")
          .session(session)
          .lean();

        if (!chat) {
          await session.abortTransaction();
          return res.status(404).json({ message: "Chat not found." });
        }

        if (chat.chatType === "general" && (!chat.church || !chat.church._id)) {
          await session.abortTransaction();
          return res.status(500).json({ message: "General chat missing church reference." });
        }

        chat.participants = chat.participants.filter((p) =>
          mongoose.Types.ObjectId.isValid(p._id)
        );

        // Department chat validations
        if (chat.chatType === "department" && departmentId) {
          if (!mongoose.Types.ObjectId.isValid(departmentId)) {
            await session.abortTransaction();
            return res.status(400).json({ message: "Invalid department ID" });
          }

          const department = await Department.findById(departmentId).session(session);
          if (!department) {
            await session.abortTransaction();
            return res.status(404).json({ message: "Department not found." });
          }

          if (!department.members.some((memberId) => memberId.equals(currentUserId))) {
            await session.abortTransaction();
            return res.status(403).json({
              message: "You must be a department member to view messages in this chat.",
            });
          }

          if (!chat.participants.some((p) => p._id.toString() === currentUserId.toString())) {
            await Chat.updateOne(
              { _id: chatId },
              {
                $addToSet: {
                  participants: currentUserId,
                  unreadCounts: { user: currentUserId, count: 0 },
                },
              },
              { session }
            );

            await User.updateOne(
              { _id: currentUserId },
              {
                $addToSet: {
                  departmentChats: {
                    id: chat._id,
                    deptName: department.deptName,
                    deptLogo: department.deptLogo || [],
                  },
                },
              },
              { session }
            );

            chat = await Chat.findById(chatId)
              .populate("department", "deptName deptLogo _id members")
              .populate("unit", "unitLogo unitName _id members unitHead")
              .populate("church", "churchName churchLogo _id")
              .populate("participants", "userName userImage _id isOnline")
              .session(session)
              .lean();
          }
        }

        // Unit chat validations
        if (chat.chatType === "unit") {
          if (!chat.unit) {
            await session.abortTransaction();
            return res.status(404).json({ message: "Unit reference missing in chat." });
          }
          if (!chat.unit.members.some((memberId) => memberId.equals(currentUserId)) &&
              !chat.unit.unitHead.equals(currentUserId)) {
            await session.abortTransaction();
            return res.status(403).json({
              message: "You must be a unit member or head to view messages in this chat.",
            });
          }
        }

        // Private chat validations
        if (chat.chatType === "private") {
          const isParticipant = chat.participants.some((p) => {
            try {
              return mongoose.Types.ObjectId.isValid(p._id) &&
                     new mongoose.Types.ObjectId(p._id).equals(currentUserId);
            } catch {
              return false;
            }
          });

          if (!isParticipant) {
            await session.abortTransaction();
            return res.status(403).json({
              message: "You are not authorized to view messages in this chat.",
            });
          }
        }

        // Mark messages read
        await Promise.all([
          Message.updateMany(
            {
              chat: chatId,
              sender: { $ne: currentUserId },
              "readBy.user": { $ne: currentUserId },
            },
            { $addToSet: { readBy: { user: currentUserId, readAt: new Date() } } },
            { session }
          ),
          Chat.findOneAndUpdate(
            { _id: chatId, "unreadCounts.user": currentUserId },
            { $set: { "unreadCounts.$.count": 0 } },
            { new: true, session }
          ),
        ]);

        // Fetch messages
        let filter = { chat: chatId };
        if (beforeId && mongoose.Types.ObjectId.isValid(beforeId)) {
          filter._id = { $lt: new mongoose.Types.ObjectId(beforeId) };
        }

        const fetchedMessages = await Message.find(filter)
          .sort({ createdAt: -1 })
          .limit(limit + 1)
          .populate("sender", "userName firstName lastName userImage churchName churchLogo")
          .populate({ path: "reactions.user", select: "userName firstName lastName userImage churchName churchLogo" })
          .populate({ path: "replyTo", select: "messageText sender", populate: { path: "sender", select: "userName userImage churchName churchLogo" } })
          .populate({ path: "post", populate: [{ path: "user", select: "userName firstName lastName userImage" }, { path: "church", select: "churchName churchLogo" }] })
          .lean();

        const hasMore = fetchedMessages.length > limit;

        // Safe message mapping
        const messagesToReturn = fetchedMessages
          .slice(0, limit)
          .reverse()
          .map((msg) => {
            const isChurchMessage = msg.sender?._id?.toString() === chat.church?._id?.toString() || !!msg.metadata?.announcementId;

            if (isChurchMessage) {
              return {
                ...msg,
                sender: {
                  _id: chat.church?._id || "church_unknown",
                  userName: chat.church?.churchName || "Church Admin",
                  firstName: chat.church?.churchName || "Church",
                  lastName: "",
                  userImage: chat.church?.churchLogo || [],
                  churchName: chat.church?.churchName,
                  churchLogo: chat.church?.churchLogo,
                },
                chat: {
                  church: {
                    _id: chat.church?._id || "church_unknown",
                    churchName: chat.church?.churchName || "Church",
                    churchLogo: chat.church?.churchLogo || [],
                  },
                },
                senderId: chat.church?._id?.toString() || "church_unknown",
                isAnnouncement: !!msg.metadata?.announcementId,
              };
            }

            if (!msg.sender || !msg.sender._id) {
              return {
                ...msg,
                sender: {
                  _id: "unknown",
                  userName: "Unknown",
                  firstName: "Unknown",
                  lastName: "",
                  userImage: [],
                  churchName: chat.church?.churchName,
                  churchLogo: chat.church?.churchLogo,
                },
                chat: {
                  church: {
                    _id: chat.church?._id || "unknown",
                    churchName: chat.church?.churchName || "Unknown Church",
                    churchLogo: chat.church?.churchLogo || [],
                  },
                },
                senderId: msg.senderId || "unknown",
                isAnnouncement: !!msg.metadata?.announcementId,
              };
            }

            return {
              ...msg,
              sender: {
                ...msg.sender,
                churchName: chat.church?.churchName,
                churchLogo: chat.church?.churchLogo,
              },
              chat: {
                church: {
                  _id: chat.church?._id || "unknown",
                  churchName: chat.church?.churchName || "Unknown Church",
                  churchLogo: chat.church?.churchLogo || [],
                },
              },
              senderId: msg.sender._id.toString(),
              isAnnouncement: !!msg.metadata?.announcementId,
            };
          });

        const chatContext = {
          chatId: chat._id.toString(),
          type: chat.chatType,
          name: chat.name || chat.department?.deptName || chat.church?.churchName || "Unnamed Chat",
          image:
            chat.unit?.unitLogo?.map((img) => ({ url: img.url || img, type: "image" })) ||
            chat.department?.deptLogo?.map((img) => ({ url: img.url || img, type: "image" })) ||
            chat.church?.churchLogo?.map((img) => ({ url: img.url || img, type: "image" })) ||
            [],
          departmentId: chat.department?._id?.toString(),
          unitId: chat.unit?._id?.toString(),
          churchId: chat.church?._id?.toString() || null,
          participants: chat.participants.map((p) => p._id.toString()),
          model: chat.chatType === "private" ? "PrivateChat" :
                 chat.chatType === "unit" ? "UnitChat" :
                 chat.chatType === "department" ? "DepartmentChat" :
                 "GeneralChat",
          church: {
            _id: chat.church?._id?.toString() || "unknown",
            churchName: chat.church?.churchName || "Unnamed Church",
            churchLogo: chat.church?.churchLogo?.map((img) => ({ url: img.url || img, type: "image" })) || [],
          },
        };

        await session.commitTransaction();

        return res.status(200).json({
          success: true,
          messages: messagesToReturn,
          hasMore,
          chatContext,
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    });

    return result;
  } catch (error) {
    console.error("[Backend] Error retrieving messages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error retrieving messages.",
      error: error.message,
    });
  }
};



  const deleteMessage = async (req, res) => {
    try {
      const { messageId } = req.params;
      const currentUserId = req.user._id; // Assuming req.user._id from authentication

      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(400).json({ message: "Invalid message ID." });
      }

      // 1. Find the message to be deleted
      // Populate 'chat' to get its _id for Socket.io emission
      // Populate 'sender' for access control
      const messageToDelete = await Message.findById(messageId)
        .populate("chat", "_id") // Get the generic Chat ID
        .populate("sender", "_id"); // Get the sender ID for access control

      if (!messageToDelete) {
        return res.status(404).json({ message: "Message not found." });
      }

      // 2. Access Control: Ensure only the sender can delete their own message
      if (messageToDelete.sender._id.toString() !== currentUserId.toString()) {
        return res
          .status(403)
          .json({ message: "You can only delete your own messages." });
      }

      const chatId = messageToDelete.chat._id; // Get the generic Chat ID from the message

      // 3. Delete the message
      await Message.deleteOne({ _id: messageId });
      // Or: await Message.findByIdAndDelete(messageId); // Another way to delete and return the doc

      console.log(
        `Message ${messageId} deleted by user ${currentUserId} from chat ${chatId}.`
      );

      // 4. Update the generic Chat document's lastMessage fields if this was the last message
      const chatDocument = await Chat.findById(chatId);
      if (
        chatDocument &&
        chatDocument.lastMessage &&
        chatDocument.lastMessage.toString() === messageId.toString()
      ) {
        // If the deleted message was the last one, find the new last message
        const newLastMessage = await Message.findOne({ chat: chatId })
          .sort({ createdAt: -1 }) // Get the most recent message
          .select("_id messageText createdAt sender") // Select relevant fields
          .populate("sender", "userName firstName lastName"); // Populate sender details

        if (newLastMessage) {
          chatDocument.lastMessage = newLastMessage._id;
          chatDocument.lastMessageText = newLastMessage.messageText;
          chatDocument.lastMessageAt = newLastMessage.createdAt;
          chatDocument.lastMessageSender = newLastMessage.sender._id;
        } else {
          // No messages left in this chat
          chatDocument.lastMessage = undefined; // Or null
          chatDocument.lastMessageText = undefined;
          chatDocument.lastMessageAt = undefined;
          chatDocument.lastMessageSender = undefined;
        }
        await chatDocument.save();
        console.log(`Chat ${chatId} last message updated after deletion.`);
      }

      // 5. Emit Socket.io event to notify all clients in the chat room
      // Use req.app.get('io') or whatever method you use to access the Socket.io instance
      const io = req.app.get("io");
      if (io) {
        io.to(chatId.toString()).emit("messageDeleted", {
          messageId: messageId,
          chatId: chatId.toString(),
          deletedBy: currentUserId.toString(),
        });
        console.log(
          `Socket.io event 'messageDeleted' emitted for chat ${chatId}, message ${messageId}.`
        );
      } else {
        console.warn(
          "Socket.io instance not found on req.app. Cannot emit 'messageDeleted' event."
        );
      }

      res
        .status(200)
        .json({ success: true, message: "Message deleted successfully." });
    } catch (error) {
      console.error("Error deleting message:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  };

  const toggleReaction = async (req, res) => {
    try {
      // We only need messageId to find the specific message
      const { messageId } = req.params;
      // userId should come from authentication, not body for security
      const currentUserId = req.user._id;
      const { reactionType } = req.body;

      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        return res.status(400).json({ message: "Invalid message ID." });
      }

      if (!currentUserId || !reactionType || typeof reactionType !== "string") {
        return res.status(400).json({
          message: "Authenticated user ID and reaction type are required.",
        });
      }

      // 1. Find the message and check if the user has already reacted with this type
      // Use $elemMatch for a more specific query within the reactions array
      const existingMessageWithReaction = await Message.findOne({
        _id: messageId,
        "reactions.user": currentUserId,
        "reactions.type": reactionType,
      });

      let updatedMessage;
      let operationType; // To indicate if reaction was added or removed

      if (existingMessageWithReaction) {
        // User has already reacted with this type, so pull (remove) the reaction
        updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          { $pull: { reactions: { user: currentUserId, type: reactionType } } },
          { new: true } // Return the modified document
        )
          .populate("sender", "userName firstName lastName userImage")
          .populate("reactions.user", "userName firstName lastName userImage"); // Populate reaction users
        operationType = "removed";
      } else {
        // User has not reacted with this type, so push (add) the reaction
        updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          { $push: { reactions: { user: currentUserId, type: reactionType } } },
          { new: true }
        )
          .populate("sender", "userName firstName lastName userImage")
          .populate("reactions.user", "userName firstName lastName userImage"); // Populate reaction users
        operationType = "added";
      }

      if (!updatedMessage) {
        return res
          .status(404)
          .json({ message: "Message not found or could not be updated." });
      }

      console.log(
        `Reaction ${reactionType} ${operationType} by user ${currentUserId} on message ${messageId}.`
      );

      // 2. Emit Socket.io event to notify all clients in the chat room
      // Get the chat ID from the updated message
      const chatId = updatedMessage.chat.toString(); // Assuming 'chat' field exists on Message model

      const io = req.app.get("io");
      if (io) {
        io.to(chatId).emit("messageReactionUpdated", {
          messageId: updatedMessage._id.toString(),
          chatId: chatId,
          reactions: updatedMessage.reactions.map((r) => ({
            // Map to plain objects for emission
            user: r.user.toString(),
            type: r.type,
          })),
          reactionAction: operationType, // 'added' or 'removed'
          reactorId: currentUserId,
          reactionType: reactionType,
        });
        console.log(
          `Socket.io event 'messageReactionUpdated' emitted for chat ${chatId}, message ${messageId}.`
        );
      } else {
        console.warn(
          "Socket.io instance not found on req.app. Cannot emit 'messageReactionUpdated' event."
        );
      }

      return res.status(200).json({
        success: true,
        message: `Reaction ${operationType} successfully.`,
        messageData: updatedMessage.toObject({
          getters: true,
          virtuals: false,
        }), // Return the updated message data
      });
    } catch (error) {
      console.error("Error toggling reaction:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  };

  const getNotifications = async (req, res) => {
    try {
      const userId = req.user._id; // Use req.user._id for consistency and security
      const { page = 1, limit = 20, readStatus } = req.query; // Added readStatus query param

      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized: User not authenticated." });
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const queryFilter = { user: userId };

      // Add readStatus filter if provided
      if (readStatus === "read") {
        queryFilter.read = true;
      } else if (readStatus === "unread") {
        queryFilter.read = false;
      }

      // Fetch notifications with populated fields for richer data
      const notifications = await Notification.find(queryFilter)
        .sort({ createdAt: -1 }) // Sort by newest first
        .skip(skip)
        .limit(parseInt(limit))
        .populate("sender", "userName firstName lastName userImage") // Populate the user who triggered the notification
        .populate({
          // Populate chat details if it's a chat-related notification
          path: "chat",
          select: "chatType privateChatRef unit department generalDetails", // Select fields from Chat model
          populate: [
            // Further populate specific chat details for display name/image
            {
              path: "privateChatRef",
              select: "senderId receiverId",
              populate: [
                { path: "senderId", select: "userName userImage" },
                { path: "receiverId", select: "userName userImage" },
              ],
            },
            { path: "unit", select: "unitName unitLogo _id" },
            { path: "department", select: "deptName deptLogo _id" },
            // If you have a GeneralChatMeta model for generalDetails, populate it here too
            // { path: 'generalDetails', select: 'name image' },
          ],
        })
        .lean(); // Use .lean() for performance since we're just sending data

      // Get total count (for pagination metadata)
      const total = await Notification.countDocuments(queryFilter);
      // Get unread count specifically
      const unreadCount = await Notification.countDocuments({
        user: userId,
        read: false,
      });

      // Process notifications for consistent frontend display (optional but good practice)
      const formattedNotifications = notifications.map((notif) => {
        let contextName = ""; // Name of the chat/context the notification refers to
        let contextImage = ""; // Image of the chat/context

        if (notif.chat) {
          switch (notif.chat.chatType) {
            case "private":
              // Determine the other participant's name and image for private chats
              const otherParticipant =
                notif.chat.privateChatRef?.senderId?.toString() ===
                userId.toString()
                  ? notif.chat.privateChatRef.receiverId
                  : notif.chat.privateChatRef?.receiverId?.toString() ===
                    userId.toString()
                  ? notif.chat.privateChatRef.senderId
                  : null; // Fallback if neither matches

              contextName =
                otherParticipant?.userName ||
                otherParticipant?.firstName ||
                "Private Chat";
              contextImage = otherParticipant?.userImage || "";
              break;
            case "unit":
              contextName = notif.chat.unit?.name || "Unit Chat";
              // contextImage = notif.chat.unit?.image || ''; // If Unit has image
              break;
            case "department":
              contextName = notif.chat.department?.name || "Department Chat";
              contextImage = notif.chat.department?.image || ""; // If Department has image
              break;
            case "general":
              contextName = "General Church Chat"; // Fixed name for general chat
              contextImage = notif.chat.generalDetails?.image;
              break;
            default:
              contextName = "Chat";
          }
        }

        return {
          _id: notif._id.toString(),
          type: notif.type,
          message: notif.message,
          read: notif.read,
          createdAt: notif.createdAt,
          sender: notif.sender
            ? {
                _id: notif.sender._id.toString(),
                userName: notif.sender.userName,
                firstName: notif.sender.firstName,
                lastName: notif.sender.lastName,
                userImage: notif.sender.userImage,
              }
            : null,
          referenceId: notif.referenceId ? notif.referenceId.toString() : null,
          chat: notif.chat
            ? {
                _id: notif.chat._id.toString(),
                type: notif.chat.chatType,
                name: contextName,
                image: contextImage,
                // Add other chat-specific data if needed for navigation etc.
              }
            : null,
          // Add any other specific notification data here
        };
      });

      res.status(200).json({
        success: true,
        total,
        unreadCount, // Provide total unread count
        page: parseInt(page),
        notifications: formattedNotifications,
        hasMore: skip + notifications.length < total,
      });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  };

const sendAnnouncement = async (req, res) => {
    console.log("[chatController] io passed in?", !!io);

    const { messageText, audienceType, audienceId, tempId } = req.body;
    const user = req.user;

    console.log("[Backend] sendAnnouncement request", {
      userId: user?._id?.toString(),
      messageText,
      audienceType,
      audienceId,
      hasAttachment: !!req.file,
      tempId,
    });

    // Debug log for req.file
    if (req.file) {
      console.log("[Backend] req.file details:", {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
      });
    } else {
      console.log("[Backend] No req.file found - check FormData key and multer config");
    }

    if (!messageText && !req.file) {
      return res.status(400).json({
        success: false,
        message: "Announcement text or attachment is required",
      });
    }

    try {
      // Validate Socket.IO instance
      if (!io) {
        console.error("[Backend] Socket.IO instance not provided");
      }

      // Upload attachment if provided
      let attachment = null;
      if (req.file) {
        console.log("[Backend] Uploading to Cloudinary...");
        try {
          const result = await cloudinary.uploader.upload(req.file.path, {
            folder: "announcements",
            resource_type: "auto", // Handle both images and videos
          });
          console.log("[Backend] Cloudinary upload success:", {
            secure_url: result.secure_url,
            public_id: result.public_id,
            resource_type: result.resource_type,
          });
          attachment = {
            url: result.secure_url,
            cld_id: result.public_id,
            type: req.file.mimetype.startsWith("image") ? "image" : "video",
            uri: result.secure_url,
          };
        } catch (uploadError) {
          console.error("[Backend] Cloudinary upload failed:", uploadError);
          throw new Error(`Cloudinary upload failed: ${uploadError.message}`);
        }
      }

      // Create Announcement record
      const newAnnouncement = new Announcement({
        messageText,
        attachments: attachment ? [attachment] : [],
        createdBy: user._id,
        audience: audienceType,
        audienceId:
          audienceId && mongoose.isValidObjectId(audienceId)
            ? new mongoose.Types.ObjectId(audienceId)
            : null,
        contentType: "announcement",
      });

      const savedAnnouncement = await newAnnouncement.save();

      // Identify target chat
      let chat = null;
      if (audienceType === "general") {
        chat = await Chat.findOne({
          chatType: "general",
          church: user.churchId,
        });
      } else if (audienceType === "unit") {
        chat = await Chat.findOne({ chatType: "unit", unit: audienceId });
      } else if (audienceType === "department") {
        chat = await Chat.findOne({
          chatType: "department",
          department: audienceId,
        });
      } else if (audienceType === "church") {
        chat = await Chat.findOne({ chatType: "general", church: audienceId });
      }

      // Check if chat exists
      if (!chat) {
        return res.status(400).json({
          success: false,
          message: `No ${audienceType} chat found for audienceId: ${audienceId || user.churchId}`,
        });
      }

      // Create a Message linked to this Announcement
      const newMessage = new Message({
        chat: chat._id,
        sender: audienceType === "general" ? user.churchId : user._id,
        messageText,
        attachments: attachment ? [attachment] : [],
        contentType: "announcement",
        isAnnouncement: true,
        announcementId: savedAnnouncement._id,
        tempId,
      });
      await newMessage.save();

      // Figure out audience for notifications
      let usersToNotify = [];
      if (audienceType === "general" && user.churchId) {
        const church = await Church.findById(user.churchId).select("churchMembers");
        if (church) {
          usersToNotify = await User.find({
            _id: { $in: church.churchMembers },
          }).select("fcmToken");
        }
      } else if (audienceType === "church" && audienceId) {
        const church = await Church.findById(audienceId).select("churchMembers");
        if (church) {
          usersToNotify = await User.find({
            _id: { $in: church.churchMembers },
          }).select("fcmToken");
        }
      } else if (audienceType === "unit" && audienceId) {
        usersToNotify = await User.find({ unitId: audienceId }).select("fcmToken");
      } else if (audienceType === "department" && audienceId) {
        usersToNotify = await User.find({ departmentId: audienceId }).select("fcmToken");
      }

      // Emit Socket.IO events
      const populatedMessage = await Message.findById(newMessage._id)
        .populate("sender", "userName firstName lastName userImage")
        .populate("chat", "name chatType churchLogo");

      if (io) {
        io.to(`chat-${chat._id}`).emit("newMessage", {
          message: populatedMessage,
          announcement: savedAnnouncement,
        });

        io.to(`announcement-${savedAnnouncement._id}`).emit("newAnnouncement", {
          type: "SYSTEM_ANNOUNCEMENT",
          announcement: savedAnnouncement,
        });
      } else {
        console.warn("[Backend] Skipping Socket.IO events due to missing io instance");
      }

      // Create Notifications
      if (usersToNotify.length > 0) {
        const notifications = usersToNotify.map((u) => ({
          recipient: u._id,
          sender: user._id,
          type: "system_announcement",
          message: messageText,
          chat: chat._id,
          chatContext: {
            chatId: chat._id,
            type: chat.chatType,
            name: chat.name || "Announcement",
            model:
              chat.chatType === "general"
                ? "GeneralChat"
                : chat.chatType === "unit"
                ? "UnitChat"
                : chat.chatType === "department"
                ? "DepartmentChat"
                : "PrivateChat",
            image: chat.churchLogo || [],
          },
          announcementId: savedAnnouncement._id,
          metadata: {
            announcementId: savedAnnouncement._id.toString(),
          },
        }));

        await Notification.insertMany(notifications);
        console.log(`[Backend] Created ${notifications.length} notifications for announcement`);
      }

      // Push Notifications
      const fcmTokens = usersToNotify.map((u) => u.fcmToken).filter(Boolean);
      if (fcmTokens.length > 0) {
        await sendPushNotification({
          tokens: fcmTokens,
          title: "📢 New Announcement",
          body: messageText,
          data: {
            type: "SYSTEM_ANNOUNCEMENT",
            announcementId: savedAnnouncement._id.toString(),
          },
        });
      }

      return res.status(200).json({
        success: true,
        message: "Announcement sent successfully",
        announcement: savedAnnouncement,
        messageDoc: newMessage,
        tempId,
      });
    } catch (error) {
      console.error("[Backend] Error in sendAnnouncement", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  };

  //_________________________________________________________________________________

  // GET /api/v1/private/:recipientId/exists

  const getUnitChatList = async (req, res) => {
    try {
      const currentUser = req.user;

      // Get user's assigned units
      const user = await User.findById(currentUser._id).populate("unitChats");
      if (!user.unitChats || user.unitChats.length === 0) {
        return res
          .status(200)
          .json({ data: [], message: "User not assigned to any unit chats" });
      }

      const chats = await Chat.find({
        _id: { $in: user.unitChats },
        chatType: "unit",
      })
        .populate("unit", "unitName") // Populate unit name
        .populate("lastMessageSender", "userName firstName lastName")
        .lean();

      const chatList = chats.map((chat) => ({
        id: chat._id.toString(),
        name: chat.unit?.unitName || "Unit Chat",
        lastMessage: chat.lastMessageText || "",
        lastMessageTimestamp: chat.lastMessageAt || chat.createdAt,
        lastMessageSender:
          chat.lastMessageSender?.userName ||
          chat.lastMessageSender?.firstName ||
          "N/A",
        type: "unit",
        unitId: chat.unit?._id.toString(),
        unreadCount:
          chat.unreadCounts.find(
            (uc) => uc.user.toString() === currentUser._id.toString()
          )?.count || 0,
      }));

      res.status(200).json({ data: chatList });
    } catch (err) {
      console.error("Error in getUnitChatList:", err);
      res
        .status(500)
        .json({ message: "Failed to fetch unit chats", error: err.message });
    }
  };

  const getDepartmentChatList = async (req, res) => {
    try {
      const currentUser = req.user;

      // Get user's assigned departments
      const user = await User.findById(currentUser._id).populate(
        "departmentChats"
      );
      if (!user.departmentChats || user.departmentChats.length === 0) {
        return res.status(200).json({
          data: [],
          message: "User not assigned to any department chats",
        });
      }

      const chats = await Chat.find({
        _id: { $in: user.departmentChats },
        chatType: "department",
      })
        .populate("department", "name") // Populate department name
        .populate("lastMessageSender", "userName firstName lastName")
        .lean();

      const chatList = chats.map((chat) => ({
        id: chat._id.toString(),
        name: chat.department?.name || "Department Chat",
        lastMessage: chat.lastMessageText || "",
        lastMessageTimestamp: chat.lastMessageAt || chat.createdAt,
        lastMessageSender:
          chat.lastMessageSender?.userName ||
          chat.lastMessageSender?.firstName ||
          "N/A",
        type: "department",
        departmentId: chat.department?._id.toString(),
        unreadCount:
          chat.unreadCounts.find(
            (uc) => uc.user.toString() === currentUser._id.toString()
          )?.count || 0,
      }));

      res.status(200).json({ data: chatList });
    } catch (err) {
      console.error("Error in getDepartmentChatList:", err);
      res.status(500).json({
        message: "Failed to fetch department chats",
        error: err.message,
      });
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
      const { before, limit: queryLimit } = req.query;

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

      // Find the unit chat
      const unitChat = await UnitChat.findOne({ unit: unitId });
      if (!unitChat) {
        return res.status(404).json({ message: "Unit chat not found" });
      }
      const chat = await Chat.findOne({ chatType: "unit", unit: unitChat._id });
      if (!chat) {
        return res
          .status(404)
          .json({ message: "Chat not found for this unit" });
      }

      const MAX_LIMIT = 50;
      const limit = Math.min(parseInt(queryLimit || "20", 10), MAX_LIMIT);

      // Build message filter
      let filter = { chat: chat._id };
      if (before && isValidObjectId(before)) {
        filter._id = { $lt: new mongoose.Types.ObjectId(before) };
      }

      // Fetch messages
      const messages = await Message.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .populate("sender", "userName firstName lastName userImage")
        .populate({
          path: "reactions.user",
          select: "userName firstName lastName",
        })
        .populate({
          path: "replyTo",
          select: "messageText sender",
          populate: { path: "sender", select: "userName" },
        })
        .lean();

      const hasMore = messages.length > limit;
      const messagesToReturn = messages.slice(0, limit).reverse();

      // Mark messages as read
      await Promise.all([
        Message.updateMany(
          {
            chat: chat._id,
            sender: { $ne: userId },
            "readBy.user": { $ne: userId },
          },
          { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
        ),
        Chat.findOneAndUpdate(
          { _id: chat._id, "unreadCounts.user": userId },
          { $set: { "unreadCounts.$.count": 0 } }
        ),
      ]);

      return res.status(200).json({
        success: true,
        messages: messagesToReturn,
        hasMore,
      });
    } catch (error) {
      console.error("Error getting unit messages:", error);
      return res
        .status(500)
        .json({ message: "Server error.", error: error.message });
    }
  };
  // Get all messages for a department
  const getDepartmentMessages = async (req, res) => {
    try {
      const { departmentId } = req.params;
      const userId = req.user._id;
      const { before, limit: queryLimit } = req.query;

      if (!isValidObjectId(departmentId)) {
        return res
          .status(400)
          .json({ message: "Invalid department ID format." });
      }

      // Find the department and check membership
      const department = await Department.findById(departmentId);
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      if (!department.members.some((memberId) => memberId.equals(userId))) {
        return res
          .status(403)
          .json({ message: "You are not a member of this department" });
      }

      // Find the department chat
      const departmentChat = await DepartmentChat.findOne({
        department: departmentId,
      });
      if (!departmentChat) {
        return res.status(404).json({ message: "Department chat not found" });
      }
      const chat = await Chat.findOne({
        chatType: "department",
        department: departmentChat._id,
      });
      if (!chat) {
        return res
          .status(404)
          .json({ message: "Chat not found for this department" });
      }

      const MAX_LIMIT = 50;
      const limit = Math.min(parseInt(queryLimit || "20", 10), MAX_LIMIT);

      // Build message filter
      let filter = { chat: chat._id };
      if (before && isValidObjectId(before)) {
        filter._id = { $lt: new mongoose.Types.ObjectId(before) };
      }

      // Fetch messages
      const messages = await Message.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .populate("sender", "userName firstName lastName userImage")
        .populate({
          path: "reactions.user",
          select: "userName firstName lastName",
        })
        .populate({
          path: "replyTo",
          select: "messageText sender",
          populate: { path: "sender", select: "userName" },
        })
        .lean();

      const hasMore = messages.length > limit;
      const messagesToReturn = messages.slice(0, limit).reverse();

      // Mark messages as read
      await Promise.all([
        Message.updateMany(
          {
            chat: chat._id,
            sender: { $ne: userId },
            "readBy.user": { $ne: userId },
          },
          { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
        ),
        Chat.findOneAndUpdate(
          { _id: chat._id, "unreadCounts.user": userId },
          { $set: { "unreadCounts.$.count": 0 } }
        ),
      ]);

      return res.status(200).json({
        success: true,
        messages: messagesToReturn,
        hasMore,
      });
    } catch (error) {
      console.error("Error fetching department messages:", error);
      return res
        .status(500)
        .json({ message: "Server error.", error: error.message });
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

  return {
    createPrivateChat,
    deleteMessage,
    getNotifications,
    sendMessage,
    toggleReaction,
    getGeneralMessages,
    getDepartmentMessages,
    getMessages,
    getUnitMessages,
    getUnitChatList,
    getDepartmentChatList,
    getGeneralChatList,
    checkPrivateChatExists,
    getCombinedChatlist,
    createDepartmentChat,
    getDepartmentChat,
    createUnitChat,
    getUnitChat,
    getOrCreateGeneralChat,
    sendAnnouncement,
  };
};

module.exports = chatIo;
