const express = require("express");
const churchRouter = express.Router();

const {
  registerChurch,
  loginChurch,
  getChurchById,
  getAllChurches,
  logoutChurch,
  createUnit,
  getAllUnits,
  getUnitById,
  updateUnit,
  assignUnitHead,
  removeUnitHead,
  getAllUnitMembers,
  getAllChurchMembers,
  getChurchProfile,
  updateChurchProfile,
} = require("../Controllers/churchController");

const { verifyToken } = require("../Middlewares/jwt");

// Specific routes that DON'T use dynamic :id at the end
churchRouter.post("/register", registerChurch);
churchRouter.post("/login", loginChurch);
churchRouter.get("/logout", verifyToken, logoutChurch);

// Specific Church Profile routes - PLACE THESE BEFORE /:id
churchRouter.get("/profile", verifyToken, getChurchProfile);
churchRouter.put("/updateProfile", verifyToken, updateChurchProfile);

// Unit creation (no :id conflict here)
churchRouter.post("/units", verifyToken, createUnit);

// Routes with multiple parameters (most specific first)
churchRouter.put("/units/:unitId/assignhead", verifyToken, assignUnitHead);
// Ensure this also comes before general :id
churchRouter.put("/:id/units/:unitId/removeHead", verifyToken, removeUnitHead); // If this is `/churchId/units/unitId/removeHead`
churchRouter.get("/:id/units/:unitId/members", getAllUnitMembers);
churchRouter.get("/:id/units/:unitId", getUnitById);
churchRouter.put("/units/:unitId", verifyToken, updateUnit);
churchRouter.get("/:id/units", getAllUnits); // All units for a specific church
churchRouter.get("/:id/members", getAllChurchMembers); // All members for a specific church

// General `:id` routes - PLACE THESE LAST
churchRouter.get("/:id", getChurchById); // <-- This should be lower now

// Route for getting ALL churches (no params, very general)
churchRouter.get("/", getAllChurches);

exports = churchRouter;
module.exports = churchRouter;
