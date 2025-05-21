const User = require("../Models/user");
const Church = require("../Models/churchesAdmin")
const bcrypt = require("bcryptjs");
const { signJwt, signRefreshToken } = require("../Middlewares/jwt");
const Role = require("../Models/role");
const logger = require("../Middlewares/logger");
const { uploadToCloudinary } = require("../Middlewares/cloudinaryUpload");

// Register user
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const user = require("../Models/user");
const role = require("../Models/role");

const generateVerificationCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      cPassword,
      role,
      userName,
      phoneNumber,
    } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User with this email already exists" });
    }

    if (password !== cPassword) {
      return res.status(400).json({ message: "Confirm password must match password" });
    }

    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiration

    const newUser = await User.create({
      userName,
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      role,
      chats: [],
      userImage: [],
      posts: [],
      socialMedia: [],
      isActive: true,
      isEmailVerified: false,
      verificationCode,
      verificationCodeExpire: expiresAt,
    });

    const token = signJwt({ user: newUser, role: newUser.role, name: newUser.firstName });
    const refreshToken = signRefreshToken({ id: newUser._id });

    // Save again to ensure the code is persisted
    await newUser.save({ validateBeforeSave: false });

    // Send verification email
    await transporter.sendMail({
      from: process.env.EMAIL_USERNAME,
      to: newUser.email,
      subject: "Verify Your Account",
      text: `Hi ${newUser.firstName},\n\nYour verification code is: ${verificationCode}.\n\nThank you!`,
    });

    const responsePayload = {
      message: `Verification code sent to ${newUser.email}`,
      Id: newUser._id,
      email: newUser.email,
      role: newUser.role,
      userName: newUser.userName,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      phoneNumber: newUser.phoneNumber,
      isActive: newUser.isActive,
      isEmailVerified: newUser.isEmailVerified,
      userImage: newUser.userImage,
      socialMedia: newUser.socialMedia,
      token,
      refreshToken,
    };

    // Only return the code in non-production (debugging/dev mode)
    if (process.env.NODE_ENV !== "production") {
      responsePayload.verificationCode = verificationCode;
      responsePayload.verificationCodeExpire = expiresAt;
    }

    return res.status(201).json(responsePayload);
  } catch (error) {
    console.error("Register Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Create JWT token
    // Use JWT from middleware

   
    const token = signJwt({ user, role: user.role, name: user.firstName });
    const refreshToken = signRefreshToken({ id: user._id });

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userName: user.userName,
        phoneNumber: user.phoneNumber,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        userImage: user.userImage,
        chats: user.chats,
        posts: user.posts,
        socialMedia: user.socialMedia,
        bio: user.bio
      },
    });
  } catch (err) {
    console.error(err.message);
    logger.error(err.message);
    console.log(err.message);
    res.status(500).send("Server error");
  }
};

const logoutUser = async (req, res) => {
    try {
         const { refreshToken } = req.body;
        // Clear token from cookies
        res.clearCookie('token');
        res.clearCookie('refreshToken');
        // Optionally, you can also invalidate the token on the server side
          await RefreshToken.deleteOne({ token: refreshToken }); 
        // Send response
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Get user profile
const getProfile = async (req, res) => {
  try {
    console.log("User from token:", req.user);
    // Ensure the user is authenticated
    if (!req.user || !req.user.id) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }

    // Fetch user from database 
    const userId = req.user.id; 

    const user = await User.findById(userId).select("-password");

    // If user does not exist
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (err) {
    console.error("Error fetching profile:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};


// Update profile PUT request with image
const updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      userName,
      phoneNumber,
      bio,
      socialMedia,
      isEmailVerified,
    } = req.body;

    console.log("This is req user", req.user);

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    const user = await User.findById(userId);
    console.log("This is the stored user", user);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update fields if provided
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (userName) user.userName = userName;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (bio) user.bio = bio;
    if (isEmailVerified !== undefined) user.isEmailVerified = isEmailVerified;

    // Handle socialMedia parsing
    if (socialMedia) {
      const parsed = typeof socialMedia === 'string' ? JSON.parse(socialMedia) : socialMedia;
      user.socialMedia = parsed;
    }

    // Image upload
    if (req.files && req.files.userImage) {
      const file = Array.isArray(req.files.userImage)
        ? req.files.userImage[0]
        : req.files.userImage;

      if (!file.mimetype.startsWith("image/")) {
        return res.status(400).json({ message: "Only image files are allowed." });
      }

      const fileBuffer = file.data || file.buffer;
      if (fileBuffer) {
        const result = await uploadToCloudinary(fileBuffer, "profile-images/");
        user.userImage = [{ url: result.secure_url, cld_id: result.public_id }];
      }
    }

    // Save and re-fetch updated user
    await user.save({ validateBeforeSave: false });
    const freshUser = await User.findById(user._id);

    const token = signJwt({ user: freshUser });
    const refreshToken = signRefreshToken({ id: freshUser._id });

    res.json({
      message: "Profile updated successfully",
      user: {
        id: freshUser._id,
        firstName: freshUser.firstName,
        lastName: freshUser.lastName,
        email: freshUser.email,
        userName: freshUser.userName,
        phoneNumber: freshUser.phoneNumber,
        bio: freshUser.bio,
        role: freshUser.role,
        userImage: freshUser.userImage || [],
        socialMedia: freshUser.socialMedia,
        isEmailVerified: freshUser.isEmailVerified,
        token,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get a user by ID (from authenticated user or params)
const getAUserById = async (req, res) => {
  try {
    const { userId } = req.params; // 🔥 get ID from route params

    const user = await User.findById(userId)
      .select("-password") // exclude sensitive info
      .populate("followers", "firstName lastName userImage")
      .populate("following", "firstName lastName userImage");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (err) {
    console.error("Error fetching user:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
    logger.error(err);
  }
};

// Get all user chats
const getAllUserChats = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).populate("privateChats").populate("unitChats").populate("departmentChats").populate("generalChats");
     console.log("User from token:", req.user);

    if (!user) {
      console.error(`[getAllUserChats] User not found: ${userId}`);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.chats || user.chats.length === 0) {
      return res.status(200).json({ success: true, message: "No chats found", chats: [] });
    }

    res.status(200).json({ success: true, 
      chats: {
        privateChats: user.privateChats,
        unitChats: user.unitChats,
        departmentChats: user.departmentChats,
        generalChats: user.generalChats,
      }
    
    });
  } catch (err) {
    console.error(`[getAllUserChats] Error:`, err);
    res.status(500).json({ success: false, message: "Server error. Please try again later." });
  }
};

// User join a church
const joinChurch = async (req, res) => {
  try {
    const { churchId } = req.body;
    const userId = req.user.id; 

    if (!churchId) {
      return res.status(400).json({ message: 'Church ID is required' });
    }

    const church = await Church.findById(churchId);
    if (!church) {
      return res.status(404).json({ message: 'Church not found' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent duplicate joining
    if (user.churchesJoined.includes(churchId)) {
      return res.status(400).json({ message: 'You have already joined this church.' });
    }

    // Update user's joined churches
    user.churchesJoined.push(churchId);
    await user.save();

    res.status(200).json({
      message: 'Successfully joined the church',
      churchesJoined: user.churchesJoined,
    });
  } catch (error) {
    console.error('Error joining church:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Forget password for user
const forgetPassword = async (req, res) => {
  try {
    const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  const resetCode = generateVerificationCode();
  const codeExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  user.resetCode = resetCode;
  user.resetCodeExpire = codeExpires;
 await user.save({ validateBeforeSave: false });

    // Send email with the code
    await transporter.sendMail({
      to: email,
      subject: "Your Password Reset Code",
      text: `Your password reset code is: ${resetCode}\nIt will expire in 10 minutes.`,
    });

    res.json({ message: "Reset code sent to email" });
  } catch (error) {
    console.error("Forget password error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// controllers/userController.js
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    const user = await User.findOne({ email });

    if (
      !user ||
      user.resetCode !== code ||
      !user.resetCodeExpire ||
      Date.now() > user.resetCodeExpire
    ) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    // Update password
    user.password = newPassword; 
    user.resetCode = undefined;
    user.resetCodeExpire = undefined;
    const token = signJwt({ user });
    await user.save({ validateBeforeSave: false });

    res.json({ message: "Password has been reset successfully", token });
  } catch (error) {
    console.error("Reset password error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// User renders account inactive
const deactivateUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Find the user in the database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is authenticated
    if (!req.user.user || !req.user.user.id) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }

    // console.log("Decoded user:", req.user);
    // Ensure the logged-in user is the one being deactivated
    if (req.user.user.id.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({
          message: "Forbidden: You can only deactivate your own account",
        });
    }

    // Deactivate the user
    user.isActive = false;
    await user.save({ validateBeforeSave: false });

    res.json({
      message: "User account deactivated successfully",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isActive: user.isActive,
      },
    });

    logger.info("User account deactivated successfully");
  } catch (err) {
    console.error("Deactivate user error:", err.message);
    res.status(500).json({ message: "Server error" });
    logger.error(err);
  }
};

// Reactivate user
const reactivateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    // Check if user is authenticated
    if (!req.user.user || !req.user.user.id) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }
    // Find the user in the database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // Ensure the
    if (req.user.user.id.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({
          message: "Forbidden: You can only reactivate your own account",
        });
    }
    // Reactivate the user
    user.isActive = true;
    await user.save({ validateBeforeSave: false });
    res.json({
      message: "User account reactivated successfully ",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isActive: user.isActive,
      },
    });
    logger.info("User account reactivated successfully");
  } catch (err) {
    console.error("Deactivate user error:", err.message);
    res.status(500).json({ message: "Server error" });
    logger.error(err);
  }
};

// Delete user
const deleteUser = async (req, res) => {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Forbidden: Admin privileges required" });
  }
  if (req.user.id === req.params.id || req.user.role === "admin") {
    try {
      await User.findByIdAndRemove(req.params.id);
      // Render user inactive
      const user = await User.findById(req.params.id);
      user.isActive = false;
      await user.save();
      res.json({
        message: "User deleted successfully",

        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          isActive: user.isActive,
        },
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  } else {
    res.status(401).json({ message: "Unauthorized" });
  }
};

module.exports = {
  register,
  login,
  logoutUser,
  getProfile,
  updateProfile,
  getAllUsers,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getAllUserChats,
  joinChurch,
  forgetPassword,
  resetPassword,
  getAUserById
};
