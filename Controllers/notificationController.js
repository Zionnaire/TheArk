const Notification = require("../Models/notification");

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
        .populate("sender", "firstName lastName userName userImage"),
      Notification.countDocuments({ recipient: userId })
    ]);

    res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("[Notification] Fetch Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load notifications"
    });
  }
};

// [PATCH] /api/v1/notifications/:id/markAsRead
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { id: notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    if (notification.read) {
      return res.status(200).json({
        success: true,
        message: "Notification already marked as read",
        data: notification
      });
    }

    notification.read = true;
    await notification.save();

    // Real-time sync via socket (optional)
    req.io?.to(userId.toString()).emit("notification_updated", {
      type: "read",
      id: notificationId
    });

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification
    });
  } catch (err) {
    console.error("[Notification] Mark Read Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read"
    });
  }
};

// [PATCH] /api/v1/notifications/markAllAsRead
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Notification.updateMany(
      { recipient: userId, read: false },
      { $set: { read: true } }
    );

    const { modifiedCount } = result;

    // Real-time broadcast
    req.io?.to(userId.toString()).emit("notifications_bulk_updated", {
      type: "all_read"
    });

    res.status(200).json({
      success: true,
      message:
        modifiedCount > 0
          ? `${modifiedCount} notifications marked as read`
          : "No unread notifications",
      updatedCount: modifiedCount
    });
  } catch (err) {
    console.error("[Notification] Mark All Read Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read"
    });
  }
};
