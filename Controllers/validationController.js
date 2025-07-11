// Assuming you have User and Church models
const User = require('../Models/user');
const Church = require('../Models/churchesAdmin');

const validateToken = async (req, res) => {
  try {
    // Your JWT verification middleware should have already populated req.user (or req.authEntity)
    // with the _id and role from the token payload.
    // Example: req.user = { _id: "...", role: "member" } or { _id: "...", role: "churchAdmin" }
    const { _id, role } = req.user; // Assuming req.user is set by your auth middleware

    if (!_id || !role) {
      return res.status(401).json({ message: "Invalid token payload: missing ID or role." });
    }

    let entity;
    if (role === 'member' || role === 'unitHead') {
      entity = await User.findById(_id).select('-password'); // Fetch user, exclude password
    } else if (role === 'churchAdmin') {
      entity = await Church.findById(_id).select('-password'); // Fetch church, exclude password (if applicable)
    } else {
      return res.status(403).json({ message: "Unauthorized role." });
    }

    if (!entity) {
      // This is the key scenario: user/church found in token but not in DB
      return res.status(404).json({ message: "You are not yet a member, go and register please!" });
    }

    // If everything is valid, send back the entity (user or church) and its role
    res.status(200).json({
      success: true,
      message: "Token and entity valid",
      entity: entity, // This will be either a User or a Church object
      role: role
    });

  } catch (error) {
    console.error("Backend token validation error:", error);
    // Be careful not to expose sensitive error details in production
    res.status(500).json({ message: "Server error during token validation." });
  }
};

module.exports = {validateToken}