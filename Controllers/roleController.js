const Role = require('../Models/role');
const asyncHandler = require('express-async-handler');


// @desc    Create role
// @route   POST /api/roles
// @access  Private/Admin
const createRole = asyncHandler(async (req, res) => {
    // Ensure user is authenticated
    if (!req.user) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    // Check if user is an Admin
    if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden: Only Admins can create roles" });
    }

    const { name, permissions } = req.body;

    // Check if the role already exists
    const roleExists = await Role.findOne({ name });
    if (roleExists) {
        return res.status(400).json({ message: "Role already exists" });
    }

    // Create new role
    const role = await Role.create({
        name,
        permissions,
        roleId: req.user.roleId,
    });

    if (role) {
        res.status(201).json(role);
    } else {
        res.status(400).json({ message: "Invalid role data" });
    }
});

// @desc    Get all roles
// @route   GET /api/roles
// @access  Private/Admin
const getAllRoles = asyncHandler(async (req, res) => {
    const roles = await Role.find({});
    res.json(roles);
});

// @desc    Get role by ID
// @route   GET /api/roles/:id
// @access  Private/Admin
const getRoleById = asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (role) {
        res.json(role);
    } else {
        res.status(404);
        throw new Error('Role not found');
    }
});

// @desc    Update role
// @route   PUT /api/roles/:id
// @access  Private/Admin
const updateRole = asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);

    if (role) {
        role.name = req.body.name || role.name;
        role.permissions = req.body.permissions || role.permissions;

        const updatedRole = await role.save();
        res.json(updatedRole);
    } else {
        res.status(404);
        throw new Error('Role not found');
    }
});

// @desc    Delete role
// @route   DELETE /api/roles/:id
// @access  Private/Admin
const deleteRole = asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);

    if (role) {
        await role.remove();
        res.json({ message: 'Role removed' });
    } else {
        res.status(404);
        throw new Error('Role not found');
    }
});

module.exports = {
    getAllRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole
};

