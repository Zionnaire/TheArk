const express = require('express');

const {
    joinUnit,
    leaveUnit,
    getUnits,
    getUnit,
    getUnitMembers,
    createUnit,
    getUnitMember,
    addUnitMember,
    removeUnitMember,
    approveUnitMember,
    requestToJoinUnit
    
} = require('../Controllers/unitController');

const {verifyToken} = require('../Middlewares/jwt');

const unitRouter = express.Router();

// Route to create a new unit
unitRouter.post('/', verifyToken, createUnit);

unitRouter.post('/request', requestToJoinUnit)
unitRouter.put('/approveRequest', verifyToken, approveUnitMember)
// Route to join a unit
unitRouter.post('/join/:id', verifyToken, joinUnit);
// Route to leave a unit    
unitRouter.post('/leave/:id', verifyToken, leaveUnit);
// Route to get all units
unitRouter.get('/', getUnits);
// Route to get a single unit
unitRouter.get('/:id', verifyToken, getUnit);
// Route to get unit members
unitRouter.get('/:id/members', getUnitMembers);

// Route to add a unit member
unitRouter.post('/:id/members', verifyToken, addUnitMember);

//Route to remove a unit member
unitRouter.delete('/:id/members/:memberId', verifyToken, removeUnitMember);

// Route to get unit chats
// unitRouter.get('/:id/chats', verifyToken, getUnitChats);
// Route to send a unit message
// unitRouter.post('/:id/messages', verifyToken, sendUnitMessage);

module.exports = unitRouter;

