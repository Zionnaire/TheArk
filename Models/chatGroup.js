const mongoose = require("mongoose");

const chatGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  units: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true
    }
  ],
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  ],
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const ChatGroup = mongoose.model("ChatGroup", chatGroupSchema);

module.exports = ChatGroup;
