const express = require('express');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../Models/refreshToken');
const User = require('../Models/user');
const { signJwt, signRefreshToken } = require('../Middlewares/jwt');

const refreshRouter = express.Router();
refreshRouter.use(express.json());

refreshRouter.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token required" });
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const stored = await RefreshToken.findOne({ userId: payload._id, token: refreshToken });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(403).json({ message: "Refresh token invalid or expired" });
    }

    const user = await User.findById(payload._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const newAccessToken = signJwt({ user });

    // Optional: Rotate refresh token (stronger security)
     await RefreshToken.deleteOne({ token: refreshToken });
    const newRefreshToken = signRefreshToken({ id: user._id });
     await RefreshToken.create({
       userId: user._id,
       token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(403).json({ message: "Invalid refresh token" });
  }
});

module.exports = refreshRouter;
