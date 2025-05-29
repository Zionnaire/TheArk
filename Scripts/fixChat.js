// fixChatIds.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config(); // Load your .env if needed

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db-name';
const Chat = require('../Models/chat'); // Adjust the path if needed

(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('🧠 Connected to MongoDB');

    const chats = await Chat.PrivateChat.find({ chatId: { $exists: false } });

    console.log(`Found ${chats.length} broken chats`);

    for (const chat of chats) {
      const sender = chat.sender.toString();
      const receiver = chat.receiver.toString();
      const participants = [sender, receiver].sort();
      chat.chatId = `${participants[0]}_${participants[1]}`;
      await chat.save();
      console.log(`✅ Fixed chat: ${chat._id} => ${chat.chatId}`);
    }

    console.log('🎉 All broken chats fixed!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to fix chats:', err);
    process.exit(1);
  }
})();
