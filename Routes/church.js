const express = require("express");
const churchRouter = express.Router();

const {
  registerChurch,
  loginChurch,
  getChurchById,
  getAllChurches,
  updateChurch,
  logoutChurch,
   createUnit,
      getAllUnits,
      getUnitById,
      updateUnit,
      assignUnitHead,
      removeUnitHead,
      getAllUnitMembers,
      getAllChurchMembers
} = require("../Controllers/churchController");

const { verifyToken } = require("../Middlewares/jwt");
// Specific routes first
churchRouter.post("/register", registerChurch);
churchRouter.post("/login", loginChurch);
churchRouter.get("/logout", verifyToken, logoutChurch);
churchRouter.post("/units", verifyToken, createUnit);
churchRouter.put("/units/:unitId/assignhead", verifyToken, assignUnitHead);
churchRouter.put("/:id/units/:unitId/removeHead", verifyToken, removeUnitHead);

// Routes with multiple parameters (specific first)
churchRouter.get("/:id/units/:unitId/members", getAllUnitMembers);
churchRouter.get("/:id/units/:unitId", getUnitById);
churchRouter.put("/:id/units/:unitId", verifyToken, updateUnit);
churchRouter.get("/:id/units", getAllUnits);
churchRouter.get("/:id/members", getAllChurchMembers);

// General `:id` routes LAST
churchRouter.get("/", getAllChurches);
churchRouter.get("/:id", getChurchById);
churchRouter.put("/:id", verifyToken, updateChurch);

exports = churchRouter;
module.exports = churchRouter;
