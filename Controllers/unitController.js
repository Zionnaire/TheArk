const mongoose = require('mongoose')
const logger = require('../Middlewares/logger');
const Unit = require('../Models/unit');
const User = require('../Models/user');
const Church = require('../Models/churchesAdmin')
const Department = require('../Models/departments')
const asyncHandler = require('express-async-handler');
const { error } = require('winston');



  // User join a unit 
const joinUnit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const unitId = req.params.id;
    if (!unitId || !mongoose.Types.ObjectId.isValid(unitId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Valid Unit ID is required" });
    }

    const unit = await Unit.findById(unitId).session(session);
    if (!unit) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Unit not found" });
    }

    if (!req.user || !req.user._id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: "Unauthorized: User not found in request" });
    }

    const user = await User.findById(req.user._id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    if (user.assignedUnits.length >= 3) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "You can only join up to 3 units" });
    }

    if (user.assignedUnits.includes(unitId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({ message: "You are already in this unit" });
    }

    user.assignedUnits.push(unitId);
    unit.members = unit.members || []; // Initialize if undefined
    unit.members.push(user._id); // Push ObjectId directly
    unit.totalMembers = unit.members.length;

    await user.save({ validateModifiedOnly: true, session });
    await unit.save({ validateModifiedOnly: true, session });

    await session.commitTransaction();

    logger.info(`User ${user._id} successfully joined unit ${unitId}`);
    return res.status(200).json({
      message: "User joined the unit successfully",
      unit: {
        _id: unit._id,
        unitName: unit.unitName,
        totalMembers: unit.totalMembers,
        members: unit.members,
      },
      user: { assignedUnits: user.assignedUnits },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error joining unit (userId: ${req.user?._id}, unitId: ${req.params.id}):`, error);
    return res.status(500).json({ message: "Failed to join unit. Please try again." });
  } finally {
    session.endSession();
  }
}

    // User leave a unit
const leaveUnit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const unitId = req.params.id;
    if (!unitId || !mongoose.Types.ObjectId.isValid(unitId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Valid Unit ID is required" });
    }

    if (!req.user || !req.user._id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: "Unauthorized: User not found in request" });
    }

    const user = await User.findById(req.user._id).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.assignedUnits.includes(unitId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "You are not a member of this unit" });
    }

    const unit = await Unit.findById(unitId).session(session);
    if (!unit) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Unit not found" });
    }

    unit.members = unit.members || []; // Initialize if undefined
    unit.members = unit.members.filter((member) => member.toString() !== user._id.toString());
    unit.totalMembers = unit.members.length;

    user.assignedUnits = user.assignedUnits.filter((uid) => uid.toString() !== unitId);

    await user.save({ validateModifiedOnly: true, session });
    await unit.save({ validateModifiedOnly: true, session });

    await session.commitTransaction();

    logger.info(`User ${user._id} successfully left unit ${unitId}`);
    return res.status(200).json({
      message: "Successfully left unit",
      unit: {
        _id: unit._id,
        unitName: unit.unitName,
        totalMembers: unit.totalMembers,
        members: unit.members,
      },
      user: { assignedUnits: user.assignedUnits },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error leaving unit (userId: ${req.user?._id}, unitId: ${req.params.id}):`, error);
    return res.status(500).json({ message: "Failed to leave unit. Please try again." });
  } finally {
    session.endSession();
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

// @desc    Get all units
// @route   GET /api/units
// @access  Public
// Get all units for a church with pagination
const getAllUnits = asyncHandler(async (req, res) => {
  const { churchId, page = 1, limit = 10 } = req.query;
  if (!churchId) {
    return res.status(400).json({ success: false, message: "Church ID is required" });
  }

  try {
    console.log("Server: Fetching units for churchId:", churchId, { page, limit });
    const church = await Church.findById(churchId).populate({
      path: "units",
      populate: { path: "unitHead", select: "userName email" },
    });
    if (!church) {
      return res.status(404).json({ success: false, message: "Church not found" });
    }

    const units = church.units || [];
    const total = units.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedUnits = units.slice(startIndex, startIndex + parseInt(limit));

    console.log("Server: Units fetched:", {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      units: paginatedUnits.map((u) => ({
        unitName: u.unitName,
        unitLogo: u.unitLogo,
        hasLogo: !!u.unitLogo?.length,
        logoUrl: u.unitLogo?.[0]?.url || "No URL",
        logoUri: u.unitLogo?.[0]?.uri || u.unitLogo?.[0]?.url || "No URI",
        unitHead: u.unitHead,
      })),
    });

    res.status(200).json({
      success: true,
      units: paginatedUnits.map((unit) => ({
        _id: unit._id,
        unitName: unit.unitName,
        description: unit.description,
        unitHead: unit.unitHead
          ? {
              _id: unit.unitHead._id,
              userName: unit.unitHead.userName || "",
              email: unit.unitHead.email || "",
            }
          : undefined,
        totalMembers: unit.members?.length || 0,
        members: unit.members,
        unitLogo: Array.isArray(unit.unitLogo)
          ? unit.unitLogo.map((img) => ({
              url: img.url || "",
              uri: img.uri || img.url || "", // Ensure uri is always set
              cld_id: img.cld_id || "default",
              type: img.type || "image",
            }))
          : unit.unitLogo && typeof unit.unitLogo === "object" && "url" in unit.unitLogo
          ? [
              {
                url: unit.unitLogo.url || "",
                uri: unit.unitLogo.uri || unit.unitLogo.url || "", // Ensure uri is always set
                cld_id: unit.unitLogo.cld_id || "default",
                type: img.type || "image",
              },
            ]
          : [],
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Server: Error fetching units:", error);
    res.status(500).json({ success: false, message: "Server error while fetching units" });
  }
});

// Get single unit by ID
const getUnit = async (req, res) => {
  const { unitId } = req.params;
  const { churchId } = req.query;
  if (!unitId || !churchId) {
    console.error("unitController: Missing unitId or churchId", { unitId, churchId });
    return res.status(400).json({ success: false, message: "Unit ID and Church ID are required" });
  }

  try {
    // console.log("Server: Fetching unit:", { unitId, churchId });
    const unit = await Unit.findById(unitId)
      .populate("unitHead", "userName email")
      .populate({
        path: "departments",
        select: "name description unit members",
        populate: { path: "members", select: "_id" },
      })
      .populate("members", "_id");

    if (!unit) {
      console.error("unitController: Unit not found", { unitId, churchId });
      return res.status(404).json({ success: false, message: "Unit not found" });
    }

    // console.log("Server: Unit churchId check:", {
    //   unitChurchId: unit.church.toString(),
    //   requestChurchId: churchId.toString(),
    // });
    if (unit.church.toString() !== churchId.toString()) {
      return res.status(400).json({ success: false, message: "Unit does not belong to the specified church" });
    }

    // Debug departments and members
    const departmentIds = unit.departments.map((d) => d._id.toString());
    // console.log("Server: Department IDs in unit:", { departmentIds });
    const departmentsExist = await Department.find({ _id: { $in: departmentIds } });
    // console.log("Server: Departments exist in DB:", {
    //   departmentCount: departmentsExist.length,
    //   departmentIds: departmentsExist.map((d) => d._id.toString()),
    // });

    const response = {
      success: true,
      unit: {
        _id: unit._id.toString(),
        unitName: unit.unitName,
        description: unit.description,
        unitHead: unit.unitHead
          ? {
              _id: unit.unitHead._id.toString(),
              userName: unit.unitHead.userName || "",
              email: unit.unitHead.email || "",
            }
          : undefined,
        totalMembers: unit.members?.length || 0,
        members: unit.members ? unit.members.map((m) => m._id.toString()) : [],
        unitLogo: Array.isArray(unit.unitLogo)
          ? unit.unitLogo.map((img) => ({
              url: img.url || "",
              uri: img.uri || img.url || "",
              cld_id: img.cld_id || "default",
              type: img.type || "image",
            }))
          : [],
        departments: unit.departments
          ? unit.departments.map((d) => ({
              _id: d._id.toString(),
              name: d.name,
              description: d.description,
              unit: d.unit.toString(),
              members: d.members ? d.members.map((m) => m._id.toString()) : [],
            }))
          : [],
        church: unit.church.toString(),
        isActive: unit.isActive,
      },
    };

    // console.log("Server: Unit response:", {
    //   unitName: response.unit.unitName,
    //   members: response.unit.members,
    //   departments: response.unit.departments,
    // });

    res.status(200).json(response);
  } catch (error) {
    console.error("Server: Error fetching unit:", error);
    res.status(500).json({ success: false, message: "Server error while fetching unit" });
  }
};

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
    getAllUnits,
    getUnit,
    joinUnit,
    leaveUnit,
    getUnitMembers,
    removeUnitMember,
    requestToJoinUnit,
    approveUnitMember
};
