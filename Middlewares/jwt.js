const jwt = require('jsonwebtoken');
const Admin = require('../Models/admin');
const User = require('../Models/user');
const Church = require('../Models/churchesAdmin');
const Department = require('../Models/departments');

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
    resolvedRole = user.isUnitHead ? 'unitHead' : (user.role || 'member');
    payload = {
      _id: user._id.toString(), // Changed from 'id' to '_id' to match verifyToken
      userId: user._id.toString(),
      churchId: user.churchId?.toString(),
      role: resolvedRole,
      isUnitHead: user.isUnitHead || false,
      name: user.userName || user.firstName || user.lastName || 'User',
      assignedUnits: user.assignedUnits ? user.assignedUnits.map(String) : [],
    };
  } else if (church) {
    resolvedRole = 'churchAdmin';
    payload = {
      _id: church._id.toString(), // Changed from 'id' to '_id' to match verifyToken
      churchId: church._id.toString(),
      role: resolvedRole,
      name: church.churchName || church.name || 'Church Admin',
    };
  } else {
    throw new Error('Either user or church must be provided to sign a token.');
  }

  console.log('==> signJwt called with:', { userId: user?._id, churchId: church?._id, role: resolvedRole });

  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not defined in environment variables!');
    throw new Error('Server configuration error: JWT_SECRET missing.');
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '3d',
  });
};

const signRefreshToken = ({ _id, role }) => {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    console.error('REFRESH_TOKEN_SECRET is not defined in environment variables!');
    throw new Error('Server configuration error: REFRESH_TOKEN_SECRET missing.');
  }
  return jwt.sign({ _id, role }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: '7d',
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
    const header = req.headers.authorization;
    console.log('[verifyToken Middleware] Request Path:', req.path, 'Method:', req.method);
    console.log('[verifyToken Middleware] Incoming Authorization Header:', header);

    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      console.warn('[verifyToken Middleware] Missing or malformed Authorization header.', { header });
      return res.status(401).json({ message: 'Authentication failed: Missing or malformed header' });
    }

    const token = header.split(' ')[1];
    if (!token) {
      console.warn('[verifyToken Middleware] Token is empty after splitting "Bearer".');
      return res.status(401).json({ message: 'Authentication failed: Token not found' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined in environment variables!');
      return res.status(500).json({ message: 'Server configuration error: JWT_SECRET missing.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[verifyToken Middleware] Token successfully decoded:', decoded);

    const { _id, role, userId, churchId, isUnitHead, name } = decoded;

    if (!_id || !role) {
      console.warn('[verifyToken Middleware] Invalid token structure: missing _id or role.', decoded);
      return res.status(401).json({ message: 'Authentication failed: Invalid token payload structure (missing _id or role)' });
    }

    const resolveName = (obj, tokenName) => {
      if (!obj) return tokenName || 'Unknown';
      return obj.userName || obj.firstName || obj.lastName || obj.churchName || obj.name || tokenName || 'Unknown';
    };

    let populatedEntity;
    let assignedRole = role;
    let resolvedIsUnitHead = isUnitHead || false;
    let resolvedName = name;
    let churchRefId = churchId;
    let isChurchAdmin = false;
    let isAdmin = false;
    let email = null;
    let churchEmail = null;

    if (role === 'churchAdmin') {
      populatedEntity = await Church.findById(_id).lean();
      if (!populatedEntity) {
        console.warn(`[verifyToken Middleware] Church (ID: ${_id}) not found for churchAdmin role.`);
        return res.status(404).json({ message: 'Authentication failed: Church admin account not found' });
      }
      isChurchAdmin = true;
      churchRefId = populatedEntity._id.toString();
      resolvedName = resolveName(populatedEntity, name);
      churchEmail = populatedEntity.churchEmail || null;
      email = populatedEntity.churchEmail || null;
    } else {
      populatedEntity = await User.findById(_id).lean();
      if (!populatedEntity) {
        console.warn(`[verifyToken Middleware] User (ID: ${_id}) not found for role: ${role}.`);
        return res.status(404).json({ message: 'Authentication failed: User account not found' });
      }
      assignedRole = populatedEntity.isUnitHead ? 'unitHead' : (populatedEntity.role || 'member');
      resolvedIsUnitHead = populatedEntity.isUnitHead || false;
      churchRefId = populatedEntity.churchId?.toString() || null;
      resolvedName = resolveName(populatedEntity, name);
      email = populatedEntity.email || null;
    }

    isAdmin = await Admin.exists({ user: populatedEntity._id });

    req.user = {
      _id: populatedEntity._id.toString(),
      id: populatedEntity._id.toString(),
      userId: populatedEntity._id.toString(),
      role: assignedRole,
      isAdmin: !!isAdmin,
      isChurchAdmin,
      isUnitHead: resolvedIsUnitHead,
      name: resolvedName,
      churchId: churchRefId,
      email,
      churchEmail,
      assignedUnits: (populatedEntity.assignedUnits?.map(String) || []),
      departments: (populatedEntity.departments?.map(String) || []),
      departmentChats: populatedEntity.departmentChats
        ? await Promise.all(
            populatedEntity.departmentChats.map(async (chatId) => {
              const department = await Department.findOne({ chatId }).lean();
              return {
                id: chatId.toString(),
                deptName: department ? department.deptName : 'Unnamed Dept',
                deptLogo: department ? department.deptLogo : [],
              };
            })
          )
        : [],
      unitChats: (populatedEntity.unitChats?.map(String) || []),
      generalChatIds: (populatedEntity.generalChats?.map(String) || []),
      privateChatIds: (populatedEntity.privateChats?.map(String) || []),
    };

    console.log('[verifyToken Middleware] req.user populated successfully:', req.user);

    next();
  } catch (error) {
    console.error('[verifyToken Middleware] Error verifying token:', error);
    let errorMessage = 'Authentication failed: Invalid token';
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Authentication failed: Token has expired';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Authentication failed: Invalid token signature or format';
    }
    return res.status(401).json({ message: errorMessage });
  }
};

module.exports = {
  signJwt,
  verifyToken,
  signRefreshToken,
};