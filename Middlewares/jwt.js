const jwt = require("jsonwebtoken");
const Admin = require("../Models/admin"); // Assuming this path is correct
const User = require("../Models/user");   // Assuming this path is correct
const Church = require("../Models/churchesAdmin"); // Assuming this path is correct

/**
 * Signs a JSON Web Token for a user or church admin.
 * @param {object} options - Options for signing the JWT.
 * @param {object} [options.user] - The user Mongoose document.
 * @param {object} [options.church] - The church Mongoose document.
 * @param {string} [options.role] - The role to assign ('member' or 'churchAdmin').
 * @returns {string} The signed JWT.
 * @throws {Error} If neither user nor church is provided.
 */
const signJwt = ({ user = null, church = null, role }) => {
  let payload = {};
  let resolvedRole = role; // Use provided role first

  if (user) {
    if (!role) resolvedRole = "member"; 
   payload = {
  id: user._id,
  userId: user._id,
  churchId: user.churchId?.toString(),
  role: resolvedRole,
  name: user.userName || user.firstName || user.lastName || "User",
};

  } else if (church) {
    if (!role) resolvedRole = "churchAdmin"; // Default to 'churchAdmin' if no role provided for church
    payload = {
      id: church._id, // Use _id as the primary ID in the token
      churchId: church._id, // Explicitly keep churchId for clarity if desired by frontend
      role: resolvedRole,
      name: church.churchName || church.name || "Church Admin", // Prioritize churchName, then name, then fallback
    };
  } else {
    throw new Error("Either user or church must be provided to sign a token.");
  }
// console.log("==> signJwt called with:", { user, church, role });


  // Ensure JWT_SECRET is loaded from environment variables
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not defined in environment variables!");
    throw new Error("Server configuration error: JWT_SECRET missing.");
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "2h", // Token expiry
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
    // console.log(`[verifyToken Middleware] Request Path: ${req.path}, Method: ${req.method}`); // Added path/method logging
    // console.log("[verifyToken Middleware] Incoming Authorization Header:", Header); // Debug log

    if (!Header || !Header.toLowerCase().startsWith("bearer ")) {
      console.warn("[verifyToken Middleware] Missing or malformed Authorization header.", { Header }); // More detailed warning
      return res.status(401).json({ message: "Authentication failed: Missing or malformed header" });
    }

    const token = Header.split(" ")[1];
    if (!token) {
        console.warn("[verifyToken Middleware] Token is empty after splitting 'Bearer'.");
        return res.status(401).json({ message: 'Authentication failed: Token not found' });
    }

    // Ensure JWT_SECRET is loaded from environment variables
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not defined in environment variables!");
      return res.status(500).json({ message: "Server configuration error: JWT_SECRET missing." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
  // console.log("[verifyToken Middleware] Token successfully decoded:", decoded); // Keep this debug log

    // Extract primary ID and role from decoded token payload
    const { id, role, userId, churchId } = decoded;

    if (!id || !role) {
      console.warn("[verifyToken Middleware] Invalid token structure: missing ID or role.", decoded); // More detailed warning
      return res.status(401).json({ message: "Authentication failed: Invalid token payload structure (missing ID or role)" });
    }

    // Helper to resolve name from a user/church object
    const resolveName = (obj) => {
      if (!obj) return "Unknown";
      if (obj.churchName) return obj.churchName;
      if (obj.name) return obj.name; // For generic 'name' field
      if (obj.firstName) return obj.firstName;
      if (obj.userName) return obj.userName;
      return "User"; // Fallback
    };

    let populatedEntity;
    let isAdmin = false;
    let isChurchAdmin = false;
    let assignedRole = role; // Start with the role from the token
    let churchRefId = null;

    // Handle churchAdmin role
    if (role === "churchAdmin") {
      populatedEntity = await Church.findById(churchId || id);
      if (!populatedEntity) {
        console.warn(`[verifyToken Middleware] Church (ID: ${churchId || id}) not found for churchAdmin role.`); // More detailed warning
        return res.status(404).json({ message: "Authentication failed: Church admin account not found" });
      }
      isChurchAdmin = true;
      churchRefId = populatedEntity._id; // Ensure churchId is the actual _id
    } else { // Handle 'member' or other user roles
      populatedEntity = await User.findById(userId || id)
        .populate('unitChats')
        .populate('departmentChats')
        .populate('generalChats')
        .populate('privateChats');

      if (!populatedEntity) {
        console.warn(`[verifyToken Middleware] User (ID: ${userId || id}) not found for role: ${role}.`); // More detailed warning
        return res.status(404).json({ message: "Authentication failed: User account not found" });
      }

      // Check if this user is also an Admin or ChurchAdmin based on their email/ID
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
    }

    // If no church admin match found, fallback to token churchId
if (!churchRefId && churchId) {
  churchRefId = churchId;
}
console.log("🧩 Final resolved churchId before req.user assignment:", churchRefId);


    // Construct req.user object based on the populated entity and resolved roles
    req.user = {
      _id: populatedEntity._id.toString(), // Ensure _id is present for validateToken controller
      id: populatedEntity._id.toString(), // Keep 'id' for consistency if other parts use it
      role: assignedRole,
      isAdmin: isAdmin,
      isChurchAdmin: isChurchAdmin,
      name: resolveName(populatedEntity),
      churchId: churchRefId ? churchRefId.toString() : null,
      userId: (role !== "churchAdmin" && populatedEntity._id) ? populatedEntity._id.toString() : undefined, // userId if it's a user
      unitChats: populatedEntity.unitChats ? populatedEntity.unitChats.map(chat => ({
        id: chat._id.toString(),
        name: chat.unitName || "Unnamed Unit",
      })) : [],
      departmentChats: populatedEntity.departmentChats ? populatedEntity.departmentChats.map(chat => ({ // FIXED: populatedId -> populatedEntity
        id: chat._id.toString(),
        name: chat.departmentName || "Unnamed Dept",
      })) : [],
      generalChatIds: populatedEntity.generalChats ? populatedEntity.generalChats.map(chat => chat._id.toString()) : [],
      privateChatIds: populatedEntity.privateChats ? populatedEntity.privateChats.map(chat => chat._id.toString()) : [],
    };

    // console.log("[verifyToken Middleware] req.user populated successfully:", req.user); // Debug log

    next(); // Proceed to the next middleware or controller
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

const signRefreshToken = ({_id }) => {
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
