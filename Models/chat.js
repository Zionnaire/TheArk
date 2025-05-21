const mongoose = require('mongoose');

// Private Chat Schema (One-on-One)
const privateChatSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    attachments: [{ url: String, cld_id: String }],
    reactions: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, type: String }],
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Unit Chat Schema
const unitChatSchema = new mongoose.Schema({
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    attachments: [{ url: String, cld_id: String }],
    reactions: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, type: String }],
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Department Chat Schema 
const departmentChatSchema = new mongoose.Schema({
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    attachments: [{ url: String, cld_id: String }],
    reactions: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, type: String }],
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// General Chat Schema
const generalChatSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
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
