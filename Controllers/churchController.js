const mongoose = require('mongoose')
const Church = require('../Models/churchesAdmin');
const Unit = require('../Models/unit'); 
const User = require('../Models/user');
const bcrypt = require('bcryptjs');
const jwt = require('../Middlewares/jwt');
const { sendVerificationEmail } = require('../Middlewares/emailVerification');
const logger = require('../Middlewares/logger');
const { uploadToCloudinary } = require('../Middlewares/cloudinaryUpload');
const asyncHandler = require('express-async-handler');
const role = require('../Models/role');
const RefreshToken = require('../Models/refreshToken');



// Utility function to safely parse boolean values from request body
const parseBoolean = (value) => {
    if (typeof value === 'string') {
        const lowerCaseValue = value.toLowerCase();
        if (lowerCaseValue === 'true') return true;
        if (lowerCaseValue === 'false') return false;
    }
    return value; // Return as is if not a string boolean
};

// Create controller for church registration
const registerChurch = async (req, res) => {
    try {
        let { churchName, password, cPassword, churchAddress, churchCity, churchState, churchEmail, churchMedia } = req.body;

        let churchLogo = []; // Initialize as an empty array

        // Check if church already exists
        const churchExists = await Church.findOne({ churchEmail });
        if (churchExists) {
            return res.status(400).json({ message: "Church already exists with this email" });
        }

        // Passwords do not match check (keep this)
        if (password !== cPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        // Upload logo to Cloudinary if a file is provided
        if (req.files && req.files.churchLogo) {
            const file = Array.isArray(req.files.churchLogo)
                ? req.files.churchLogo[0]
                : req.files.churchLogo;

            if (!file.mimetype.startsWith("image/")) {
                return res.status(400).json({ message: "Only image files are allowed." });
            }

            const fileBuffer = file.data || file.buffer;
            if (fileBuffer) {
                const result = await uploadToCloudinary(fileBuffer, "profile-images/");
                churchLogo = [{ url: result.secure_url, cld_id: result.public_id }];
            }
            // No else block needed here; churchLogo remains [] if no file or issue
        }

        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationCodeExpire = Date.now() + 10 * 60 * 1000;

        // Create church
        // Pass the PLAIN TEXT password here. The pre('save') hook will hash it.
        const newChurch = await Church.create({
            churchName,
            password: password,
            churchAddress,
            churchCity,
            churchState,
            churchEmail,
            churchLogo,
            churchMedia,
            isEmailVerified: false,
            verificationCode,
            verificationCodeExpire,
        });

        // 1. Generate Access Token String
        const accessToken = jwt.signJwt({ church: newChurch, role: 'churchAdmin' }); // Ensure role is explicitly passed

        // 2. Generate Refresh Token String
        const refreshTokenString = jwt.signRefreshToken({ _id: newChurch._id }); // Use correct function for refresh token

        // 3. Create the RefreshToken document in the database
        const refreshTokenDocument = await RefreshToken.create({
            churchId: newChurch._id,
            token: refreshTokenString,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });

        // Send verification email
        await sendVerificationEmail(newChurch.churchEmail, newChurch.churchName, verificationCode);

        // Respond with success
        res.status(201).json({
            message: "Church created successfully",
            churchId: newChurch._id, // Add churchId to response
            churchName: newChurch.churchName,
            churchAddress: newChurch.churchAddress,
            churchCity: newChurch.churchCity,
            churchState: newChurch.churchState,
            churchEmail: newChurch.churchEmail,
            churchLogo: newChurch.churchLogo,
            churchMedia: newChurch.churchMedia,
            isEmailVerified: newChurch.isEmailVerified,
            role: newChurch.role,
            verificationCode: newChurch.verificationCode, // Consider removing this from production response
            verificationCodeExpire: newChurch.verificationCodeExpire, // Consider removing this from production response
            token: accessToken,
            refreshToken: refreshTokenString,
        });

    } catch (error) {
        logger.error('Error registering church:', error);
        console.error("Error registering church:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Create controller for church login
const loginChurch = async (req, res) => {
    try {
        const { churchEmail, password } = req.body;

        // Input validation (optional but recommended)
        if (!churchEmail || !password) {
            return res.status(400).json({ message: 'Please enter both email and password' });
        }

        // Check if church exists
        const church = await Church.findOne({ churchEmail: churchEmail });
        if (!church) {
           
            // For security, it's often better to give a generic message
            return res.status(400).json({ message: 'Invalid church email or password' });
        }

       
      
        // Check if password is correct using the schema method
        const isPasswordCorrect = await church.matchPassword(password); // <-- UPDATED LINE
      

        if (!isPasswordCorrect) {
          
            return res.status(400).json({ message: 'Invalid church email or password' }); // Generic message for security
        }

     

        // Check if email is verified
        if (!church.isEmailVerified) {
           
            return res.status(400).json({ message: 'Email not verified. Please verify your email to log in.' });
        }

        // 1. Generate the Access Token
        // Ensure that jwt.signJwt is configured to accept { church } and create a token with church._id and role
        const accessToken = jwt.signJwt({ church: church, role: 'churchAdmin' }); // Explicitly pass role

        // 2. Generate the Refresh Token String
        // Assuming jwt.signRefreshToken function in jwt.js creates a token for refresh purposes
        // This function should accept an object with _id, e.g., jwt.signRefreshToken({ _id: church._id })
        const refreshTokenString = jwt.signRefreshToken({ _id: church._id });

        // 3. Create or Update the RefreshToken document in the database
        // It's usually better to find and update/replace an existing refresh token for a user/church
        // rather than creating a new one on every login, to manage token revocation better.
        let refreshTokenDocument = await RefreshToken.findOne({ churchId: church._id });

        if (refreshTokenDocument) {
            // Update existing token
            refreshTokenDocument.token = refreshTokenString;
            refreshTokenDocument.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
            await refreshTokenDocument.save();
            // console.log(`[Login] Updated existing refresh token for church: ${church._id}`);
        } else {
            // Create new token
            refreshTokenDocument = await RefreshToken.create({
                churchId: church._id,
                token: refreshTokenString,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            });
            // console.log(`[Login] Created new refresh token for church: ${church._id}`);
        }

        // Respond with success
        res.status(200).json({
            churchId: church._id,
            churchName: church.churchName,
            churchAddress: church.churchAddress,
            churchCity: church.churchCity,
            churchState: church.churchState,
            churchEmail: church.churchEmail,
            churchLogo: church.churchLogo,
            churchMedia: church.churchMedia, // Corrected to churchMedia as per your schema
            isEmailVerified: church.isEmailVerified,
            token: accessToken, // Send the access token to the client
            refreshToken: refreshTokenString, // Send the refresh token string
            role: church.role, // Make sure 'role' is part of your Church model or derived correctly
            followers: church.followers,
            following: church.following,
            followersCount: church.followersCount,
            followingCount: church.followingCount,
            churchMembers: church.churchMembers,
            totalMembers: church.totalMembers,
        });

    } catch (error) {
        logger.error('Error logging in church:', error); // Use your logger if defined
        console.error('Error logging in church:', error); // Fallback to console
        console.error(error); // Log the full error stack for debugging

        // Check for specific error types if needed
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }

        res.status(500).json({ message: 'Internal server error' });
    }
};

// Create controller for church logout
const logoutChurch = async (req, res) => {
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

// Create controller for getting all churches
const getAllChurches = async (req, res) => {
    try {
        const churches = await Church.find();
        res.status(200).json(churches);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Create controller for getting a single church
const getChurchById = async (req, res) => {
    try {
        const church = await Church.findById(req.params.id);
        if (!church) {
            return res.status(404).json({ message: 'Church not found' });
        }
        res.status(200).json(church);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

const getChurchProfile = async (req, res) => {
  try {
    // 🛡️ Guard: Check authentication
    if (!req.user || (!req.user._id && !req.user.churchId)) {
      console.warn("getChurchProfile: Authentication context (req.user) is missing or incomplete.");
      return res.status(401).json({ message: 'Authentication context missing. Please log in.' });
    }

    let churchId;

if (req.user.role === 'churchAdmin') {
  churchId = req.user._id; // church IS the user
} else {
  churchId = req.user.churchId;
}

if (!churchId) {
  return res.status(400).json({ message: 'No churchId found in user context' });
}

    // 🔍 Query the Church model (NOT ChurchProfile)
    const church = await Church.findById(churchId)
      .select('-password -cPassword -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire -resetCode -resetCodeExpire')
      .populate({
        path: 'churchMembers',
        select: 'userName firstName lastName email userImage',
      })
      .populate({
        path: 'units',
        select: 'unitName unitLogo members unitHead totalMembers',
        populate: [
          {
            path: 'departments',
            select: 'name',
          },
          {
            path: 'members',
            select: 'userName firstName lastName _id',
          },
          {
            path: 'unitHead',
            select: 'userName firstName lastName _id',
          },
        ],
      });

    if (!church) {
      return res.status(404).json({ message: 'Church not found' }); // ✨ updated message
    }

    // ✅ Send clean church object
    res.status(200).json({
      success: true,
      data: church.toObject(),
    });

  } catch (error) {
    console.error('❌ Error fetching church profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const updateChurchProfile = async (req, res) => {
  try {
    const churchId = req.user.churchId || req.user._id;

    const church = await Church.findById(churchId);
    if (!church) {
      return res.status(404).json({ message: 'Church not found' });
    }

    const {
      churchName,
      churchAddress,
      churchCity,
      churchState,
      churchEmail,
      churchMedia,
      password,
      cPassword,
      phoneNumber,
      isEmailVerified,
    } = req.body;

    if (churchName !== undefined) church.churchName = churchName;
    if (churchAddress !== undefined) church.churchAddress = churchAddress;
    if (churchCity !== undefined) church.churchCity = churchCity;
    if (churchState !== undefined) church.churchState = churchState;
    if (phoneNumber !== undefined) church.phoneNumber = phoneNumber;

    if (churchEmail !== undefined && churchEmail !== church.churchEmail) {
      church.churchEmail = churchEmail;
      church.isEmailVerified = false;
      church.verificationCode = undefined;
      church.verificationCodeExpire = undefined;
    }

    if (isEmailVerified !== undefined) {
      church.isEmailVerified = parseBoolean(isEmailVerified);
    }

    if (churchMedia !== undefined) {
      if (Array.isArray(churchMedia)) {
        church.churchMedia = churchMedia;
      } else {
        console.warn("churchMedia was provided but not an array. Skipping update.");
      }
    }

    if (password && cPassword) {
      if (password !== cPassword) {
        return res.status(400).json({ message: 'Passwords do not match' });
      }
      church.password = password;
    } else if (password || cPassword) {
      return res.status(400).json({ message: 'Both password and confirm password are required.' });
    }

    // Handle churchLogo file upload
    if (req.files && req.files.churchLogo) {
      const file = req.files.churchLogo;
      const base64Image = `data:${file.mimetype};base64,${file.data.toString("base64")}`;

      if (church.churchLogo?.[0]?.cld_id) {
        await cloudinary.uploader.destroy(church.churchLogo[0].cld_id);
      }

      const result = await uploadToCloudinary(base64Image, "church-logos/");
      church.churchLogo = [{ url: result.secure_url, cld_id: result.public_id }];
    } else if (req.body.clearChurchLogo === 'true') {
      if (church.churchLogo?.[0]?.cld_id) {
        await cloudinary.uploader.destroy(church.churchLogo[0].cld_id);
      }
      church.churchLogo = [];
    }

    await church.save({ validateBeforeSave: false });

    // 🔥 Fixed population paths
    const updatedChurch = await Church.findById(churchId)
      .select('-password -cPassword -verificationCode -verificationCodeExpire -resetPasswordToken -resetPasswordExpire -resetCode -resetCodeExpire')
      .populate({
        path: 'churchMembers',
        select: 'userName firstName lastName email userImage',
      })
      .populate({
        path: 'units',
        select: 'unitName unitLogo',
        populate: {
          path: 'departments',
          select: 'name',
        },
      });

    res.status(200).json({
      success: true,
      message: 'Church profile updated successfully',
      church: updatedChurch.toObject(),
    });

  } catch (error) {
    console.error('Error updating church profile:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: errors.join(', ') });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create controller for churchAdmin creating unit or units
const createUnit = asyncHandler(async (req, res) => {
  try {
    const { unitName, description, unitHead: unitHeadStr } = req.body;
    const { role, churchId, isChurchAdmin } = req.user;

    if (!isChurchAdmin || role !== "churchAdmin") {
      console.error("unitController: Unauthorized attempt", { userId: req.user._id, role, isChurchAdmin });
      return res.status(403).json({ message: "Unauthorized: Only Church Admins can create units" });
    }

    const church = await Church.findById(churchId);
    if (!church) {
      console.error("unitController: Church not found", { churchId });
      return res.status(404).json({ message: "Church not found", churchId });
    }

    if (!unitHeadStr) {
      console.error("unitController: Unit head is required", { unitName, churchId });
      return res.status(400).json({ message: "Unit head is required" });
    }

    let unitHeadData;
    try {
      unitHeadData = JSON.parse(unitHeadStr);
      // console.log("unitController: Parsed unitHead:", unitHeadData);
    } catch (error) {
      console.error("unitController: Invalid unitHead format", { unitHeadStr, error: error.message });
      return res.status(400).json({ message: "Invalid unitHead format" });
    }

    if (!mongoose.Types.ObjectId.isValid(unitHeadData._id)) {
      console.error("unitController: Invalid unit head ID", { unitHeadId: unitHeadData._id });
      return res.status(400).json({ message: "Invalid unit head ID" });
    }

    const alreadyHead = await Unit.findOne({ "unitHead._id": unitHeadData._id });
    if (alreadyHead) {
      console.error("unitController: User is already unit head", { unitHeadId: unitHeadData._id, existingUnit: alreadyHead._id });
      return res.status(400).json({ message: "User is already unit head in another unit" });
    }

    const user = await User.findById(unitHeadData._id);
    if (!user) {
      console.error("unitController: Unit head user not found", { unitHeadId: unitHeadData._id });
      return res.status(404).json({ message: "Unit head user not found", unitHeadId: unitHeadData._id });
    }

    const isInChurch = user.churchesJoined.some((id) => id.toString() === churchId.toString());
    if (!isInChurch) {
      console.error("unitController: User is not part of this church", { unitHeadId: unitHeadData._id, churchId });
      return res.status(400).json({ message: "User is not part of this church" });
    }

    const unitHead = {
      _id: user._id.toString(),
      userName: unitHeadData.userName || user.userName || user.firstName || user.lastName || "Unit Head",
      email: unitHeadData.email || user.email || "placeholder@example.com",
    };

    let unitLogo = null;
    if (req.files && req.files.unitLogo) {
      const file = Array.isArray(req.files.unitLogo)
        ? req.files.unitLogo[0]
        : req.files.unitLogo;

      if (!file.mimetype.startsWith("image/")) {
        console.error("unitController: Invalid file type for unit logo", { mimetype: file.mimetype });
        return res.status(400).json({ message: "Only image files are allowed for unit logo." });
      }

      const fileBuffer = file.data || file.buffer;
      if (fileBuffer) {
        const result = await uploadToCloudinary(fileBuffer, "unit-logos/");
        unitLogo = {
          url: result.secure_url,
          cld_id: result.public_id,
        };
      }
    }

    const unit = await Unit.create({
      unitName: unitName || "Unnamed Unit",
      description: description || "No description yet",
      unitLogo: unitLogo ? [unitLogo] : [],
      church: church._id,
      unitHead,
    });

    user.isUnitHead = true;
    user.role = "unitHead";
    if (!user.assignedUnits.includes(unit._id)) {
      user.assignedUnits.push(unit._id);
    }
    user.isEmailVerified = user.isEmailVerified ?? true;
    try {
      await user.save({ validateBeforeSave: false });
      // console.log("unitController: Successfully updated unit head", { unitHeadId: unitHead._id, unitId: unit._id, userRole: user.role });
    } catch (error) {
      console.error("unitController: Failed to update unit head", { unitHeadId: unitHead._id, error: error.message });
      await Unit.deleteOne({ _id: unit._id });
      return res.status(500).json({ message: "Failed to update unit head role", error: error.message });
    }

    church.units.push(unit._id);
    await church.save({ validateBeforeSave: false });

    const populatedUnit = await Unit.findById(unit._id)
      .populate("departments", "name")
      .populate("members.userId", "name userName firstName lastName userImage")
      .lean();

    res.status(201).json({
      message: "Unit created successfully",
      unit: populatedUnit,
    });
  } catch (error) {
    console.error("unitController: Error creating unit:", error.message);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

const updateUnit = asyncHandler(async (req, res) => {
  try {
    const { unitId } = req.params;
    const { unitName, description, unitHead: unitHeadStr } = req.body;
    const { role, churchId, isChurchAdmin } = req.user;

    if (!isChurchAdmin || role !== "churchAdmin") {
      return res.status(403).json({ message: "Unauthorized: Only Church Admins can update units" });
    }

    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    if (unit.church.toString() !== churchId) {
      return res.status(403).json({ message: "Unit does not belong to your church" });
    }

    let unitLogo = unit.unitLogo;
    if (req.files && req.files.unitLogo) {
      const file = Array.isArray(req.files.unitLogo)
        ? req.files.unitLogo[0]
        : req.files.unitLogo;

      if (!file.mimetype.startsWith("image/")) {
        return res.status(400).json({ message: "Only image files are allowed for unit logo." });
      }

      const fileBuffer = file.data || file.buffer;
      if (fileBuffer) {
        const result = await uploadToCloudinary(fileBuffer, "unit-logos/");
        unitLogo = [{
          url: result.secure_url,
          cld_id: result.public_id,
        }];
      }
    }

    let unitHead = unit.unitHead;
    if (unitHeadStr !== undefined) {
      if (unitHeadStr === "") {
        unitHead = null;
      } else {
        let unitHeadData;
        try {
          unitHeadData = JSON.parse(unitHeadStr);
        } catch (error) {
          return res.status(400).json({ message: "Invalid unitHead format" });
        }

        if (!mongoose.Types.ObjectId.isValid(unitHeadData._id)) {
          return res.status(400).json({ message: "Invalid unit head ID" });
        }

        const alreadyHead = await Unit.findOne({
          "unitHead._id": unitHeadData._id,
          _id: { $ne: unitId },
        });
        if (alreadyHead) {
          return res.status(400).json({ message: "User is already unit head in another unit" });
        }

        const user = await User.findById(unitHeadData._id);
        if (!user) {
          return res.status(404).json({ message: "Unit head user not found" });
        }

        const isInChurch = user.churchesJoined.some((id) => id.toString() === churchId.toString());
        if (!isInChurch) {
          return res.status(400).json({ message: "User is not part of this church" });
        }

        unitHead = {
          _id: user._id.toString(),
          userName: unitHeadData.userName || user.userName || user.firstName || user.lastName || "Unit Head",
          email: unitHeadData.email || user.email,
        };
      }
    }

    unit.unitName = unitName || unit.unitName;
    unit.description = description || unit.description;
    unit.unitLogo = unitLogo;
    unit.unitHead = unitHead;

    await unit.save();

    if (unitHeadStr !== undefined) {
      if (unit.unitHead) {
        const user = await User.findById(unit.unitHead._id);
        if (user) {
          user.isUnitHead = true;
          user.role = "unitHead";
          if (!user.assignedUnits.includes(unit._id)) {
            user.assignedUnits.push(unit._id);
          }
          await user.save();
        }
      } else if (unit.unitHead) {
        const previousUser = await User.findById(unit.unitHead._id);
        if (previousUser) {
          previousUser.isUnitHead = false;
          previousUser.role = "member";
          previousUser.assignedUnits = previousUser.assignedUnits.filter(
            (id) => id.toString() !== unit._id.toString()
          );
          await previousUser.save();
        }
      }
    }

    const populatedUnit = await Unit.findById(unit._id)
      .populate("departments", "name")
      .populate("members.userId", "name userName firstName lastName userImage")
      .lean();

    res.status(200).json({
      message: "Unit updated successfully",
      unit: populatedUnit,
    });
  } catch (error) {
    console.error("unitController: Error updating unit:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Assign a user the role of unitHead
const assignUnitHead = async (req, res) => {
  try {
    const { userName } = req.body;
    const { unitId } = req.params;
    const { role, isChurchAdmin, churchId } = req.user;

    if (!isChurchAdmin || role !== 'churchAdmin') {
      return res.status(403).json({ message: "Unauthorized: Only Church Admins can assign unit heads" });
    }

    // Find the church
    const church = await Church.findById(churchId);
    if (!church) {
      return res.status(404).json({ message: "Church not found" });
    }

    // Check if unit exists in this church
    const unitRef = church.units.find((unit) => unit._id.toString() === unitId);
    if (!unitRef) {
      return res.status(404).json({ message: "Unit not found in this church" });
    }

    // Find the user by userName
    const user = await User.findOne({ userName });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "unitHead") {
      return res.status(400).json({ message: "User is already a Unit Head" });
    }

    // Update user's role
    await User.findByIdAndUpdate(user._id, {
      role: "unitHead",
      isUnitHead: true,
    });

    // Update the unit model
    const updatedUnit = await Unit.findByIdAndUpdate(
      unitId,
      { unitHead: user._id },
      { new: true }
    );

    if (!updatedUnit) {
      return res.status(404).json({ message: "Unit record not found in Unit collection" });
    }

    // Update the church.units reference
    const unitIndex = church.units.findIndex((u) => u._id.toString() === unitId);
    if (unitIndex !== -1) {
      church.units[unitIndex].unitHead = user._id;
    }

    await church.save();

    res.status(200).json({ message: "User assigned as Unit Head successfully", unit: updatedUnit });
  } catch (error) {
    console.error("Error assigning Unit Head:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Controller for churchAdmin removing unit head role from a user
const removeUnitHead = async (req, res) => {
  try {
    const { userId } = req.body;
    const { role, isChurchAdmin, churchId } = req.user;

    if (!isChurchAdmin || role !== 'churchAdmin') {
      return res.status(403).json({ message: 'Unauthorized: Church Admin only' });
    }

    const church = await Church.findById(churchId);
    if (!church) {
      return res.status(404).json({ message: 'Church not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Remove unitHead role
    user.role = 'member';
    user.isUnitHead = false;
    await user.save();

    // Optionally: remove reference from any unit
    await Unit.updateMany(
      { unitHead: userId, church: churchId },
      { $unset: { unitHead: '' } }
    );

    res.status(200).json({ message: 'User removed as unit head successfully' });
  } catch (error) {
    console.error('Error removing unit head:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Create controller for churchAdmin getting all units
const getAllUnits = async (req, res) => {
  try {
    const { role, isChurchAdmin, churchId } = req.user;

    if (!isChurchAdmin || role !== 'churchAdmin') {
      return res.status(403).json({ message: 'Unauthorized: Church Admin only' });
    }

    const units = await Unit.find({ church: churchId })
      .populate('unitHead', 'userName firstName lastName')
      .sort({ createdAt: -1 });

    res.status(200).json(units);
  } catch (error) {
    console.error('Error getting units:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


// Create controller for churchAdmin getting a single unit
const getUnitById = async (req, res) => {
  try {
    const { unitId } = req.params;
    const { role, isChurchAdmin, churchId } = req.user;

    if (!isChurchAdmin || role !== 'churchAdmin') {
      return res.status(403).json({ message: 'Unauthorized: Church Admin only' });
    }

    const unit = await Unit.findOne({ _id: unitId, church: churchId }).populate('unitHead');

    if (!unit) {
      return res.status(404).json({ message: 'Unit not found or access denied' });
    }

    res.status(200).json(unit);
  } catch (error) {
    console.error('Error fetching unit by ID:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};



// Create controller for churchAdmin getting all unit members
const getAllUnitMembers = async (req, res) => {
  try {
    const { unitId } = req.params;
    const { role, isChurchAdmin, churchId } = req.user;

    if (!isChurchAdmin || role !== "churchAdmin") {
      return res.status(403).json({ message: "Unauthorized: Church Admin only" });
    }

    const unit = await Unit.findOne({ _id: unitId, church: churchId }).populate("members.userId", "userName firstName lastName avatar email");

    if (!unit) {
      return res.status(404).json({ message: "Unit not found or access denied" });
    }

    res.status(200).json(unit.members);
  } catch (error) {
    console.error("Error fetching unit members:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


// Create controller for churchAdmin getting all members of a church. Church admin should only be able to get members of their own church
const getAllChurchMembers = async (req, res) => {
  try {
    const { role, isChurchAdmin, churchId } = req.user;

    if (!isChurchAdmin || role !== "churchAdmin") {
      return res.status(403).json({ message: "Unauthorized: Church Admin only" });
    }

    const church = await Church.findById(churchId).populate("members._id", "userName firstName lastName email avatar");

    if (!church) {
      return res.status(404).json({ message: "Church not found" });
    }

    res.status(200).json(church.members);
  } catch (error) {
    console.error("Error fetching church members:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



module.exports = {
    registerChurch,
    loginChurch,
    logoutChurch,
    getAllChurches,
    getChurchById,
    createUnit,
    getAllUnits,
    getUnitById,
    updateUnit,
    assignUnitHead,
    removeUnitHead,
    getAllUnitMembers,
    getAllChurchMembers,
    getChurchProfile,
    updateChurchProfile
  
}