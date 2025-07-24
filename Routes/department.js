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
departmentRouter.put('/update', verifyToken, updateDepartment);
departmentRouter.post("/join", verifyToken, joinDepartment);
departmentRouter.post("/leave", verifyToken, leaveDepartment);
departmentRouter.delete('/delete/:departmentId', verifyToken, deleteDepartment);
departmentRouter.get('/all', getAllDepartments);

module.exports = departmentRouter;


