const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
 deptName: { type: String, required: true },
  description: { type: String, default: "" },
  deptLogo: [
        {
            url: { type: String },
            cld_id: { type: String },
        },
    ],
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

module.exports = mongoose.model("Department", departmentSchema);

