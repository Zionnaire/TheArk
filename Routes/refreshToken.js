const express = require('express');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../Models/refreshToken');
const User = require('../Models/user');
const Church = require('../Models/churchesAdmin'); // Make sure Church model is imported
const { signJwt, signRefreshToken } = require('../Middlewares/jwt');

const refreshRouter = express.Router();
refreshRouter.use(express.json());

refreshRouter.post('/refresh-token', async (req, res) => {
const { refreshToken } = req.body;

if (!refreshToken) {
 return res.status(400).json({ message: "Refresh token required" }); }

 try {
 const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
 const { _id, role } = payload; // Destructure 'id' and 'role' from the payload

if (!_id || !role) {
 return res.status(403).json({ message: "Invalid refresh token payload" });
  }

 let query;
 let entity;

if (role === 'member') {
 query = { userId: _id, token: refreshToken };
entity = await User.findById(_id);
} else if (role === 'churchAdmin') {
query = { churchId: _id, token: refreshToken };
 entity = await Church.findById(_id); // Find by church ID
 } else {
return res.status(403).json({ message: "Unknown role in refresh token" });
}

 const stored = await RefreshToken.findOne(query);

 if (!stored || stored.expiresAt < new Date()) {
 return res.status(403).json({ message: "Refresh token invalid or expired" });
}

 if (!entity) {
return res.status(404).json({ message: "Associated account not found" });
}

 const newAccessToken = signJwt({ [role === 'member' || "churchAdmin" ? 'user' : 'church']: entity, role }); // Pass user or church based on role
 // If your signJwt expects a 'user' or 'church' property in options, adapt this.
 // For example: signJwt({ user: entity, role: 'member' }) if role is 'member'

// Rotate refresh token
 await RefreshToken.deleteOne({ token: refreshToken });
 const newRefreshToken = signRefreshToken({ _id: entity._id, role }); // Use entity._id and role for new refresh token
 await RefreshToken.create({
 [role === 'member' ||'churchAdmin' ? 'userId' : 'churchId']: entity._id, // Save to correct ID field
 token: newRefreshToken,
expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
 });

 res.json({ token: newAccessToken, refreshToken: newRefreshToken });
} catch (error) {
 console.error("Refresh token error:", error);
 let errorMessage = "Invalid refresh token";
 if (error.name === "TokenExpiredError") {
 errorMessage = "Refresh token has expired, please log in again.";
 } else if (error.name === "JsonWebTokenError") {
 errorMessage = "Invalid refresh token signature or format.";
 }
return res.status(403).json({ message: errorMessage });
}
});

module.exports = refreshRouter;