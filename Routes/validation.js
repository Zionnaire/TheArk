const express = require("express");
const validationRouter = express.Router();
const {verifyToken} = require("../Middlewares/jwt");
const {validateToken} = require("../Controllers/validationController") 

validationRouter.get("/validate-token", verifyToken, validateToken)

module.exports = validationRouter;