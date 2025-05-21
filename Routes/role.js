
const express = require('express');

const {
    getAllRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole
} = require('../Controllers/roleController');
// const { authenticateToken } = require('../Middlewares/authAccess');
const {verifyToken} = require('../Middlewares/jwt');
const roleRouter = express.Router();

// Get all roles
roleRouter.get('/', verifyToken, getAllRoles);

// Get role by ID
roleRouter.get('/:id',verifyToken, getRoleById);

// Create new role
roleRouter.post('/', verifyToken, createRole);

// Update role
roleRouter.put('/:id', verifyToken,  updateRole);

// Delete role
roleRouter.delete('/:id', verifyToken, deleteRole);

module.exports = roleRouter;