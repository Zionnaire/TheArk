const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const token = req.header("Authorization");
  
  if (!token) {
    return res.status(401).json({ message: "Access Denied: No Token Provided" });
  }

  try {
    const verified = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
    req.user = verified; // Attach user data to `req.user`
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid Token" });
  }
}



// Middleware to check if the user is an Admin
function isAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
      next(); // User is an Admin, proceed to the next middleware or route handler
    } else {
      res.status(403).json({ message: 'Unauthorized access' });
    }
  }
  
  // Middleware to check if the user is a church admin
  function isChurchAdmin(req, res, next) {
    if (req.user || req.church.role === 'churchAdmin') {
      next(); // User is a church admin, proceed to the next middleware or route handler
    } else {
      res.status(403).json({ message: 'Unauthorized access' });
    }
  }


  // Middleware to check if the user is a unit Head
  function isUnitHead(req, res, next) {
    if (req.user && req.user.role === 'unitHead') {
      next(); // User is a SuperAdmin, proceed to the next middleware or route handler
    } else {
      res.status(403).json({ message: 'Unauthorized access' });
    }
  }

  module.exports = {
    isUnitHead,
    isAdmin,
    authenticateToken,
    isChurchAdmin,
  };
  