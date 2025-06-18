const express = require('express');
const { verifyToken } = require('../Middlewares/jwt');
const{ getNotifications, markNotificationAsRead, markAllNotificationsAsRead } = require('../Controllers/notificationController');

const notificationRouter = express.Router();

notificationRouter.get('/', verifyToken, getNotifications);
notificationRouter.patch('/:id/markAsRead', verifyToken, markNotificationAsRead);
notificationRouter.patch('/markAllAsRead', verifyToken, markAllNotificationsAsRead);

module.exports = notificationRouter;