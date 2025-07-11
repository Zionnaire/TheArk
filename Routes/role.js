
const express = require('express');
const roleRouter = express.Router();

const {
    getAllRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole
} = require('../Controllers/roleController');

const {verifyToken} = require('../Middlewares/jwt');

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