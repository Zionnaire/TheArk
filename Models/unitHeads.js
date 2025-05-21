const mongoose = require("mongoose");

const unitHeadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: "unitHead",
    enum: ["unitHead"], // Ensuring only "unitHead" is allowed
  },
  assignedUnit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Unit", // Assuming you have a Unit model
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const UnitHead = mongoose.model("UnitHead", unitHeadSchema);

module.exports = UnitHead;
