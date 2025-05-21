
const express = require('express');
const adminRouter = express.Router();
const {
  createAdmin,
  loginAdmin,
  getAdminProfile,
  updateAdminProfile,
  changeMemberRole,
  getAllUnitHeads,
  getAllUsers,
  createUnit,
  updateUnit,
    getUserById,
    deleteUser,
    getUnitById,
    getAllUnits,
    getInactiveUnits,
    reactivateUnit,
    deactivateUnit,
    getAllReports,
    updateReportStatus,
    deleteReportedComment,  
} = require('../Controllers/adminController');

const { isAdmin } = require('../Middlewares/authAccess');
const { verifyToken } = require('../Middlewares/jwt');

// Admin authentication routes
adminRouter.post('/login', loginAdmin);
adminRouter.post('/register', createAdmin);

adminRouter.get('/units', getAllUnits);
adminRouter.get('/users', getAllUsers);
adminRouter.get('/users/:id', getUserById);
adminRouter.get('/units/:id', getUnitById);
adminRouter.get('/units/unitHeads', getAllUnitHeads);
adminRouter.get('/reports', getAllReports);


// Protected admin routes
adminRouter.use(verifyToken, isAdmin);


// User management
adminRouter.get('/profile', getAdminProfile);
adminRouter.put('/profile', updateAdminProfile);
adminRouter.put('/role/:userId', changeMemberRole);
adminRouter.delete('/users/:id', deleteUser);

// Report management
adminRouter.put('/reports/:id', updateReportStatus);
adminRouter.delete('/comments/:commentId', deleteReportedComment);

// Unit management
adminRouter.post('/units',createUnit);
adminRouter.put('/units/:id', updateUnit);
adminRouter.delete('/units/:id', deactivateUnit);
adminRouter.put('/units/:id/reactivate', reactivateUnit);
adminRouter.get('/units/inactive', getInactiveUnits);

// Order management
// router.get('/orders', adminController.getAllOrders);
// router.get('/orders/:id', adminController.getOrderById);
// router.put('/orders/:id', adminController.updateOrderStatus);
// router.delete('/orders/:id', adminController.deleteOrder);

// Dashboard statistics
// router.get('/dashboard/stats', adminController.getDashboardStats);
// router.get('/dashboard/sales', adminController.getSalesReport);

module.exports = adminRouter;
