const mongoose = require("mongoose");
const Notification = require("../Models/notification");
const { PrivateChat, UnitChat } = require("../Models/chat");

// [GET] /api/v1/notifications?limit=50&page=1
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const limit = parseInt(req.query.limit, 10) || 50;
    const page = parseInt(req.query.page, 10) || 1;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "firstName lastName userName userImage")
        .populate("recipient", "firstName lastName userName userImage _id")
        .populate({
          path: "chat",
          select: "name chatType department unit participants _id",
          populate: [
            { path: "department", select: "name unit" },
            { path: "unit", select: "unitId churchId unitLogo unitName" },
            {
              path: "participants",
              select: "firstName lastName userName userImage _id"
            },
          ],
        })
        .lean(),
      Notification.countDocuments({ recipient: userId }),
    ]);

    const enrichedNotifications = notifications.map((notification) => {
      const chat = notification.chat;
      let unitId, churchId, image;
      let finalRecipient; // The person to display in the UI (e.g., the sender)
      let chatName = chat?.name || "Unnamed Chat";

      if (chat) {
        if (chat.chatType === "private") {
          // The person to display in the UI for a notification is the sender.
          // The current user (userId) is the recipient of the notification.
          // This logic ensures the UI displays who the message is from.
          finalRecipient = notification.sender;
          if (finalRecipient) {
            chatName = finalRecipient.userName || `${finalRecipient.firstName || ""} ${finalRecipient.lastName || ""}`.trim() || "Private Chat";
            image = finalRecipient.userImage || [];
          }
        } else if (chat.chatType === "department" && chat.department && chat.department.unit) {
          unitId = chat.department.unit.unitId;
          churchId = chat.department.unit.churchId;
          image = chat.department.unit.unitLogo || [];
          chatName = chat.department.name || chatName;
        } else if (chat.chatType === "unit" && chat.unit) {
          unitId = chat.unit.unitId;
          churchId = chat.unit.churchId;
          image = chat.unit.unitLogo || [];
        }
      }

      return {
        ...notification,
        chatContext: {
          chatId: chat?._id,
          type: chat?.chatType,
          name: chatName,
          image: image || [],
          recipientId: finalRecipient?._id,
          recipient: finalRecipient,
          departmentId: chat?.department?._id,
          unitId,
          churchId,
        },
      };
    });

    res.status(200).json({
      success: true,
      data: enrichedNotifications,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[Notification] Fetch Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load notifications",
    });
  }
};

// [PATCH] /api/v1/notifications/:id/markAsRead (unchanged)
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { id: notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (notification.read) {
      return res.status(200).json({
        success: true,
        message: "Notification already marked as read",
        data: notification,
      });
    }

    notification.read = true;
    await notification.save();

    req.io?.to(userId.toString()).emit("notification_updated", {
      type: "read",
      id: notificationId,
    });

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (err) {
    console.error("[Notification] Mark Read Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
    });
  }
};

// [PATCH] /api/v1/notifications/markAllAsRead (unchanged)
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Notification.updateMany(
      { recipient: userId, read: false },
      { $set: { read: true } }
    );

    const { modifiedCount } = result;

    req.io?.to(userId.toString()).emit("notifications_bulk_updated", {
      type: "all_read",
    });

    res.status(200).json({
      success: true,
      message:
        modifiedCount > 0
          ? `${modifiedCount} notifications marked as read`
          : "No unread notifications",
      updatedCount: modifiedCount,
    });
  } catch (err) {
    console.error("[Notification] Mark All Read Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read",
    });
  }
};
