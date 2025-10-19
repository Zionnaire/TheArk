const express = require("express");
const jwt = require("jsonwebtoken");
const RefreshToken = require("../Models/refreshToken");
const User = require("../Models/user");
const Church = require("../Models/churchesAdmin");
const { signJwt, signRefreshToken } = require("../Middlewares/jwt");

const refreshRouter = express.Router();
refreshRouter.use(express.json());

refreshRouter.post("/refresh-token", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token is required" });
  }

  try {
    // Step 1: Verify the refresh token's signature using its dedicated secret.
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const { _id, role } = payload;

    if (!_id || !role) {
      return res.status(403).json({ message: "Invalid refresh token payload" });
    } // Step 2: Look up the token in the database to check for validity and expiration.

    const storedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!storedToken) {
      return res
        .status(403)
        .json({
          message: "Refresh token not found. It may have been revoked.",
        });
    }

    if (storedToken.expiresAt < new Date()) {
      await storedToken.deleteOne(); // Clean up the expired token
      return res
        .status(403)
        .json({ message: "Refresh token has expired, please log in again." });
    } 
    
    // Step 3: Find the associated user or church account.

    let entity;
    if (role === "member" || role === "unitHead") {
      entity = await User.findById(_id).lean();
    } else if (role === "churchAdmin") {
      entity = await Church.findById(_id).lean();
    }

    if (!entity) {
      
      await RefreshToken.deleteOne({ token: refreshToken }); // Clean up the stale token
      return res.status(404).json({ message: "Associated account not found" });
    } 
    
    // Step 4: Generate new tokens.

    const newAccessToken = signJwt({
      user: entity,
      church: role === "churchAdmin" ? entity : null,
      role,
    });
    const newRefreshToken = signRefreshToken({ _id: entity._id, role }); 
    
    // Step 5: Rotate the refresh token in the database.

    await storedToken.deleteOne();
    await RefreshToken.create({
      ...(role === "member"
        ? { userId: entity._id }
        : { churchId: entity._id }),
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    }); 

    // If multiple login attempts create orphaned refresh tokens, consider adding a cleanup mechanism to remove expired or unused tokens:
    // e.g., a scheduled job that runs daily to delete tokens older than their expiration date.
    await RefreshToken.deleteMany({ expiresAt: { $lt: new Date() } });
    
    // Step 6: Send the new tokens and updated user object.

    res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        ...entity,
        role,
      },
    });
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

refreshRouter.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;
  console.log("[refreshRouter] Logout request with refresh token:", refreshToken);
  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token is required" });
  }
  try {
    await RefreshToken.deleteOne({ token: refreshToken });
    console.log("[refreshRouter] Refresh token deleted successfully");
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("[refreshRouter] Logout error:", error);
    res.status(500).json({ message: "Failed to log out" });
  }
});

module.exports = refreshRouter;
