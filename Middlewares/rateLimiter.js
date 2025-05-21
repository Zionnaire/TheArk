const rateLimit = require("express-rate-limit");

const commentRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // Max 5 comments per minute
    message: { message: "Too many comments, please wait a minute!" },
});

module.exports = commentRateLimiter;
