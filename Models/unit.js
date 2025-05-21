const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema({
  unitName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  unitHead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  description: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  departments: [
    {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Department",
      },
      name: String,
    },
  ],
  chatGroups: [
    {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ChatGroup",
      },
      name: String,
    },
  ],
  members: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      name: String,
    },
  ],
  pendingRequests: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      name: String,
    },
  ],
  totalMembers: {
    type: Number,
    default: 0,
  },
  totalUnits: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

const Unit = mongoose.model("Unit", unitSchema);
module.exports = Unit;