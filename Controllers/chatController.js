const mongoose = require('mongoose');
const Chat = require('../Models/chat');
const { PrivateChat,  } = require("../Models/chat"); // Ensure correct import
const Message = require('../Models/post');
const Unit = require('../Models/unit');
const User = require('../Models/user');
const Department = require('../Models/departments');
const Notification = require('../Models/notification');
const logger = require('../Middlewares/logger');

//Send a private message (1-on-1 chat)

const sendPrivateMessage = async (req, res) => {
  try {
      const { receiverId } = req.params;
      const { message } = req.body;
      const senderId = req.user._id;

      if (!mongoose.Types.ObjectId.isValid(receiverId)) {
          return res.status(400).json({ message: "Invalid user ID format" });
      }

      if (!message) {
          return res.status(400).json({ message: "Message content is required" });
      }

      if (senderId.toString() === receiverId) {
          return res.status(400).json({ message: "You cannot send a message to yourself" });
      }

      const receiver = await User.findById(receiverId);
      if (!receiver) {
          return res.status(404).json({ message: "User not found" });
      }

      // Ensure a private chat session exists
      let chat = await PrivateChat.findOne({
          $or: [
              { sender: senderId, receiver: receiverId },
              { sender: receiverId, receiver: senderId },
          ],
      });

      // Save new message
      const newMessage = new PrivateChat({  
          sender: senderId,
          receiver: receiverId,
          message,
      });

      await newMessage.save();

      // Send a notification
      await Notification.create({
          user: receiverId,
          message: `New message from ${req.user.name}`,
      });

      res.status(201).json(newMessage);
  } catch (error) {
      console.error("Error sending private message:", error);
      res.status(500).json({ message: "Server error", error });
  }
};



// Get private messages
const getPrivateMessages = async (req, res) => {
  try {
      
      const { userId } = req.params;
      const currentUserId = req.user._id;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
          return res.status(400).json({ message: "Invalid user ID format" });
      }

      console.log("Fetching private messages between:", currentUserId, "and", userId);

      const messages = await PrivateChat.find({
          $or: [
              { sender: currentUserId, receiver: userId }, // Sender to Receiver
              { sender: userId, receiver: currentUserId }, // Receiver to Sender
          ],
      })
      .sort({ createdAt: 1 })  // Sort messages by oldest first
      .populate("sender", "username firstName lastName userImage")  // Populate sender details
      .populate("receiver", "username firstName lastName userImage"); // Populate receiver details

      console.log("Total messages retrieved:", messages.length);
      res.status(200).json(messages);

  } catch (error) {
      console.error("Error retrieving private messages:", error);
      res.status(500).json({ message: "Server error", error });
  }
};



// Send a unit message
const sendUnitMessage = async (req, res) => {
  try {
    const { unitId } = req.params;
    const { message } = req.body;
    const senderId = req.user.id;

    // Check if user is a member
    const user = await User.findById(senderId);
    if (!user) {   
        return res.status(404).json({ message: "User not found" });
    }

    // Check if user is a member of the unit
    const unitMember = await User.find({ roleId: unitId });
    if (!unitMember.includes(user)) {
        return res.status(403).json({ message: "You are not a member of this unit" });
    }

    if (!message) {
      return res.status(400).json({ message: "Message content is required" });
    }

    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    const newMessage = new Chat({
      sender: senderId,
      unit: unitId,
      message,
      chatType: "unit",
    });

    await newMessage.save();

    // Notify unit members
    const unitMembers = await User.find({ roleId: unitId });
    unitMembers.forEach(async (member) => {
      await Notification.create({
        user: member._id,
        message: `New message in ${unit.name} group chat`,
      });
    });

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Get unit messages
const getUnitMessages = async (req, res) => {
    try {
        const { unitId } = req.params;
        const userId = req.user._id;
        const unit = await Unit.findById(unitId);
        if (!unit) {
            return res.status(404).json({ message: 'Unit not found' });
        }

        // Check if the user is a member of the unit
        if (!unit.members.includes(userId)) {
            return res.status(403).json({ message: 'You are not a member of this unit' });
        }

        const chat = await Chat.findOne({
            chatType: 'unit',
            users: { $all: [userId, unitId] },
        });
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }
        const messages = await Message.find({ chatType: 'unit', chat: chat._id }).populate('sender');
        res.status(200).json(messages);
        // Update the last message for the chat
        chat.lastMessage = messages[messages.length - 1];
        await chat.save();
    }
    catch (error) {
        res.status(500).json({ message: 'Error getting unit messages', error });
    }
}

// Send a department message
const sendDepartmentMessage = async (req, res) => {
  const { departmentId, senderId, message, attachments } = req.body;

  try {
      const department = await Department.findById(departmentId);
      if (!department) {
          return res.status(404).json({ message: "Department not found" });
      }

      const chatMessage = new Chat.DepartmentChat({
          department: departmentId,
          sender: senderId,
          message,
          attachments,
      });

      await chatMessage.save();

      res.status(201).json(chatMessage);
  } catch (error) {
    logger.error("Error sending department message:", error);
      console.error("Error sending department message:", error);
      res.status(500).json({ message: error.message });
  }
};

// Get all messages for a department
const getDepartmentMessages = async (req, res) => {
  const { departmentId } = req.params;

  try {
      const messages = await Chat.DepartmentChat.find({ department: departmentId })
          .populate("sender", "name email")
          .sort({ createdAt: 1 });

      res.status(200).json(messages);
  } catch (error) {
    logger.error("Error fetching department messages:", error);
      console.error("Error fetching department messages:", error);
      res.status(500).json({ message: error.message });
  }
};

// Send a general chat message
const sendGeneralMessage = async (req, res) => {
    try {
      const { message } = req.body;
      const senderId = req.user.id;

      // Check if user is a member
        const user = await User.findById(senderId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

      if (!message) {
        return res.status(400).json({ message: "Message content is required" });
      }
  
      const newMessage = new Chat({
        sender: senderId,
        message,
        chatType: "general",
      });
  
      await newMessage.save();
  
      // Notify all users
      const users = await User.find();
      users.forEach(async (user) => {
        await Notification.create({
          user: user._id,
          message: "New message in the general chat",
        });
      });
  
      res.status(201).json(newMessage);
    } catch (error) {
      res.status(500).json({ message: "Server error", error });
    }
  };

// Get general chat messages
const getGeneralMessages = async (req, res) => {
    try {
        const userId = req.user._id;

        const chat = await Chat.findOne({
            chatType: 'general',
            users: { $all: [userId] },
        });
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }
        const messages = await Message.find({ chatType: 'general', chat: chat._id }).populate('sender');
        res.status(200).json(messages);
        // Update the last message for the chat
        chat.lastMessage = messages[messages.length - 1];
        await chat.save();
    }
    catch (error) {
        res.status(500).json({ message: 'Error getting general messages', error });
    }   
}

// Delete a message (Only the sender can delete)
const deleteMessage = async (req, res) => {
    try {
      const { messageId } = req.params;
      const currentUserId = req.user.id;
  
      const message = await Chat.findById(messageId);
  
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
  
      if (message.sender.toString() !== currentUserId) {
        return res.status(403).json({ message: "You can only delete your messages" });
      }
  
      await message.deleteOne();
  
      res.json({ message: "Message deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Server error", error });
    }
  };
  
  // Get notifications for the logged-in user
  const getNotifications = async (req, res) => {
    try {
      const notifications = await Notification.find({ user: req.user.id });
  
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Server error", error });
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
