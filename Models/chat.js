// models/chatModels.js
const mongoose = require('mongoose');

// Private Chat Schema (One-on-One Conversation Metadata)
const privateChatSchema = new mongoose.Schema({
    // This `chatId` is your custom string ID for the pair of users
    chatId: { type: String, required: true, unique: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

}, { timestamps: true }); // Keep timestamps for `PrivateChat` document's own creation/update

// Unit Chat Schema (Unit Conversation Metadata)
const unitChatSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true, index: true },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, unique: true }, // Ensure unit is unique
  
}, { timestamps: true });

// Department Chat Schema (Department Conversation Metadata)
// const departmentChatSchema = new mongoose.Schema(
//   {
//     department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: false, unique: true },
//     members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
//   },
//   { timestamps: true }
// );

// General Chat Schema (General Church-wide Conversation Metadata)
const generalChatSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true, index: true },
  
}, { timestamps: true });

const PrivateChat = mongoose.model('PrivateChat', privateChatSchema);
const UnitChat = mongoose.model('UnitChat', unitChatSchema);
// const DepartmentChat = mongoose.model('DepartmentChat', departmentChatSchema);
const GeneralChat = mongoose.model('GeneralChat', generalChatSchema);

module.exports = { PrivateChat, UnitChat, GeneralChat };