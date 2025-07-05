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
    // required: true, // 🔥 makes it non-floating
  },
  unitHead: {
              _id: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: 'User'
              },
              name: {
                  type: String,
                  // required: true
              },
              email: {
                  type: String,
                  // required: true
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
members: [
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
  }
],

  pendingRequests: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
    },
  ],
  totalMembers: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

module.exports = mongoose.model("Unit", unitSchema);
