const jwt = require("jsonwebtoken");
const Admin = require("../Models/admin");
const User = require("../Models/user");
const Church = require("../Models/churchesAdmin");



const signJwt = ({ user = null, church = null, role = "user" || "churchAdmin", name = "firstName" || "churchName"}) => {
  let payload = {};

  if (user) {
    payload = {
      id: user._id,           
      userId: user._id,     
      role,
      name: user[name] || user.firstName || user.churchName,
      
    };
  } else if (church) {
    payload = {
      id: church._id,
      churchId: church._id,
      role: "churchAdmin",
      name: church.churchName || church.name, 
    
    };
  } else {
    throw new Error("Either user or church must be provided to sign a token.");
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "2h",
  });
};

const verifyToken = async (req, res, next) => {
  try {
    const authorizationHeader = req.headers.authorization;

    if (
      !authorizationHeader ||
      !authorizationHeader.toLowerCase().startsWith("bearer ")
    ) {
      return res.status(400).json({ message: "Invalid authorization header" });
    }

    const token = authorizationHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log("Decoded JWT:", decoded);

    if (!decoded || !decoded.id || !decoded.role || !decoded.name) {
      return res.status(401).json({ message: "Invalid token structure" });
    }

    const { id, role, name } = decoded;

    if (role === "churchAdmin") {
      const church = await Church.findById(decoded.churchId || id);
      if (!church) {
        return res.status(404).json({ message: "Church not found" });
      }

      req.user = {
        id: church._id,
        role: "churchAdmin",
        isChurchAdmin: true,
        churchId: church._id,
        name: church.churchName || church.name,
      };

      return next();
    }

    // Default to normal user logic
    const user = await User.findById(decoded.userId || id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.user = {
      id: user._id,
      role: role || "member",
      isAdmin: false,
      isChurchAdmin: false,
      name: user[name] || user.firstName,
    
    };

    const isAdmin = await Admin.findOne({ user: user._id });
    if (isAdmin) {
      req.user.isAdmin = true;
    }

    const churchAdmin = await Church.findOne({ churchEmail: user.email });
    if (churchAdmin) {
      req.user.isChurchAdmin = true;
      req.user.churchId = churchAdmin._id;
      req.user.role = "churchAdmin";
      req.user.name = churchAdmin.churchName || churchAdmin.name;
    }

    return next();

  } catch (error) {
    console.error("Error verifying token:", error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token has expired" });
    }
    return res.status(401).json({ message: "Invalid token" });
  }
};

const signRefreshToken = ({ id }) => {
  return jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d", 
  });
};


module.exports = {
  signJwt,
  verifyToken,
  signRefreshToken,
};
