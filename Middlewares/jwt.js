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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(400).json({ message: "Invalid authorization header" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { id, role } = decoded;
    if (!id || !role) {
      return res.status(401).json({ message: "Invalid token structure" });
    }

    const resolveName = (obj) => obj.churchName || obj.name || obj.firstName || "User";

    // For churchAdmin
    if (role === "churchAdmin") {
      const church = await Church.findById(decoded.churchId || id);
      if (!church) {
        return res.status(404).json({ message: "Church not found" });
      }

      req.user = {
        id: church._id,
        churchId: church._id,
        role: "churchAdmin",
        isChurchAdmin: true,
        name: resolveName(church),
      };

      return next();
    }

    // For normal user
 const user = await User.findById(decoded.userId || id)
  .populate('unitChats', 'unitName')
  .populate('departmentChats', 'departmentName')
  .populate('generalChats', 'name')
  .populate('privateChats', 'sender receiver'); // Or whatever fields you need
  


    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }


      // Check if user is also an Admin or ChurchAdmin
    const [admin, churchAdmin] = await Promise.all([
      Admin.findOne({ user: user._id }).lean(),
      Church.findOne({ churchEmail: user.email }).lean(),
    ]);

    const firstUnitChat = Array.isArray(user.unitChats) && user.unitChats.length > 0
      ? user.unitChats[0]
      : null;

    const firstDepartmentChat = Array.isArray(user.departmentChats) && user.departmentChats.length > 0
      ? user.departmentChats[0]
      : null;

req.user = {
  id: user._id,
  role: role || "member",
  isAdmin: !!admin,
  isChurchAdmin: !!churchAdmin,
  name: resolveName(user),
  churchId: churchAdmin?._id || null,

  unitChats: user.unitChats.map(chat => ({
    id: chat._id,
    name: chat.unitName || "Unnamed Unit",
  })),

  departmentChats: user.departmentChats.map(chat => ({
    id: chat._id,
    name: chat.departmentName || "Unnamed Dept",
  })),

  generalChatIds: user.generalChats.map(chat => chat._id),
  privateChatIds: user.privateChats.map(chat => chat._id),
};

  

    if (admin) {
      req.user.isAdmin = true;
    }

    if (churchAdmin) {
      req.user.isChurchAdmin = true;
      req.user.churchId = churchAdmin._id;
      req.user.role = "churchAdmin"; // Update role context
      req.user.name = resolveName(churchAdmin);
    }

    next();

  } catch (error) {
    console.error("Error verifying token:", error);
    return res.status(401).json({
      message: error.name === "TokenExpiredError" ? "Token has expired" : "Invalid token",
    });
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
