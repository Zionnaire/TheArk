const express = require('express');

const { verifyAndRegister } = require('../Controllers/verifyRegister');
const { churchVerifyAndRegister } = require('../Controllers/verifyRegister'); 
const { verifyToken } = require('../Middlewares/jwt'); // Ensure authentication     
const verifyRegisterRouter = express.Router();

// Verify and register user
verifyRegisterRouter.post('/verifyEmail', verifyToken, verifyAndRegister);
// Verify and register church
verifyRegisterRouter.post('/verifyChurchEmail', verifyToken, churchVerifyAndRegister);


module.exports = verifyRegisterRouter;