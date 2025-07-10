const express = require('express');
const {verifyToken} = require('../Middlewares/jwt');
const {
    createDepartment,
    updateDepartment,
    deleteDepartment,
    getAllDepartments,
    joinDepartment,
    leaveDepartment
} = require('../Controllers/departmentController');
const departmentRouter = express.Router();

departmentRouter.post('/create', verifyToken, createDepartment);
departmentRouter.put('/update/:id', verifyToken, updateDepartment);
departmentRouter.post("/:departmentId/join", verifyToken, joinDepartment);
departmentRouter.post("/:departmentId/leave", verifyToken, leaveDepartment);
departmentRouter.delete('/delete/:id', verifyToken, deleteDepartment);
departmentRouter.get('/all', getAllDepartments);

module.exports = departmentRouter;


