const jwt = require("jsonwebtoken");
const Admin = require("../Models/admin");
const User = require("../Models/user");
const Church = require("../Models/churchesAdmin");

/**
 * Signs a JSON Web Token for a user or church admin.
 * @param {object} options - Options for signing the JWT.
 * @param {object} [options.user] - The user Mongoose document.
 * @param {object} [options.church] - The church Mongoose document.
 * @param {string} [options.role] - The role to assign ('member', 'unitHead', or 'churchAdmin').
 * @returns {string} The signed JWT.
 * @throws {Error} If neither user nor church is provided.
 */
const signJwt = ({ user = null, church = null, role }) => {
  let payload = {};
  let resolvedRole = role;

  if (user) {
    if (!role) resolvedRole = user.isUnitHead ? "unitHead" : "member";
    payload = {
      id: user._id,
      userId: user._id,
      churchId: user.churchId?.toString(),
      role: resolvedRole,
      isUnitHead: user.isUnitHead || false,
      name: user.userName || user.firstName || user.lastName || "User",
      assignedUnits: user.assignedUnits ? user.assignedUnits.map(String) : [],
    };
  } else if (church) {
    if (!role) resolvedRole = "churchAdmin";
    payload = {
      id: church._id,
      churchId: church._id,
      role: resolvedRole,
      name: church.churchName || church.name || "Church Admin",
    };
  } else {
    throw new Error("Either user or church must be provided to sign a token.");
  }

  console.log("==> signJwt called with:", { userId: user?._id, churchId: church?._id, role: resolvedRole });

  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not defined in environment variables!");
    throw new Error("Server configuration error: JWT_SECRET missing.");
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "2h",
  });
};

/**
 * Middleware to verify JWT token and populate req.user with authenticated entity data.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
const verifyToken = async (req, res, next) => {
  try {
    const Header = req.headers.authorization;
    console.log("[verifyToken Middleware] Request Path:", req.path, "Method:", req.method);
    console.log("[verifyToken Middleware] Incoming Authorization Header:", Header);

    if (!Header || !Header.toLowerCase().startsWith("bearer ")) {
      console.warn("[verifyToken Middleware] Missing or malformed Authorization header.", { Header });
      return res.status(401).json({ message: "Authentication failed: Missing or malformed header" });
    }

    const token = Header.split(" ")[1];
    if (!token) {
      console.warn("[verifyToken Middleware] Token is empty after splitting 'Bearer'.");
      return res.status(401).json({ message: 'Authentication failed: Token not found' });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not defined in environment variables!");
      return res.status(500).json({ message: "Server configuration error: JWT_SECRET missing." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("[verifyToken Middleware] Token successfully decoded:", decoded);

    const { id, role, userId, churchId, isUnitHead } = decoded;

    if (!id || !role) {
      console.warn("[verifyToken Middleware] Invalid token structure: missing ID or role.", decoded);
      return res.status(401).json({ message: "Authentication failed: Invalid token payload structure (missing ID or role)" });
    }

    const resolveName = (obj) => {
      if (!obj) return "Unknown";
      if (obj.churchName) return obj.churchName;
      if (obj.name) return obj.name;
      if (obj.firstName) return obj.firstName;
      if (obj.userName) return obj.userName;
      return "User";
    };

    let populatedEntity;
    let isAdmin = false;
    let isChurchAdmin = false;
    let assignedRole = role;
    let resolvedIsUnitHead = isUnitHead || false;
    let churchRefId = null;

    if (role === "churchAdmin") {
      populatedEntity = await Church.findById(churchId || id);
      if (!populatedEntity) {
        console.warn(`[verifyToken Middleware] Church (ID: ${churchId || id}) not found for churchAdmin role.`);
        return res.status(404).json({ message: "Authentication failed: Church admin account not found" });
      }
      isChurchAdmin = true;
      churchRefId = populatedEntity._id;
    } else {
      populatedEntity = await User.findById(userId || id)
        .populate('unitChats')
        .populate('departmentChats')
        .populate('generalChats')
        .populate('privateChats');

      if (!populatedEntity) {
        console.warn(`[verifyToken Middleware] User (ID: ${userId || id}) not found for role: ${role}.`);
        return res.status(404).json({ message: "Authentication failed: User account not found" });
      }

      const [foundAdmin, foundChurchAdmin] = await Promise.all([
        Admin.findOne({ user: populatedEntity._id }).lean(),
        Church.findOne({ churchEmail: populatedEntity.email }).lean(),
      ]);

      if (foundAdmin) {
        isAdmin = true;
      }
      if (foundChurchAdmin) {
        isChurchAdmin = true;
        churchRefId = foundChurchAdmin._id;
        if (assignedRole === 'member') {
          assignedRole = 'churchAdmin';
        }
      }
      // Override role and isUnitHead from User document if available
      assignedRole = populatedEntity.isUnitHead ? "unitHead" : populatedEntity.role || assignedRole;
      resolvedIsUnitHead = populatedEntity.isUnitHead || resolvedIsUnitHead;
    }

    if (!churchRefId && churchId) {
      churchRefId = churchId;
    }
    console.log("🧩 Final resolved churchId before req.user assignment:", churchRefId);

    req.user = {
      _id: populatedEntity._id.toString(),
      id: populatedEntity._id.toString(),
      role: assignedRole,
      isAdmin: isAdmin,
      isChurchAdmin: isChurchAdmin,
      isUnitHead: resolvedIsUnitHead,
      name: resolveName(populatedEntity),
      churchId: churchRefId ? churchRefId.toString() : null,
      assignedUnits: role === "churchAdmin" ? [] : (populatedEntity.assignedUnits?.map(String) || []),
      userId: (role !== "churchAdmin" && populatedEntity._id) ? populatedEntity._id.toString() : undefined,
      unitChats: populatedEntity.unitChats ? populatedEntity.unitChats.map(chat => ({
        id: chat._id.toString(),
        name: chat.unitName || "Unnamed Unit",
      })) : [],
      departmentChats: populatedEntity.departmentChats ? populatedEntity.departmentChats.map(chat => ({
        id: chat._id.toString(),
        name: chat.departmentName || "Unnamed Dept",
      })) : [],
      generalChatIds: populatedEntity.generalChats ? populatedEntity.generalChats.map(chat => chat._id.toString()) : [],
      privateChatIds: populatedEntity.privateChats ? populatedEntity.privateChats.map(chat => chat._id.toString()) : [],
    };

    console.log("[verifyToken Middleware] req.user populated successfully:", req.user);

    next();
  } catch (error) {
    console.error("Error verifying token:", error);
    let errorMessage = "Authentication failed: Invalid token";
    if (error.name === "TokenExpiredError") {
      errorMessage = "Authentication failed: Token has expired";
    } else if (error.name === "JsonWebTokenError") {
      errorMessage = "Authentication failed: Invalid token signature or format";
    }
    return res.status(401).json({ message: errorMessage });
  }
};

const signRefreshToken = ({ _id }) => {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    console.error("REFRESH_TOKEN_SECRET is not defined in environment variables!");
    throw new Error("Server configuration error: REFRESH_TOKEN_SECRET missing.");
  }
  return jwt.sign({ _id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
};

module.exports = {
  signJwt,
  verifyToken,
  signRefreshToken,
};