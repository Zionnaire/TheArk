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


// Create controller for church registration
const registerChurch = async (req, res) => {
    try {
        let { churchName, password, cPassword, churchAddress, churchCity, churchState, churchEmail, churchLogo, churchMedia } = req.body;

        // Check if church already exists
        const churchExists = await Church.findOne({ churchEmail });
        if (churchExists) {
            return res.status(400).json({ message: "Church already exists" });
        }

        if (password !== cPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        if (!hashedPassword) {
            return res.status(500).json({ message: "Error hashing password" });
        }

        // Upload logo to Cloudinary if a file is provided
        if (req.files && req.files.churchLogo) {
            console.log("Uploading file to Cloudinary...");
            const file = req.files.churchLogo;
            const base64Image = `data:${file.mimetype};base64,${file.data.toString("base64")}`;
            const result = await uploadToCloudinary(base64Image, "profile-images/");
            console.log("File uploaded to Cloudinary:", result);
            
            churchLogo = result.secure_url; // Store URL as a string
        } else {
            churchLogo = ""; // Provide a default empty string
        }

        // Create church
       // Generate verification code
const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
const verificationCodeExpire = Date.now() + 10 * 60 * 1000;

// Create church and assign code before sending email
const newChurch = await Church.create({
    churchName,
    password: hashedPassword,
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

const refreshToken = await RefreshToken.create({
  churchId: newChurch._id,
  token: refreshToken,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
});


// Generate verification code
newChurch.verificationCode = verificationCode;
newChurch.verificationCodeExpire = Date.now() + 10 * 60 * 1000;
await newChurch.save();
await sendVerificationEmail(newChurch.churchEmail, newChurch.churchName, verificationCode);

        res.status(201).json({
            message: "Church created successfully",
            _id: newChurch._id,
            churchName: newChurch.churchName,
            churchAddress: newChurch.churchAddress,
            churchCity: newChurch.churchCity,
            churchState: newChurch.churchState,
            churchEmail: newChurch.churchEmail,
            churchLogo: newChurch.churchLogo,
            churchMedia: newChurch.churchMedia,
            isEmailVerified: newChurch.isEmailVerified,
            role: newChurch.role,
            verificationCode: newChurch.verificationCode,
            verificationCodeExpire: newChurch.verificationCodeExpire,
            token: jwt.signJwt({church: newChurch }),
            refreshToken: refreshToken,
        });
//         console.log("JWT signing payload:", { newChurch });
//         console.log("Code received from user:", verificationCode);
// console.log("Actual code saved in DB:", newChurch.verificationCode);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Create controller for church login
const loginChurch = async (req, res) => {
    try {
        const { churchEmail, password } = req.body;
        // Check if church exists
        const church = await Church.findOne({ churchEmail: churchEmail});
        if (!church) {
            return res.status(400).json({ message: 'Invalid church email' });
        }
        // Check if password is correct
        const isPasswordCorrect = await bcrypt.compare(password, church.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: 'Invalid church password' });
        }
        // Check if email is verified
        // if (!church.isEmailVerified) {
        //     return res.status(400).json({ message: 'Email not verified' });
        // }
        // Create token
        const token = jwt.signJwt({ church });
const refreshToken = await RefreshToken.create({
  churchId: church._id,
  token: refreshToken,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
});      


res.status(200).json({
            _id: church._id,
            churchName: church.churchName,
            churchAddress: church.churchAddress,
            churchCity: church.churchCity,  
            churchState: church.churchState,
            churchEmail: church.churchEmail,
            churchLogo: church.churchLogo,
            churchSocialMedia: church.churchSocialMedia,
            isEmailVerified: church.isEmailVerified,
            token: token,
            refreshToken: refreshToken,
            role: church.role,
        });

        } catch (error) {
            logger.error('Error logging in church:', error);
            console.error('Error logging in church:', error);
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

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

// Create controller for updating church details
const updateChurch = async (req, res) => {
    try {
        const church = await Church.findById(req.params.id);
        if (!church) {
            return res.status(404).json({ message: 'Church not found' });
        }
        const updatedChurch = await Church.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedChurch);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Create controller for churchAdmin creating unit or units
const createUnit = async (req, res) => {
    try {
      const { unitName, description } = req.body;
  
      if (!req.user || !req.user.churchId) {
        return res.status(403).json({ message: "Unauthorized: Church Admin only" });
      }
  
      const church = await Church.findById(req.user.churchId);
      if (!church) {
        return res.status(404).json({ message: "Church not found" });
      }
  
      const unit = await Unit.create({
        unitName,
        description,
        church: req.user.churchId,
        members: [],
        unitHead: null, 
        totalUnits: 0,
      });
      // Save the unit to the church
      church.units.push({ unit });
      await church.save();
      // update total unit count

      unit.totalUnits += 1;
      await unit.save();

      res.status(201).json(unit);
    } catch (error) {
      console.error("Error creating unit:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
  

// Assign a user the role of unitHead
const assignUnitHead = async (req, res) => {
    try {
        const { userName } = req.body;
        const { unitId } = req.params; 

        // Ensure the user is authenticated and is a Church Admin
        if (!req.user || !req.user.churchId) {
            return res.status(403).json({ message: "Unauthorized: Church Admin only" });
        }

        const churchId = req.user.churchId;

        // Find the church
        const church = await Church.findById(churchId);
        if (!church) {
            return res.status(404).json({ message: "Church not found" });
        }

        // Check if the unit exists in the church
        const unit = church.units.find(unit => unit._id.toString() === unitId);
        if (!unit) {
            return res.status(404).json({ message: "Unit not found in this church" });
        }

        // Find the user by username
    const user = await User.findOne({ userName });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if the user is already a Unit Head
        if (user.role === "unitHead") {
            return res.status(400).json({ message: "User is already a Unit Head" });
        }

        // Assign the Unit Head role to the user
        await User.findByIdAndUpdate(user._id, { role: "unitHead" }, { new: true, runValidators: false });
        user.isUnitHead = true;

         // Save the user to the unit
         unit.unitHead = user._id;
         await church.save();
       
        // Update the Unit model (assuming `Unit` schema has a `unitHead` field)
        await Unit.findByIdAndUpdate(unitId, { unitHead: user._id });

        res.status(200).json({ message: "User assigned as Unit Head successfully" });
    } catch (error) {
        console.error("Error assigning Unit Head:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};


// Controller for churchAdmin removing unit head role from a user
const removeUnitHead = async (req, res) => {
    try {
        const { userId } = req.body;
        const churchId = req.params.id; 

        // Find the church
        const church = await Church.findById(churchId);
        if (!church) {
            return res.status(404).json({ message: 'Church not found' });
        }

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Remove the unit head role from the user
        user.role = 'member'; 
        await user.save();

        res.status(200).json({ message: 'User removed from unit head successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Create controller for churchAdmin getting all units
const getAllUnits = async (req, res) => {
    try {
        const churchId = req.params.id;
        const units = await Unit.find({ church: churchId });
        res.status(200).json(units);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Create controller for churchAdmin getting a single unit
const getUnitById = async (req, res) => {
    try {
        const unitId = req.params.unitId;
        const unit = await Unit.findById(unitId);
        if (!unit) {
            return res.status(404).json({ message: 'Unit not found' });
        }
        res.status(200).json(unit);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Create controller for churchAdmin updating unit details
const updateUnit = async (req, res) => {
    try {
        const unitId = req.params.unitId;
        const unit = await Unit.findById(unitId);
        if (!unit) {
            return res.status(404).json({ message: 'Unit not found' });
        }
        const updatedUnit = await Unit.findByIdAndUpdate(unitId, req.body, { new: true });
        res.status(200).json(updatedUnit);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Create controller for churchAdmin getting all unit members
const getAllUnitMembers = async (req, res) => {
    try{
        const unitId = req.params.unitId;
        const unit = await Unit.findById(unitId).populate('members'); // Assuming members is an array of user IDs
        if (!unit) {
            return res.status(404).json({ message: 'Unit not found' });
        }
        res.status(200).json(unit.members); // Return the members of the unit
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Create controller for churchAdmin getting all members of a church. Church admin should only be able to get members of their own church
const getAllChurchMembers = async (req, res) => {
    try {
        const churchId = req.params.id;
        const church = await Church.findById(churchId).populate('members'); 
        if (!church) {
            return res.status(404).json({ message: 'Church not found' });
        }
        res.status(200).json(church.members); // Return the members of the church
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
}


module.exports = {
    registerChurch,
    loginChurch,
    logoutChurch,
    getAllChurches,
    getChurchById,
    updateChurch,
    createUnit,
    getAllUnits,
    getUnitById,
    updateUnit,
    assignUnitHead,
    removeUnitHead,
    getAllUnitMembers,
    getAllChurchMembers
  
}