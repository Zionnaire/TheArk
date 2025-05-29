const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Chat = require("../Models/chat");

dotenv.config();

const migrateSenderReceiverFields = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const chatsToUpdate = await Chat.PrivateChat.find({
      $or: [
        { senderId: { $exists: false }, sender: { $exists: true } },
        { receiverId: { $exists: false }, receiver: { $exists: true } },
      ],
    });

    console.log(`Found ${chatsToUpdate.length} chats to migrate.`);

    for (const chat of chatsToUpdate) {
      console.log(`🔍 Processing chat ${chat._id}`);
      console.log(`  - sender: ${chat.sender}`);
      console.log(`  - receiver: ${chat.receiver}`);

      if (!chat.sender && !chat.senderId) {
        console.warn(`⚠️ Skipping chat ${chat._id}: Missing sender`);
        continue;
      }
      if (!chat.receiver && !chat.receiverId) {
        console.warn(`⚠️ Skipping chat ${chat._id}: Missing receiver`);
        continue;
      }

      // ✅ Assign if not set
      if (!chat.senderId && chat.sender) {
        chat.senderId = chat.sender;
      }

      if (!chat.receiverId && chat.receiver) {
        chat.receiverId = chat.receiver;
      }

      // 🚫 Only now delete the old fields
      chat.sender = undefined;
      chat.receiver = undefined;

      await chat.save();
      console.log(`✅ Migrated chat ${chat._id}`);
    }

    console.log("🎉 Migration complete.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration error:", error);
    process.exit(1);
  }
};

migrateSenderReceiverFields();
