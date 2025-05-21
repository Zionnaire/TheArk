const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
    {
        comment: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", required: true },
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        reason: { type: String, required: true, enum: ["spam", "harassment", "hate speech", "other"] },
        status: { type: String, default: "pending", enum: ["pending", "reviewed", "resolved"] },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);
