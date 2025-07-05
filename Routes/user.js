const express = require("express");
const userRouter = express.Router();
const {
    getAllUsers,
    register,
    login,
    getProfile,
    getAllUserChats,
    updateProfile,
    deactivateUser,
    reactivateUser, 
    deleteUser,
    joinChurch,
    forgetPassword,
    resetPassword, 
    getAUserById,
    getFollowers,
    getFollowing,
    followUser,
    unfollowUser,
    getUserProfile,
    getFollowStatus,
    getFollowCounts
} = require("../Controllers/userController");
const upload = require("../Middlewares/upload");
// const { authenticateToken } = require("../Middlewares/authAccess");
const {verifyToken} = require("../Middlewares/jwt");

// Get all users
userRouter.get("/users", verifyToken, getAllUsers);

// Get a user 
userRouter.get("/:userId",verifyToken, getAUserById)

// Register user
userRouter.post("/register", register);

// Login user
userRouter.post("/login", login);

// Get user profile
userRouter.get("/profile", verifyToken,  getProfile);

// User join a church
userRouter.post("/joinChurch", verifyToken, joinChurch)

// Get all user chats
userRouter.get("/userChats", verifyToken, getAllUserChats);

// Get user chat by id
userRouter.get("/userChats/:id", verifyToken, getAllUserChats);

// Update user profile
userRouter.put("/profile", verifyToken, updateProfile);

// forget password
userRouter.post("/forgetPassword", forgetPassword);

// reset password
userRouter.post("/resetPassword", resetPassword);

// Get followers of a user
userRouter.get("/:id/followers", verifyToken, getFollowers);

// Get following of a user
userRouter.get("/:id/following", verifyToken, getFollowing);

// Follow a user
userRouter.put("/:id/follow", verifyToken, followUser);

// Unfollow a user
userRouter.put("/:id/unfollow", verifyToken, unfollowUser);

userRouter.get("/profile/:id", verifyToken, getUserProfile);

// Deactivate user
userRouter.put("/deactivate/:id", verifyToken, deactivateUser);

//  Reactivate user
userRouter.put("/reactivate/:id", verifyToken, reactivateUser);

// Delete user
userRouter.delete("/:id", verifyToken, deleteUser);

userRouter.get('/follow/status/:id', verifyToken, getFollowStatus);
userRouter.get('/follow/:userId/counts', verifyToken, getFollowCounts);



module.exports = userRouter;