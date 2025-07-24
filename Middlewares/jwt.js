const jwt = require("jsonwebtoken");
const Admin = require("../Models/admin");
const User = require("../Models/user");
const Church = require("../Models/churchesAdmin");
const Department = require("../Models/departments");

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
    resolvedRole = user.isUnitHead ? "unitHead" : (user.role || "member");
    payload = {
      id: user._id.toString(),
      userId: user._id.toString(),
      churchId: user.churchId?.toString(),
      role: resolvedRole,
      isUnitHead: user.isUnitHead || false,
      name: user.userName || user.firstName || user.lastName || "User",
      assignedUnits: user.assignedUnits ? user.assignedUnits.map(String) : [],
    };
  } else if (church) {
    resolvedRole = "churchAdmin";
    payload = {
      id: church._id.toString(),
      churchId: church._id.toString(),
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
    expiresIn: "7d",
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
      return res.status(401).json({ message: "Authentication failed: Token not found" });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not defined in environment variables!");
      return res.status(500).json({ message: "Server configuration error: JWT_SECRET missing." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("[verifyToken Middleware] Token successfully decoded:", decoded);

    const { id, role, userId, churchId, isUnitHead, name } = decoded;

    if (!id || !role) {
      console.warn("[verifyToken Middleware] Invalid token structure: missing ID or role.", decoded);
      return res.status(401).json({ message: "Authentication failed: Invalid token payload structure (missing ID or role)" });
    }

    const resolveName = (obj, tokenName) => {
      if (!obj) return tokenName || "Unknown";
      return obj.userName || obj.firstName || obj.lastName || obj.churchName || obj.name || tokenName || "Unknown";
    };

    let populatedEntity;
    let isAdmin = false;
    let isChurchAdmin = false;
    let assignedRole = role;
    let resolvedIsUnitHead = isUnitHead || false;
    let resolvedName = name;
    let churchRefId = churchId;

    if (role === "churchAdmin") {
      populatedEntity = await Church.findById(churchId || id).lean();
      if (!populatedEntity) {
        console.warn(`[verifyToken Middleware] Church (ID: ${churchId || id}) not found for churchAdmin role.`);
        return res.status(404).json({ message: "Authentication failed: Church admin account not found" });
      }
      isChurchAdmin = true;
      churchRefId = populatedEntity._id.toString();
      resolvedName = resolveName(populatedEntity, name);
    } else {
      populatedEntity = await User.findById(userId || id).lean();
      if (!populatedEntity) {
        console.warn(`[verifyToken Middleware] User (ID: ${userId || id}) not found for role: ${role}.`);
        return res.status(404).json({ message: "Authentication failed: User account not found" });
      }

      const [foundAdmin, foundChurchAdmin] = await Promise.all([
        Admin.findOne({ user: populatedEntity._id }).lean(),
        Church.findOne({ churchEmail: populatedEntity.email }).lean(),
      ]);

      isAdmin = !!foundAdmin;
      isChurchAdmin = !!foundChurchAdmin;
      if (foundChurchAdmin) {
        churchRefId = foundChurchAdmin._id.toString();
        assignedRole = "churchAdmin";
      } else {
        assignedRole = populatedEntity.isUnitHead ? "unitHead" : populatedEntity.role || role;
      }
      resolvedIsUnitHead = populatedEntity.isUnitHead || isUnitHead;
      resolvedName = resolveName(populatedEntity, name);
    }

    console.log("🧩 Final resolved churchId before req.user assignment:", churchRefId);

    req.user = {
      _id: populatedEntity._id.toString(),
      id: populatedEntity._id.toString(),
      userId: role !== "churchAdmin" ? populatedEntity._id.toString() : undefined,
      role: assignedRole,
      isAdmin,
      isChurchAdmin,
      isUnitHead: resolvedIsUnitHead,
      name: resolvedName,
      churchId: churchRefId,
      assignedUnits: role === "churchAdmin" ? [] : (populatedEntity.assignedUnits?.map(String) || []),
      departments: role !== "churchAdmin" ? (populatedEntity.departments?.map(String) || []) : [],
      departmentChats: role !== "churchAdmin" && populatedEntity.departmentChats
        ? await Promise.all(
            populatedEntity.departmentChats.map(async (chatId) => {
              const department = await Department.findOne({ chatId }).lean();
              return {
                id: chatId.toString(),
                deptName: department ? department.deptName : "Unnamed Dept",
              };
            })
          )
        : [],
      unitChats: role !== "churchAdmin" ? (populatedEntity.unitChats?.map(String) || []) : [],
      generalChatIds: role !== "churchAdmin" ? (populatedEntity.generalChats?.map(String) || []) : [],
      privateChatIds: role !== "churchAdmin" ? (populatedEntity.privateChats?.map(String) || []) : [],
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