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

    console.log(`[Backend] getNotifications called`, {
      userId: userId.toString(),
      limit,
      page,
    });

    // Count unread (for badge)
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      read: false,
    });

    // Fetch paginated notifications
    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "firstName lastName userName userImage")
        .populate("recipient", "firstName lastName userName userImage _id")
        .populate({
          path: "chat",
          select: "name chatType department unit church participants _id image",
          populate: [
            { path: "department", select: "deptName deptLogo unit _id" },
            {
              path: "unit",
              select: "unitId churchId unitLogo unitName members unitHead _id",
            },
            { path: "church", select: "churchName churchLogo _id" },
            {
              path: "participants",
              select: "firstName lastName userName userImage _id",
            },
          ],
        })
        .lean(),
      Notification.countDocuments({ recipient: userId }),
    ]);

    // Transform notifications into consistent shape
    const enrichedNotifications = notifications.map((notification) => {
      const chat = notification.chat;
      let unitId, churchId, image, chatName;
      let finalRecipient;

      if (chat) {
        chatName =
          chat.name ||
          chat.department?.deptName ||
          chat.unit?.unitName ||
          chat.church?.churchName ||
          "Unnamed Chat";

        image =
          chat.unit?.unitLogo ||
          chat.department?.deptLogo ||
          chat.church?.churchLogo ||
          chat.image ||
          [];

        if (chat.chatType === "private") {
          finalRecipient = notification.sender;
          if (finalRecipient) {
            chatName =
              finalRecipient.userName ||
              `${finalRecipient.firstName || ""} ${
                finalRecipient.lastName || ""
              }`.trim() ||
              "Private Chat";
            image = finalRecipient.userImage || [];
          }
        } else if (chat.chatType === "department" && chat.department?.unit) {
          unitId = chat.department.unit.unitId;
          churchId = chat.department.unit.churchId;
        } else if (chat.chatType === "unit" && chat.unit) {
          unitId = chat.unit.unitId;
          churchId = chat.unit.churchId;
        }
      }

      return {
        ...notification,
        chatContext: {
          chatId: chat?._id?.toString(),
          type: chat?.chatType,
          name: chatName,
          image: Array.isArray(image)
            ? image.map((img) => ({
                url: img.url || img,
                type: "image",
              }))
            : [],
          recipientId: finalRecipient?._id,
          recipient: finalRecipient,
          departmentId: chat?.department?._id?.toString() || null,
          unitId: unitId || chat?.unit?._id?.toString() || null,
          churchId: churchId || chat?.church?._id?.toString() || null,
          participants: chat?.participants?.map((p) => p._id.toString()) || [],
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
      unreadCount, // 👈 now consistent with badge + your markRead APIs
    });
  } catch (err) {
    console.error("[Notification] Fetch Error:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      message: "Failed to load notifications",
      error: err.message,
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

    // 🔥 Fetch fresh unread count
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      read: false,
    });

    // 🔥 Emit socket update
    req.io?.to(userId.toString()).emit("notification_updated", {
      type: "read",
      id: notificationId,
      unreadCount,
    });

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
      unreadCount,
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

    // 🔥 Fresh unread count (should be 0 now)
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      read: false,
    });

    // 🔥 Emit socket update
    req.io?.to(userId.toString()).emit("notifications_bulk_updated", {
      type: "all_read",
      unreadCount,
    });

    res.status(200).json({
      success: true,
      message:
        modifiedCount > 0
          ? `${modifiedCount} notifications marked as read`
          : "No unread notifications",
      updatedCount: modifiedCount,
      unreadCount,
    });
  } catch (err) {
    console.error("[Notification] Mark All Read Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read",
    });
  }
};

