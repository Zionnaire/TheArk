const mongoose = require("mongoose");
const AllChats = require("../Models/AllChats"); 
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
const Post = require("../Models/post");

const {
  uploadToCloudinary,
  uploadVideoToCloudinary,
  uploadDocumentToCloudinary,
} = require("../Middlewares/cloudinaryUpload");

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
        const currentUserId = req.user.id; // Assuming req.user.id is correctly populated
        const { recipientId } = req.params;

        console.log("Backend currentUserId:", currentUserId);
        console.log("Backend recipientId:", recipientId);

        // Ensure IDs are strings for sorting, as they might be ObjectId objects for consistency
        const sortedParticipantIds = [currentUserId.toString(), recipientId.toString()].sort();

        // 1. Query the generic Chat model first
        // This is the main source of truth for whether a conversation exists
        const existingGenericChat = await AllChats.findOne({
            chatType: 'private', // Filter for private chats
            participants: { $all: sortedParticipantIds } // Check if both participants are present
        })
        .populate('privateChatRef'); // Populate to get access to the specific PrivateChat document if it exists

        console.log("Found existing generic chat:", existingGenericChat);

        if (existingGenericChat) {
            // A generic chat exists. Now, check if its specific PrivateChat reference is also valid.
            if (existingGenericChat.privateChatRef && existingGenericChat.privateChatRef.chatId) {
                console.log("Existing generic chatId:", existingGenericChat._id);
                console.log("Associated PrivateChat identifier:", existingGenericChat.privateChatRef.chatId);

                return res.status(200).json({
                    exists: true,
                    chatId: existingGenericChat._id, // Return the _id of the generic Chat document
                    privateChatIdentifier: existingGenericChat.privateChatRef.chatId, // Optional: The old string ID from PrivateChat
                    message: "Generic private chat found and ID retrieved."
                });
            } else {
                // This scenario means a generic chat document exists, but its linked PrivateChat
                // document is missing or malformed (missing chatId). This indicates a data integrity issue.
                console.warn(`Generic Chat ${existingGenericChat._id} found, but associated PrivateChatRef is missing or invalid!`);
                // You might decide to return `exists: false` here, as the chat is incomplete,
                // or a different status code like 500 if this should never happen.
                return res.status(200).json({
                    exists: false,
                    chatId: null,
                    message: "Generic chat exists, but its associated private chat details are incomplete. Consider data repair."
                });
            }
        } else {
            // No generic chat found between these users.
            console.log("No existing generic private chat found between these users.");
            return res.status(200).json({
                exists: false,
                chatId: null,
                message: "No existing private chat found. A new chat can be created."
            });
        }

    } catch (err) {
        console.error("Error in checkPrivateChatExists:", err);
        // Handle specific Mongoose errors if needed, otherwise, generic 500.
        return res.status(500).json({
            exists: false,
            message: "Server error checking chat existence.",
            error: err.message // Include error message for debugging
        });
    }
};

const createPrivateChat = async (req, res) => {
  try {
    const currentUserId = req.user._id; // Assumed to be populated by verifyToken middleware
    const { recipientId } = req.params; // Get recipientId from URL parameters

    if (!currentUserId || !recipientId) {
      console.error("Missing sender or recipient ID for chat creation", { currentUserId, recipientId });
      return res.status(400).json({
        success: false,
        message: "Sender or recipient ID is missing.",
      });
    }

    if (currentUserId === recipientId) {
      return res.status(400).json({ success: false, message: "Cannot create a private chat with yourself." });
    }

    // 1. Generate the deterministic identifier for the specific PrivateChat document
    const privateChatIdentifier = getPrivateChatIdentifier(currentUserId, recipientId);

    // 2. Try to find the Generic Chat document that links to this private conversation
    // This is the primary chat instance the frontend will use.
    let existingGenericChat = await AllChats.findOne({
      chatType: 'private',
      // Find where participants array contains BOTH (currentUserId AND recipientId)
      participants: { $all: [currentUserId, recipientId] }
    })
    .populate('privateChatRef'); // Populate to ensure we can check the privateChatRef's ID

    if (existingGenericChat) {
      console.log(`[Backend] Generic private chat document already exists (ID: ${existingGenericChat._id}). Returning existing chat.`);
      // If a generic chat already exists, return its _id.
      // The frontend uses this _id for navigation and message fetching.
      return res.status(200).json({
        success: true,
        message: "Private chat already exists.",
        chatId: existingGenericChat._id.toString(), // The Mongoose _id of the Generic Chat
        privateChatIdentifier: existingGenericChat.privateChatRef ? existingGenericChat.privateChatRef.chatId : privateChatIdentifier, // The deterministic string ID
      });
    }

    console.log(`[Backend] No existing generic private chat found for identifier: ${privateChatIdentifier}. Proceeding to create.`);

    // 3. Create the specific PrivateChat document (if generic chat doesn't exist)
    // This document holds details unique to the one-on-one conversation.
    const newPrivateChat = new PrivateChat({
      chatId: privateChatIdentifier, // This is your unique index field for privatechats
      senderId: currentUserId, // Or just use `participants` in PrivateChat as well
      receiverId: recipientId,
      // lastMessage, attachments, reactions, read are now handled by the Message model and Generic Chat model
    });
    const savedPrivateChat = await newPrivateChat.save();
    console.log("Specific PrivateChat document saved with _id:", savedPrivateChat._id);


    // 4. Create the Generic Chat document that links to the PrivateChat
    // This is the main chat entry for both users in their chat lists.
    const newGenericChat = new Chat({
      chatType: 'private',
      participants: [currentUserId, recipientId], // Store participants as ObjectIds
      privateChatRef: savedPrivateChat._id, // Link to the specific PrivateChat document
      lastMessageTimestamp: new Date(), // Initialize timestamp for sorting in chat list
      unreadCounts: [ // Initialize unread counts for both participants
        { user: currentUserId, count: 0 },
        { user: recipientId, count: 0 }
      ]
    });
    const savedGenericChat = await newGenericChat.save();
    console.log("Generic Chat document saved with _id:", savedGenericChat._id);


    // 5. Update both users' chat arrays to reference the new generic Chat document
    // The `privateChats` array in the User model now references the generic `Chat` model's `_id`
    await Promise.all([
      User.findByIdAndUpdate(currentUserId, { $addToSet: { privateChats: savedGenericChat._id } }, { new: true }),
      User.findByIdAndUpdate(recipientId, { $addToSet: { privateChats: savedGenericChat._id } }, { new: true }),
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
    if (err.code === 11000) { // MongoDB duplicate key error
        // This means the `privateChatIdentifier` was duplicated during the `newPrivateChat.save()`
        // which implies the initial `Chat.findOne` didn't catch it. This should be rare with the
        // current logic, but if it happens, it means a race condition is still possible.
        // In such a case, you might attempt to retrieve the existing chat, but for now, log and return conflict.
        console.warn(`[Backend] Duplicate key error (E11000) for chatId: ${err.keyValue?.chatId}.`);
        return res.status(409).json({
            success: false,
            message: "Chat already exists. Please try fetching the chat list again.",
            error: err.message
        });
    }
    // Handle other validation errors from Mongoose
    if (err.name === 'ValidationError') {
        const errors = Object.keys(err.errors).map(key => ({
            path: err.errors[key].path,
            message: err.errors[key].message,
            value: err.errors[key].value
        }));
        return res.status(400).json({
            success: false,
            message: "Validation failed during chat creation",
            errors: errors,
        });
    }
    return res.status(500).json({ success: false, message: "Failed to create private chat", error: err.message });
  }
};

const getCombinedChatlist = async (req, res) => {
    try {
        const userId = req.user.id; // User ID from authentication middleware

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized - User ID not found in request' });
        }

        // 1. Find all generic Chat documents where the current user is a participant
        // For 'general' chat, if it doesn't use `participants` array, you'll need to fetch it separately
        // or ensure `participants` includes all users for general chat as well.
        // For simplicity here, we assume `participants` covers all chat types or
        // we'll fetch general chat separately if it's truly global.

        // If 'general' chat is fixed and doesn't rely on `participants` array:
        let query = { participants: userId };
        if (req.query.includeGeneralChat === 'true') {
            // If general chat has a specific _id or a fixed name, fetch it here.
            // Example: Find a chat with type 'general' and a known name (e.g., 'General Church Chat')
            // This might involve a separate query or a more complex OR condition.
            // For now, let's assume `participants` array is used for general too OR you manage it differently.
        }

        const chats = await AllChats.find(query)
            .populate({
                path: 'lastMessageSender', // Populate the sender of the last message
                select: 'userName userImage firstName lastName'
            })
            .populate({
                path: 'participants', // Populate participants for private chats
                select: 'userName userImage firstName lastName'
            })
            .populate({
                path: 'unit', // Populate Unit details if chatType is 'unit'
                select: 'name' // Get the name of the unit
            })
            .populate({
                path: 'department', // Populate Department details if chatType is 'department'
                select: 'name' // Get the name of the department
            })
            // You might need to populate 'lastMessage' itself if you want more details than text/sender
             .populate({
                path: 'lastMessage',
                select: 'messageText createdAt'
            })
            .lean(); // Use .lean() for faster query as we will transform the objects

        if (!chats || chats.length === 0) {
            return res.status(200).json({ data: [], message: 'No chats found for this user.' });
        }

        // 2. Normalize and format the chat list for the frontend
        const normalizedChatList = chats.map(chat => {
            let chatName = 'Unknown Chat';
            let chatImage = ''; // Single URL string
            let otherParticipantId = null; // For private chats
            let otherParticipantImage = ''; // For private chats

            // Find the unread count for the current user in this specific chat
            const userUnreadEntry = chat.unreadCounts.find(uc => uc.user.toString() === userId.toString());
            const unreadCount = userUnreadEntry ? userUnreadEntry.count : 0;

            switch (chat.chatType) {
                case 'private':
                    // Find the other participant in the 'participants' array
                    const otherParticipant = chat.participants.find(
                        p => p._id.toString() !== userId.toString()
                    );
                    if (otherParticipant) {
                        chatName = otherParticipant.userName || `${otherParticipant.firstName} ${otherParticipant.lastName}`.trim() || 'Private Chat';
                        chatImage = otherParticipant.userImage || ''; // Assuming userImage is a string
                        otherParticipantId = otherParticipant._id.toString();
                        otherParticipantImage = otherParticipant.userImage || '';
                    } else {
                        chatName = 'Private Chat (Other user missing)';
                        chatImage = '';
                    }
                    break;
                case 'unit':
                    chatName = chat.unit?.name || 'Unit Chat'; // Name from populated Unit model
                    // chatImage = chat.unit?.image || ''; // If Unit model has an image
                    break;
                case 'department':
                    chatName = chat.department?.name || 'Department Chat'; // Name from populated Department model
                    // chatImage = chat.department?.image || ''; // If Department model has an image
                    break;
                case 'general':
                    chatName = 'General Church Chat'; // Often a fixed name for general
                    // chatImage = 'URL_TO_GENERAL_CHAT_ICON'; // Provide a default icon/image
                    break;
                default:
                    chatName = 'Unknown Chat Type';
                    chatImage = '';
            }

            return {
                id: chat._id.toString(), // This is the generic Chat ID (frontend's `chat.id`)
                type: chat.chatType,
                name: chatName,
                image: chatImage, // Display image for the chat (e.g., other user's pic, unit logo)
                lastMessage: chat.lastMessageText || '',
                lastMessageSender: chat.lastMessageSender?.userName || chat.lastMessageSender?.firstName || 'N/A',
                lastMessageTimestamp: chat.lastMessageAt || chat.createdAt,
                unreadCount: unreadCount,
                privateRecipientId: otherParticipantId, // Crucial for frontend to know who to send private messages to
                privateRecipientImage: otherParticipantImage, // Useful for frontend display
                unitId: chat.unit ? chat.unit._id.toString() : undefined, // For unit chat specific logic
                departmentId: chat.department ? chat.department._id.toString() : undefined, // For department chat specific logic
                // You can add more fields if needed, like full participants list for group chat display
            };
        });

        // 3. Sort the combined list by last message timestamp (or chat creation time if no messages yet)
        normalizedChatList.sort(
            (a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime()
        );

        return res.status(200).json({ data: normalizedChatList });

    } catch (error) {
        console.error('Error fetching combined chat list:', error);
        return res.status(500).json({ message: 'Failed to fetch combined chat list', error: error.message });
    }
};

  //Send a message (All chats)
const sendMessage = async (req, res) => {
    try {
        const { chatType, recipientId: targetId } = req.params;
        const { message = "", reactions = "[]", tempId, replyTo } = req.body;
        const senderId = req.user.id;
        const senderDetails = req.user; // Assuming req.user is already populated by your auth middleware

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
            if (Array.isArray(parsed) && parsed.every(r => typeof r === "object" && r.user && typeof r.type === "string")) {
                parsedReactions = parsed;
            } else if (reactions !== "[]") {
                return res.status(400).json({ message: "Invalid reactions format." });
            }
        } catch (jsonError) {
            console.error("JSON parsing error for reactions:", jsonError);
            return res.status(400).json({ message: "Invalid reactions format." });
        }

        const attachments = req.files?.attachments;
        const files = attachments ? (Array.isArray(attachments) ? attachments : [attachments]) : [];
        const uploadedAttachments = [];

        if (!message.trim() && files.length === 0 && !replyTo) {
            return res.status(400).json({ message: "Message, attachments, or a reply target required." });
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
                    uploadResult = await uploadDocumentToCloudinary(buffer, "chat_uploads", file.mimetype);
                }

                uploadedAttachments.push({
                    url: uploadResult.secure_url || uploadResult.videoUrl || uploadResult.fileUrl,
                    cld_id: uploadResult.public_id || uploadResult.videoCldId || uploadResult.fileCldId,
                    type: file.mimetype || 'application/octet-stream',
                    name: file.name ? decodeURIComponent(file.name) : 'Unknown',
                    size: file.size ? file.size.toString() : 'Unknown'
                });
            } catch (error) {
                console.error(`Error uploading attachment ${file.name}:`, error);
                return res.status(500).json({ message: `Failed to upload attachment: ${file.name}` });
            }
        }

        let genericChatDocument;
        let chatRoomId;
        let recipientUserId = null;

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
                recipientUserId = receiver._id;

                const sortedParticipantIds = [String(senderId), String(targetId)].sort();

                genericChatDocument = await AllChats.findOne({
                    chatType: 'private',
                    participants: { $all: sortedParticipantIds }
                });

                if (!genericChatDocument) {
                    console.warn(`Generic private chat not found for sender ${senderId} and recipient ${targetId}. Attempting to create it.`);
                    const privateChatIdentifier = `${sortedParticipantIds[0]}_${sortedParticipantIds[1]}`;
                    const newPrivateChatRef = await new PrivateChat({
                        chatId: privateChatIdentifier,
                        senderId: senderId,
                        receiverId: targetId,
                    }).save();

                    genericChatDocument = await new AllChats({
                        chatType: 'private',
                        participants: [senderId, targetId],
                        privateChatRef: newPrivateChatRef._id,
                        unreadCounts: [
                            { user: senderId, count: 0 },
                            { user: targetId, count: 0 }
                        ]
                    }).save();

                    await Promise.all([
                        User.findByIdAndUpdate(senderId, { $addToSet: { privateChats: genericChatDocument._id } }),
                        User.findByIdAndUpdate(targetId, { $addToSet: { privateChats: genericChatDocument._id } })
                    ]);
                }
                chatRoomId = genericChatDocument._id.toString();
                break;

            case "unit":
                if (!mongoose.Types.ObjectId.isValid(targetId)) {
                    return res.status(400).json({ message: "Invalid unit ID." });
                }
                const unit = await Unit.findById(targetId);
                if (!unit) {
                    return res.status(404).json({ message: "Unit not found." });
                }
                genericChatDocument = await AllChats.findOne({ chatType: 'unit', unitChatRef: targetId });
                if (!genericChatDocument) {
                    return res.status(404).json({ message: "Unit chat not found in generic chats." });
                }
                chatRoomId = genericChatDocument._id.toString();
                break;

            case "department":
                if (!mongoose.Types.ObjectId.isValid(targetId)) {
                    return res.status(400).json({ message: "Invalid department ID." });
                }
                const department = await Department.findById(targetId);
                if (!department) {
                    return res.status(404).json({ message: "Department not found." });
                }
                genericChatDocument = await AllChats.findOne({ chatType: 'department', departmentChatRef: targetId });
                if (!genericChatDocument) {
                    return res.status(404).json({ message: "Department chat not found in generic chats." });
                }
                chatRoomId = genericChatDocument._id.toString();
                break;

            case "general":
                genericChatDocument = await AllChats.findOne({ chatType: 'general' });
                if (!genericChatDocument) {
                    console.warn("General chat document not found. Creating it.");
                    const newGeneralChatRef = await new GeneralChat({ chatId: "general_chat" }).save();
                    genericChatDocument = await new AllChats({
                        chatType: 'general',
                        participants: [],
                        generalChatRef: newGeneralChatRef._id
                    }).save();
                }
                chatRoomId = genericChatDocument._id.toString();
                break;

            default:
                return res.status(400).json({ message: "Unsupported chat type." });
        }

        if (!genericChatDocument) {
            return res.status(500).json({ message: "Could not establish or find chat context." });
        }

        let actualChatParticipants = [];
        if (genericChatDocument.chatType === 'private') {
            actualChatParticipants = genericChatDocument.participants.map(id => id.toString());
        } else if (genericChatDocument.chatType === 'unit' && genericChatDocument.unitChatRef) {
            const unitDoc = await Unit.findById(genericChatDocument.unitChatRef).select('members').lean();
            if (unitDoc) actualChatParticipants = unitDoc.members.map(m => m.toString());
        } else if (genericChatDocument.chatType === 'department' && genericChatDocument.departmentChatRef) {
            const deptDoc = await Department.findById(genericChatDocument.departmentChatRef).select('members').lean();
            if (deptDoc) actualChatParticipants = deptDoc.members.map(m => m.toString());
        } else if (genericChatDocument.chatType === 'general' && genericChatDocument.generalChatRef) {
            const allUsers = await User.find({}).select('_id').lean();
            actualChatParticipants = allUsers.map(u => u._id.toString());
        }

        if (actualChatParticipants.length === 0 && chatType !== 'private') {
            console.warn(`No participants found for chatType: ${chatType}, chat ID: ${genericChatDocument._id}`);
            return res.status(400).json({ message: "No participants found for this chat." });
        }

        const newMessage = new Message({
            chat: genericChatDocument._id,
            sender: senderId, // This is still the ObjectId string initially
            messageText: message.trim(),
            attachments: uploadedAttachments,
            reactions: parsedReactions,
            contentType: uploadedAttachments.length > 0 ? (uploadedAttachments[0].type.startsWith("image") ? "image" : (uploadedAttachments[0].type.startsWith("video") ? "video" : "file")) : (message.trim() ? "text" : "reaction_only"),
            replyTo: replyTo && mongoose.Types.ObjectId.isValid(replyTo) ? replyTo : undefined,
        });

        const savedMessage = await newMessage.save();
        console.log("Message saved to database with _id:", savedMessage._id);

        // --- CRITICAL CHANGE: POPULATE THE SENDER ON THE SAVED MESSAGE ---
        const populatedSavedMessage = await Message.findById(savedMessage._id)
            .populate("sender", "userName firstName lastName userImage")
            .populate({
                path: 'replyTo',
                select: 'messageText sender',
                populate: { path: 'sender', select: 'userName firstName lastName' } // Populate sender of replyTo message
            })
            .lean(); // Use .lean() for plain JavaScript objects, good for performance for emits

        // 3. Update the generic Chat document (last message details and unread counts)
        const chatBeforeUpdate = await AllChats.findById(genericChatDocument._id).lean();

        const updatedUnreadCounts = chatBeforeUpdate.unreadCounts.map(uc => {
            if (uc.user.toString() !== senderId.toString()) {
                return { user: uc.user, count: uc.count + 1 };
            }
            return uc;
        });

        await AllChats.findByIdAndUpdate(
            genericChatDocument._id,
            {
                lastMessageText: savedMessage.messageText || (savedMessage.attachments.length > 0 ? `Attachment (${savedMessage.attachments[0].name})` : (savedMessage.replyTo ? 'Replied to a message' : 'System message')),
                lastMessageSender: savedMessage.sender, // This is still the ObjectId, which is fine here
                lastMessageAt: savedMessage.createdAt,
                unreadCounts: updatedUnreadCounts,
            },
            { new: true }
        );
        console.log("Generic Chat document updated with last message and unread counts.");

        // 4. Send real-time updates via Socket.io
        const io = req.app.get('io');
        if (io) {
            // Use the fully populated message for emissions
            const messageToEmit = {
                ...populatedSavedMessage, // This now contains the populated sender object
                // Explicitly ensure chat and _id are strings for consistency with client interfaces
                chat: populatedSavedMessage.chat.toString(),
                _id: populatedSavedMessage._id.toString(),
                // Remove the custom `senderDetails` as `sender` is now correctly populated
                senderDetails: undefined,
            };

            const roomSockets = io.sockets.adapter.rooms.get(chatRoomId);
            let senderTargetSockets = new Set();
            if (io.userSocketMap.has(senderId.toString())) {
                senderTargetSockets = io.userSocketMap.get(senderId.toString());
            }

            if (roomSockets) {
                // 1. Broadcast 'receiveMessage' to all clients in the room EXCEPT the sender's sockets
                for (const socketId of roomSockets) {
                    if (!senderTargetSockets.has(socketId)) {
                        io.to(socketId).emit('receiveMessage', messageToEmit);
                        console.log(`[ChatController] Emitted 'receiveMessage' to socket ${socketId} in room ${chatRoomId}`);
                    }
                }
            } else {
                console.warn(`[ChatController] Room ${chatRoomId} has no active sockets for 'receiveMessage' broadcast.`);
            }

            // 2. Send 'messageSentConfirmation' ONLY to the sender's sockets
            const confirmedMessageToSender = {
                ...messageToEmit, // Use the same populated message
                tempId: tempId, // CRITICAL: This is the tempId from the sender's request
                isOptimistic: undefined, // Explicitly remove optimistic flag
                senderDetails: undefined, // Again, omit this as `sender` is now correct
            };

            if (senderTargetSockets.size > 0) {
                io.to([...senderTargetSockets]).emit('messageSentConfirmation', confirmedMessageToSender);
                console.log(`[ChatController] Emitted 'messageSentConfirmation' to sender's sockets for tempId: ${tempId}`);
            } else {
                console.warn(`[ChatController] No active sockets found for sender ${senderId} for 'messageSentConfirmation'.`);
            }

            // --- Notification Logic ---
            for (const participantId of actualChatParticipants) {
                if (participantId.toString() === senderId.toString()) {
                    continue;
                }

                const participantSocketIds = io.userSocketMap.get(participantId);
                let isAnyParticipantSocketInRoom = false;
                if (participantSocketIds) {
                    for (const socketId of participantSocketIds) {
                        if (io.sockets.adapter.rooms.get(chatRoomId)?.has(socketId)) {
                            isAnyParticipantSocketInRoom = true;
                            break;
                        }
                    }
                }

                if (!isAnyParticipantSocketInRoom) {
                    const newNotification = new Notification({
                        user: participantId,
                        sender: senderId,
                        type: 'message',
                        message: `New message in ${genericChatDocument.chatType} chat from ${senderDetails.firstName || senderDetails.userName}`,
                        referenceId: savedMessage._id,
                        chat: genericChatDocument._id,
                        read: false,
                    });
                    await newNotification.save();
                    console.log(`Notification created for user ${participantId} for message ${savedMessage._id}`);

                    const populatedNotification = await Notification.findById(newNotification._id)
                        .populate('sender', 'userName firstName lastName userImage')
                        .populate({
                            path: 'chat',
                            select: 'chatType privateChatRef unit department generalChatRef',
                            populate: [
                                { path: 'privateChatRef', select: 'senderId receiverId', populate: [{ path: 'senderId', select: 'userName userImage' }, { path: 'receiverId', select: 'userName userImage' }] },
                                { path: 'unit', select: 'name' },
                                { path: 'department', select: 'name' },
                                { path: 'generalChatRef', select: 'name' }
                            ]
                        }).lean();

                    let contextName = '';
                    let contextImage = '';
                    if (populatedNotification.chat) {
                        switch (populatedNotification.chat.chatType) {
                            case 'private':
                                const otherUser = populatedNotification.chat.privateChatRef?.senderId?.toString() === participantId.toString()
                                    ? populatedNotification.chat.privateChatRef.receiverId
                                    : populatedNotification.chat.privateChatRef.senderId;
                                contextName = otherUser?.userName || otherUser?.firstName || 'Private Chat';
                                contextImage = otherUser?.userImage || '';
                                break;
                            case 'unit':
                                contextName = populatedNotification.chat.unit?.name || 'Unit Chat';
                                break;
                            case 'department':
                                contextName = populatedNotification.chat.department?.name || 'Department Chat';
                                break;
                            case 'general':
                                // This line looks incorrect: populatedNotification.AllChats.generalChatRef?.name
                                // It should be populatedNotification.chat.generalChatRef?.name assuming 'chat' is the populated field.
                                contextName = populatedNotification.chat.generalChatRef?.name || 'General Church Chat';
                                break;
                        }
                    }

                    const formattedNotification = {
                        _id: populatedNotification._id.toString(),
                        type: populatedNotification.type,
                        message: populatedNotification.message,
                        read: populatedNotification.read,
                        createdAt: populatedNotification.createdAt.toISOString(),
                        sender: populatedNotification.sender ? {
                            _id: populatedNotification.sender._id.toString(),
                            userName: populatedNotification.sender.userName,
                            firstName: populatedNotification.sender.firstName,
                            lastName: populatedNotification.sender.lastName,
                            userImage: populatedNotification.sender.userImage,
                        } : null,
                        referenceId: populatedNotification.referenceId ? populatedNotification.referenceId.toString() : null,
                        chat: populatedNotification.chat ? {
                            _id: populatedNotification.chat._id.toString(),
                            type: populatedNotification.chat.chatType,
                            name: contextName,
                            image: contextImage,
                        } : null,
                    };
                    console.log("userSocketMap snapshot:", [...io.userSocketMap.entries()]);

                    if (io.userSocketMap.has(participantId.toString())) {
                        io.to(participantId.toString()).emit('newNotification', formattedNotification);
                        console.log(`Real-time 'newNotification' sent to user ${participantId}.`);
                    } else {
                        console.log(`User ${participantId} is offline. Notification saved to DB.`);
                    }
                } else {
                    console.log(`User ${participantId} is in chat room ${chatRoomId}. No notification sent.`);
                }
            }
        } else {
            console.warn("[ChatController] req.io not available for emitting message or notifications.");
        }

        // 5. Send HTTP response back to the client
        res.status(201).json({
            success: true,
            message: "Message sent successfully",
            data: {
                ...populatedSavedMessage, // Return the populated message in the HTTP response too
            },
            tempId: tempId
        });

    } catch (error) {
        console.error("Error sending message:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            error: error.message
        });
    }
};


const getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const currentUserId = req.user.id;
        const { beforeId, limit: queryLimit } = req.query;

        console.log(`[Backend] getMessages called for generic chatId: ${chatId}`);
        console.log(`[Backend] Query params: { beforeId: ${beforeId}, limit: ${queryLimit} }`);

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({ message: "Invalid chat ID format (must be a valid ObjectId)." });
        }

        const limit = parseInt(queryLimit || '20', 10);
        if (isNaN(limit) || limit <= 0) {
            return res.status(400).json({ message: "Invalid limit provided." });
        }
        console.log(`[Backend] Using limit: ${limit}`);

        const chat = await AllChats.findById(chatId);
        if (!chat || !chat.participants.some(p => p.equals(currentUserId))) {
            return res.status(403).json({ message: "You are not authorized to view messages in this chat." });
        }

        await Promise.all([
            Message.updateMany(
                {
                    chat: chatId,
                    sender: { $ne: currentUserId },
                    'readBy.user': { $ne: currentUserId },
                },
                { $addToSet: { readBy: { user: currentUserId, readAt: Date.now() } } }
            ),
            AllChats.findOneAndUpdate(
                { _id: chatId, 'unreadCounts.user': currentUserId },
                { $set: { 'unreadCounts.$.count': 0 } },
                { new: true }
            )
        ]);
        console.log(`[Backend] Marked relevant messages as read and reset unread count for user ${currentUserId} in chat ${chatId}`);

        let filter = { chat: chatId };
        if (beforeId && mongoose.Types.ObjectId.isValid(beforeId)) {
            filter._id = { $lt: new mongoose.Types.ObjectId(beforeId) };
            console.log(`[Backend] Using _id filter: ${JSON.stringify(filter._id)}`);
        } else if (beforeId) { // Log invalid beforeId
            console.warn(`[Backend] Invalid beforeId received: ${beforeId}. Skipping _id filter.`);
        } else {
            console.log(`[Backend] No beforeId provided. Fetching initial/latest messages.`);
        }

        // Fetch one more message than the limit to determine if there are more
        const fetchedMessages = await Message.find(filter)
            .sort({ createdAt: -1 }) // Sort by creation date, newest first
            .limit(limit + 1) // Fetch one extra message
            .populate("sender", "userName firstName lastName userImage")
            .populate({
                path: 'reactions.user',
                select: 'userName firstName lastName'
            })
            .populate({
                path: 'replyTo',
                select: 'messageText sender',
                populate: { path: 'sender', select: 'userName' }
            });

        // Determine hasMore based on the fetchedMessages count
        const hasMore = fetchedMessages.length > limit;

        // Slice the array to return only the requested limit of messages
        const messagesToReturn = fetchedMessages.slice(0, limit);

        console.log(`[Backend] Fetched ${fetchedMessages.length} messages (including potential extra for hasMore).`);
        console.log(`[Backend] Returning ${messagesToReturn.length} messages.`);
        if (messagesToReturn.length > 0) {
            console.log(`[Backend] Oldest returned message _id (before reverse): ${messagesToReturn[messagesToReturn.length - 1]?._id}`);
            console.log(`[Backend] Newest returned message _id (before reverse): ${messagesToReturn[0]?._id}`);
        }

        messagesToReturn.reverse(); // Reverse to get oldest first for UI (e.g., FlatList with inverted prop)

        console.log(`[Backend] hasMore: ${hasMore}`);

        return res.status(200).json({
            success: true,
            messages: messagesToReturn,
            hasMore,
        });

    } catch (error) {
        console.error("Error retrieving messages:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error retrieving messages.",
            error: error.message
        });
    }
};

const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const currentUserId = req.user.id; // Assuming req.user.id from authentication

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ message: "Invalid message ID." });
        }

        // 1. Find the message to be deleted
        // Populate 'chat' to get its _id for Socket.io emission
        // Populate 'sender' for access control
        const messageToDelete = await Message.findById(messageId)
            .populate('chat', '_id') // Get the generic Chat ID
            .populate('sender', '_id'); // Get the sender ID for access control

        if (!messageToDelete) {
            return res.status(404).json({ message: "Message not found." });
        }

        // 2. Access Control: Ensure only the sender can delete their own message
        if (messageToDelete.sender._id.toString() !== currentUserId.toString()) {
            return res.status(403).json({ message: "You can only delete your own messages." });
        }

        const chatId = messageToDelete.chat._id; // Get the generic Chat ID from the message

        // 3. Delete the message
        await Message.deleteOne({ _id: messageId });
        // Or: await Message.findByIdAndDelete(messageId); // Another way to delete and return the doc

        console.log(`Message ${messageId} deleted by user ${currentUserId} from chat ${chatId}.`);

        // 4. Update the generic Chat document's lastMessage fields if this was the last message
        const chatDocument = await AllChats.findById(chatId);
        if (chatDocument && chatDocument.lastMessage && chatDocument.lastMessage.toString() === messageId.toString()) {
            // If the deleted message was the last one, find the new last message
            const newLastMessage = await Message.findOne({ chat: chatId })
                .sort({ createdAt: -1 }) // Get the most recent message
                .select('_id messageText createdAt sender') // Select relevant fields
                .populate('sender', 'userName firstName lastName'); // Populate sender details

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
        const io = req.app.get('io');
        if (io) {
            io.to(chatId.toString()).emit('messageDeleted', {
                messageId: messageId,
                chatId: chatId.toString(),
                deletedBy: currentUserId.toString(),
            });
            console.log(`Socket.io event 'messageDeleted' emitted for chat ${chatId}, message ${messageId}.`);
        } else {
            console.warn("Socket.io instance not found on req.app. Cannot emit 'messageDeleted' event.");
        }

        res.status(200).json({ success: true, message: "Message deleted successfully." });

    } catch (error) {
        console.error("Error deleting message:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

const toggleReaction = async (req, res) => {
    try {
        // We only need messageId to find the specific message
        const { messageId } = req.params;
        // userId should come from authentication, not body for security
        const currentUserId = req.user.id; 
        const { reactionType } = req.body;

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ message: "Invalid message ID." });
        }

        if (!currentUserId || !reactionType || typeof reactionType !== "string") {
            return res.status(400).json({ message: "Authenticated user ID and reaction type are required." });
        }

        // 1. Find the message and check if the user has already reacted with this type
        // Use $elemMatch for a more specific query within the reactions array
        const existingMessageWithReaction = await Message.findOne({
            _id: messageId,
            'reactions.user': currentUserId,
            'reactions.type': reactionType
        });

        let updatedMessage;
        let operationType; // To indicate if reaction was added or removed

        if (existingMessageWithReaction) {
            // User has already reacted with this type, so pull (remove) the reaction
            updatedMessage = await Message.findByIdAndUpdate(
                messageId,
                { $pull: { reactions: { user: currentUserId, type: reactionType } } },
                { new: true } // Return the modified document
            ).populate('sender', 'userName firstName lastName userImage')
             .populate('reactions.user', 'userName firstName lastName userImage'); // Populate reaction users
            operationType = 'removed';
        } else {
            // User has not reacted with this type, so push (add) the reaction
            updatedMessage = await Message.findByIdAndUpdate(
                messageId,
                { $push: { reactions: { user: currentUserId, type: reactionType } } },
                { new: true }
            ).populate('sender', 'userName firstName lastName userImage')
             .populate('reactions.user', 'userName firstName lastName userImage'); // Populate reaction users
            operationType = 'added';
        }

        if (!updatedMessage) {
            return res.status(404).json({ message: "Message not found or could not be updated." });
        }

        console.log(`Reaction ${reactionType} ${operationType} by user ${currentUserId} on message ${messageId}.`);

        // 2. Emit Socket.io event to notify all clients in the chat room
        // Get the chat ID from the updated message
        const chatId = updatedMessage.chat.toString(); // Assuming 'chat' field exists on Message model

        const io = req.app.get('io');
        if (io) {
            io.to(chatId).emit('messageReactionUpdated', {
                messageId: updatedMessage._id.toString(),
                chatId: chatId,
                reactions: updatedMessage.reactions.map(r => ({ // Map to plain objects for emission
                    user: r.user.toString(),
                    type: r.type
                })),
                reactionAction: operationType, // 'added' or 'removed'
                reactorId: currentUserId,
                reactionType: reactionType
            });
            console.log(`Socket.io event 'messageReactionUpdated' emitted for chat ${chatId}, message ${messageId}.`);
        } else {
            console.warn("Socket.io instance not found on req.app. Cannot emit 'messageReactionUpdated' event.");
        }

        return res.status(200).json({
            success: true,
            message: `Reaction ${operationType} successfully.`,
            messageData: updatedMessage.toObject({ getters: true, virtuals: false }) // Return the updated message data
        });

    } catch (error) {
        console.error("Error toggling reaction:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};


const getNotifications = async (req, res) => {
    try {
        const userId = req.user.id; // Use req.user.id for consistency and security
        const { page = 1, limit = 20, readStatus } = req.query; // Added readStatus query param

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: User not authenticated." });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const queryFilter = { user: userId };

        // Add readStatus filter if provided
        if (readStatus === 'read') {
            queryFilter.read = true;
        } else if (readStatus === 'unread') {
            queryFilter.read = false;
        }

        // Fetch notifications with populated fields for richer data
        const notifications = await Notification.find(queryFilter)
            .sort({ createdAt: -1 }) // Sort by newest first
            .skip(skip)
            .limit(parseInt(limit))
            .populate('sender', 'userName firstName lastName userImage') // Populate the user who triggered the notification
            .populate({ // Populate chat details if it's a chat-related notification
                path: 'chat',
                select: 'chatType privateChatRef unit department generalDetails', // Select fields from Chat model
                populate: [ // Further populate specific chat details for display name/image
                    { path: 'privateChatRef', select: 'senderId receiverId', populate: [{ path: 'senderId', select: 'userName userImage' }, { path: 'receiverId', select: 'userName userImage' }] },
                    { path: 'unit', select: 'name' },
                    { path: 'department', select: 'name' },
                    // If you have a GeneralChatMeta model for generalDetails, populate it here too
                    // { path: 'generalDetails', select: 'name imageUrl' },
                ]
            })
            .lean(); // Use .lean() for performance since we're just sending data

        // Get total count (for pagination metadata)
        const total = await Notification.countDocuments(queryFilter);
        // Get unread count specifically
        const unreadCount = await Notification.countDocuments({ user: userId, read: false });


        // Process notifications for consistent frontend display (optional but good practice)
        const formattedNotifications = notifications.map(notif => {
            let contextName = ''; // Name of the chat/context the notification refers to
            let contextImage = ''; // Image of the chat/context

            if (notif.chat) {
                switch (notif.chat.chatType) {
                    case 'private':
                        // Determine the other participant's name and image for private chats
                        const otherParticipant = notif.chat.privateChatRef?.senderId?.toString() === userId.toString()
                            ? notif.chat.privateChatRef.receiverId
                            : notif.chat.privateChatRef?.receiverId?.toString() === userId.toString()
                                ? notif.chat.privateChatRef.senderId
                                : null; // Fallback if neither matches

                        contextName = otherParticipant?.userName || otherParticipant?.firstName || 'Private Chat';
                        contextImage = otherParticipant?.userImage || '';
                        break;
                    case 'unit':
                        contextName = notif.chat.unit?.name || 'Unit Chat';
                        // contextImage = notif.chat.unit?.image || ''; // If Unit has image
                        break;
                    case 'department':
                        contextName = notif.chat.department?.name || 'Department Chat';
                         contextImage = notif.chat.department?.image || ''; // If Department has image
                        break;
                    case 'general':
                        contextName = 'General Church Chat'; // Fixed name for general chat
                         contextImage = notif.chat.generalDetails?.imageUrl;
                        break;
                    default:
                        contextName = 'Chat';
                }
            }

            return {
                _id: notif._id.toString(),
                type: notif.type,
                message: notif.message,
                read: notif.read,
                createdAt: notif.createdAt,
                sender: notif.sender ? {
                    _id: notif.sender._id.toString(),
                    userName: notif.sender.userName,
                    firstName: notif.sender.firstName,
                    lastName: notif.sender.lastName,
                    userImage: notif.sender.userImage,
                } : null,
                referenceId: notif.referenceId ? notif.referenceId.toString() : null,
                chat: notif.chat ? {
                    _id: notif.chat._id.toString(),
                    type: notif.chat.chatType,
                    name: contextName,
                    image: contextImage,
                    // Add other chat-specific data if needed for navigation etc.
                } : null,
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
//_________________________________________________________________________________



  // GET /api/v1/private/:recipientId/exists






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
    getCombinedChatlist
  };
};

module.exports = chatIo;
