const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema({
  unitName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  unitLogo: [
    {
      url: { type: String },
      cld_id: { type: String },
    },
  ],
  church: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Church",
  },
  unitHead: {
    _id: {
      type: String,
      required: true
    },
    userName: {
      type: String,
      required: true
    },
    email: {
      type: String
    }
  },
  description: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  departments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Department" }],
  chatGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: "ChatGroup" }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  pendingRequests: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
    }
  ],
  totalMembers: {
    type: Number,
    default: 0,
  }
}, { timestamps: true });

module.exports = mongoose.model("Unit", unitSchema);
