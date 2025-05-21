const express = require("express");
const { verifyToken } = require("../Middlewares/jwt");

const {
  createUnitHead,
  getAllUnitHeads,
  getUnitHeadById,
 
} = require("../Controllers/unitHeadController");
const unitHeadRouter = express.Router();

unitHeadRouter.post("/create", verifyToken, createUnitHead);
unitHeadRouter.get("/all", getAllUnitHeads);
unitHeadRouter.get("/:id", getUnitHeadById);

module.exports = unitHeadRouter;