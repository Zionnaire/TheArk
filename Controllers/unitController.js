
const logger = require('../Middlewares/logger');
const Unit = require('../Models/unit');
const User = require('../Models/user');
const asyncHandler = require('express-async-handler');



  // User join a unit 
const joinUnit = async (req, res) => {
  try {
    const unitId = req.params.id || req.body.unitId;
    if (!unitId) {
      return res.status(400).json({ message: 'Unit ID is required' });
    }

    const unit = await Unit.findById(unitId);
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }

        console.log('req.user:', req.user);

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized: User not found in request' });
    }


    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.assignedUnits.length >= 3) {
      return res.status(400).json({ message: "You can only be in up to 3 units" });
    }

    if (user.assignedUnits.includes(unitId)) {
      return res.status(409).json({ message: "Already in this unit" });
    }

    user.assignedUnits.push(unitId);
    await user.save({ validateModifiedOnly: true });
    unit.members.push({ userId: user._id, name: `${user.firstName} ${user.lastName}` });
    // unit member count should be updated
    unit.totalMembers = unit.members.length;
    await unit.save({ validateModifiedOnly: true });

    return res.status(200).json({ message: "User joined the unit successfully", unit });
  } catch (error) {
    logger.error("Error joining unit:", error);
    console.error("Error joining unit:", error);
    res.status(500).json({ message: error.message });
  }
};


  const requestToJoinUnit = asyncHandler(async (req, res) => {
    const { unitId } = req.body;
    const user = req.user;
    const unit = await Unit.findById(unitId);
  
    if (!unit) return res.status(404).json({ message: "Unit not found" });
  
    // Check if already requested
    const alreadyRequested = unit.pendingRequests.find(
      (u) => u.userId.toString() === user._id.toString()
    );
    if (alreadyRequested) {
      return res.status(400).json({ message: "You have already requested to join this unit" });
    }
  
    unit.pendingRequests.push({ userId: user._id, name: `${user.firstName} ${user.lastName}` });
    await unit.save();
    res.status(200).json({ message: "Join request sent" });
  });

  // Controller to approve a user (only by unitHead)
const approveUnitMember = asyncHandler(async (req, res) => {
  const { unitId, userId } = req.body;
  const currentUser = req.user;

  const unit = await Unit.findById(unitId);
  if (!unit) return res.status(404).json({ message: "Unit not found" });

  // Ensure only unit head can approve
  if (unit.unitHead.toString() !== currentUser._id.toString()) {
    return res.status(403).json({ message: "Only the unit head can approve requests" });
  }

  // Check if request exists
  const requestIndex = unit.pendingRequests.findIndex(
    (u) => u.userId.toString() === userId
  );
  if (requestIndex === -1) {
    return res.status(400).json({ message: "No pending request from this user" });
  }

  // Move user to members list
  const approvedUser = unit.pendingRequests[requestIndex];
  unit.members.push(approvedUser);
  unit.pendingRequests.splice(requestIndex, 1);
  unit.totalMembers = unit.members.length;

  await unit.save();

  res.status(200).json({ message: "User approved and added to unit" });
});
  
    // User leave a unit
const leaveUnit = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const unitId = req.params.id;

    if (!user) return res.status(404).json({ message: "User not found" });

    user.assignedUnits = user.assignedUnits.filter(
      (uid) => uid.toString() !== unitId
    );

    await user.save({ validateModifiedOnly: true });
    // Update unit member count
    const unit = await Unit.findById(unitId);
    if (!unit) return res.status(404).json({ message: "Unit not found" });  
    unit.members = unit.members.filter(
      (member) => member.userId.toString() !== user._id.toString()
    );
    unit.totalMembers = unit.members.length;
    await unit.save({ validateModifiedOnly: true });
    
    return res.status(200).json({ message: "Successfully left unit" });
  } catch (err) {
    console.error("Leave unit error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


// Get all members of a unit
const getUnitMembers = async (req, res) => {
    try {
      const unitId = req.params.id;
      const unit = await Unit.findById(unitId);
      if (!unit) {
        return res.status(404).json({ message: "Unit not found" });
      }
      const members = await User.find({ assignedUnit: unitId });
      res.status(200).json(members);

} catch (error) {
    logger.error("Error fetching unit members:", error);
  console.error("Error fetching unit members:", error);
  res.status(500).json({ message: error.message });
}
}


// @desc    Add unit members
// @route   PATCH /api/units/:unitId/add-member
// @access  Private (only unitHead)
const addUnitMember = asyncHandler(async (req, res) => {
  const { unitId } = req.params;
  const userId = req.user._id;

  const unit = await Unit.findById(unitId);
  if (!unit) {
    res.status(404);
    throw new Error("Unit not found");
  }

  // Ensure requester is unitHead
  if (unit.unitHead.toString() !== userId.toString()) {
    res.status(403);
    throw new Error("Only the unit head can add members");
  }

  // Ensure member exists
  const member = await User.findById(userId);
  if (!member) {
    res.status(404);
    throw new Error("User to add not found");
  }

  // Check if already in unit
  if (unit.members.includes(userId)) {
    res.status(400);
    throw new Error("User is already a member of this unit");
  }

  // Optional: Check if member already belongs to 2 units
  const memberUnits = await Unit.find({ members: userId });
  if (memberUnits.length >= 3) {
    res.status(400);
    throw new Error("User already belongs to 3 units");
  }

  // Add member to unit
  unit.members.push(userId);
  await unit.save();

  // Update user's unitId
  user.assignedUnits.push(unitId);
  await user.save();
  

  res.status(200).json({
    message: "User added to unit successfully",
    unit,
  });
});

// @desc    Get all units
// @route   GET /api/units
// @access  Public
const getUnits = asyncHandler(async (req, res) => {
    const units = await Unit.find({});
    res.status(200).json(units);
});

// @desc    Get single unit
// @route   GET /api/units/:id
// @access  Public
const getUnit = asyncHandler(async (req, res) => {
    const unit = await Unit.findById(req.params.id);
    if (unit) {
        res.status(200).json(unit);
    } else {
        res.status(404);
        throw new Error('Unit not found');
    }
});

// @desc    Create unit
// @route   POST /api/units
// @access  Private/Admin
const createUnit = asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    const unit = await Unit.create({
        name,
        description
    });
    res.status(201).json(unit);
});

// @desc    Update unit
// @route   PUT /api/units/:id
// @access  Private/Admin
const updateUnit = asyncHandler(async (req, res) => {
  const unitId = req.params.id;
  const userId = req.user._id;

  const unit = await Unit.findById(unitId);
  if (!unit) {
    res.status(404);
    throw new Error("Unit not found");
  }

  const user = await User.findById(userId);

  const isAuthorizedUnitHead =
    user &&
    user.isUnitHead &&
    user.assignedUnits.some(
      (assignedUnitId) => assignedUnitId.toString() === unitId.toString()
    );

  if (!isAuthorizedUnitHead) {
    res.status(403);
    throw new Error("Not authorized to edit this unit");
  }

  // 🔄 Update fields
  unit.name = req.body.name || unit.name;
  unit.description = req.body.description || unit.description;

  // if (req.body.unitLogo) {
  //   unit.unitLogo = {
  //     url: req.body.unitLogo.url || unit.unitLogo?.url,
  //     cld_id: req.body.unitLogo.cld_id || unit.unitLogo?.cld_id,
  //   };
  // }

     // Handle churchLogo file upload
      if (req.files && req.files.unitLogo) {
        const file = req.files.unitLogo;
        const base64Image = `data:${file.mimetype};base64,${file.data.toString("base64")}`;
  
        if (unit.unitLogo?.[0]?.cld_id) {
          await cloudinary.uploader.destroy(unit.unitLogo[0].cld_id);
        }
  
        const result = await uploadToCloudinary(base64Image, "unit-logos/");
        unit.unitLogo = [{ url: result.secure_url, cld_id: result.public_id }];
      } else if (req.body.clearUnitLogo === 'true') {
        if (unit.unitLogo?.[0]?.cld_id) {
          await cloudinary.uploader.destroy(unit.unitLogo[0].cld_id);
        }
        unit.unitLogo = [];
      }

  const updatedUnit = await unit.save();
  res.status(200).json(updatedUnit);
});

// @desc    Delete unit
// @route   DELETE /api/units/:id
// @access  Private/Admin
const deleteUnit = asyncHandler(async (req, res) => {
    const unit = await Unit.findById(req.params.id);
    if (unit) {
        await unit.remove();
        res.status(200).json({ message: 'Unit removed' });
    } else {
        res.status(404);
        throw new Error('Unit not found');
    }
});

// Remove unit member
// @desc    Remove a unit member
// @route   PATCH /api/units/:unitId/remove-member
// @access  Private (only unitHead)
const removeUnitMember = asyncHandler(async (req, res) => {
  const { unitId } = req.params;
  const { memberId } = req.body;

  const unit = await Unit.findById(unitId);
  if (!unit) {
    return res.status(404).json({ message: "Unit not found" });
  }

  // Ensure the request is from the unit head
  if (unit.unitHead.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Only the unit head can remove members" });
  }

  // Check if the member exists
  const member = await User.findById(memberId);
  if (!member) {
    return res.status(404).json({ message: "User not found" });
  }

  // Check if the member actually belongs to this unit
  const isInUnit = member.assignedUnits.includes(unitId);
  if (!isInUnit) {
    return res.status(400).json({ message: "User is not a member of this unit" });
  }

  // Remove member from unit.unitMembers (if applicable)
  unit.unitMembers = unit.unitMembers.filter(
    (id) => id.toString() !== memberId.toString()
  );
  await unit.save();

  // Remove unit from member.assignedUnits
  member.assignedUnits = member.assignedUnits.filter(
    (id) => id.toString() !== unitId
  );
  await member.save();

  res.status(200).json({ message: "Member removed from unit successfully" });
});


module.exports = {
    getUnits,
    getUnit,
    createUnit,
    updateUnit,
    deleteUnit,
    joinUnit,
    leaveUnit,
    getUnitMembers,
    addUnitMember,
    removeUnitMember,
    requestToJoinUnit,
    approveUnitMember
};
