const mongoose = require('mongoose');
const { getUnitById } = require('../Controllers/adminController');

// Private Chat Schema (One-on-One)
const privateChatSchema = new mongoose.Schema({
    chatId: { type: String, required: true }, // your combined chat ID string
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String },
    lastMessage: {type: String},
    attachments: [{ url: String, cld_id: String }],
    reactions: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, type: String }],
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});


// Unit Chat Schema
const unitChatSchema = new mongoose.Schema({
      chatId: { type: String, required: true },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String},
    attachments: [{ url: String, cld_id: String }],
    reactions: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, type: String }],
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Department Chat Schema 
const departmentChatSchema = new mongoose.Schema({
      chatId: { type: String, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String },
    attachments: [{ url: String, cld_id: String }],
    reactions: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, type: String }],
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// General Chat Schema
const generalChatSchema = new mongoose.Schema({
      chatId: { type: String, required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String },
    attachments: [{ url: String, cld_id: String }],
    reactions: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, type: String }],
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const PrivateChat = mongoose.model('PrivateChat', privateChatSchema);
const UnitChat = mongoose.model('UnitChat', unitChatSchema);
const DepartmentChat = mongoose.model('DepartmentChat', departmentChatSchema);
const GeneralChat = mongoose.model('GeneralChat', generalChatSchema);

module.exports = { PrivateChat, UnitChat, DepartmentChat, GeneralChat };
