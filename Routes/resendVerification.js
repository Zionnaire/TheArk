const express = require('express');

const { resendVerificationCode, resendChurchVerificationCode } = require('../Controllers/resendVerification');
const { verifyToken } = require('../Middlewares/jwt'); // Ensure authentication
const resendVerificationRouter = express.Router();

// Resend verification code
resendVerificationRouter.post('/', verifyToken, resendVerificationCode);
resendVerificationRouter.post('/churchAdmin', verifyToken, resendChurchVerificationCode);  

module.exports = resendVerificationRouter;