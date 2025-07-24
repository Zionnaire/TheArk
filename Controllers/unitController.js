const mongoose = require('mongoose')
const logger = require('../Middlewares/logger');
const Unit = require('../Models/unit');
const User = require('../Models/user');
const Church = require('../Models/churchesAdmin')
const Chat = require('../Models/AllChats');
const Department = require('../Models/departments')
const asyncHandler = require('express-async-handler');
const { error } = require('winston');
const { v4: uuidv4 } = require('uuid');



  // User join a unit 
const joinUnit = async (req, res) => {
  const { unitId } = req.params; // Changed from id to unitId
  const { _id: userId, churchId } = req.user;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log(`[unitController] Join unit request:`, { unitId, userId, churchId, rawUnitId: req.params.unitId });

    // Validate unitId format
    if (!unitId || typeof unitId !== 'string' || !mongoose.Types.ObjectId.isValid(unitId)) {
      console.error("[unitController] Invalid unitId format:", { unitId, type: typeof unitId });
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid unit ID format" });
    }

    // Validate user
    if (!userId) {
      console.error("[unitController] Unauthorized: User not found in request");
      await session.abortTransaction();
      return res.status(401).json({ message: "Unauthorized: User not found in request" });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      console.error("[unitController] User not found:", userId);
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    // Check unit join limit
    if (user.assignedUnits.length >= 3) {
      console.warn("[unitController] User unit limit reached:", userId);
      await session.abortTransaction();
      return res.status(400).json({ message: "You can only join up to 3 units" });
    }

    // Find unit and verify church association
    const unit = await Unit.findOne({
      _id: new mongoose.Types.ObjectId(unitId),
      church: new mongoose.Types.ObjectId(churchId),
    }).session(session);
    if (!unit) {
      console.error("[unitController] Unit not found or not associated with church:", { unitId, churchId });
      await session.abortTransaction();
      return res.status(404).json({ message: "Unit not found or not associated with your church" });
    }

    // Check if user is already in the unit
    if (unit.members.some((member) => member.toString() === userId)) {
      console.warn("[unitController] User already in unit:", { userId, unitId });
      await session.abortTransaction();
      return res.status(409).json({ message: "You are already in this unit" });
    }

    // Find or create UnitChat
    let unitChat = await Chat.findOne({ unit: unitId }).session(session);
    if (!unitChat) {
      console.log("[unitController] Creating new UnitChat for unit:", unitId);
      unitChat = new Chat({
        chatId: uuidv4(),
        unit: unitId,
        members: [userId],
      });
      await unitChat.save({ session });
    } else {
      unitChat.participants = unitChat.participants || [];
      if (!unitChat.participants.some((member) => member.toString() === userId)) {
        unitChat.participants.push(userId);
        await unitChat.save({ session });
      }
    }

    // Find or create Chat
    let chat = await Chat.findOne({ chatType: "unit", unit: unitChat._id }).session(session);
    if (!chat) {
      console.log("[unitController] Creating new Chat for unit:", unitId);
      chat = new Chat({
        chatType: "unit",
        unit: unitChat._id,
        participants: [userId],
        name: `${unit.unitName} Chat`,
        description: `Chat room for ${unit.unitName}`,
        createdAt: new Date(),
        unreadCounts: [{ user: userId, count: 0 }],
      });
      await chat.save({ session });
    } else {
      if (!chat.participants.some((p) => p.toString() === userId)) {
        chat.participants.push(userId);
        chat.unreadCounts.push({ user: userId, count: 0 });
        await chat.save({ session });
      }
    }

    // Update Unit and User
    unit.members = unit.members || [];
    unit.members.push(userId);
    unit.totalMembers = unit.members.length;

    user.assignedUnits = user.assignedUnits || [];
    user.assignedUnits.push(unitId);
    user.unitChats = user.unitChats || [];
    if (!user.unitChats.some((chatId) => chatId.toString() === chat._id.toString())) {
      user.unitChats.push(chat._id);
    }

    await unit.save({ validateModifiedOnly: true, session });
    await user.save({ validateModifiedOnly: true, session });

    await session.commitTransaction();
    console.log("[unitController] User joined unit successfully:", { unitId, unitName: unit.unitName, userId });

    const populatedUnit = await Unit.findById(unitId)
      .populate("church", "churchName")
      .populate("members.userId", "name userName firstName lastName userImage")
      .lean();

    res.status(200).json({
      message: "User joined the unit successfully",
      unit: {
        _id: unit._id,
        unitName: unit.unitName,
        totalMembers: unit.totalMembers,
        members: populatedUnit.members,
        churchId: unit.church,
        churchName: populatedUnit.church?.churchName || "Unknown Church",
        unitLogo: unit.unitLogo,
        description: unit.description,
      },
      user: {
        _id: user._id,
        assignedUnits: user.assignedUnits,
        unitChats: user.unitChats,
        churchId: user.churchId,
        churchName: user.churchName,
        isEmailVerified: user.isEmailVerified,
        role: user.role,
        name: user.name,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[unitController] Join unit error:", {
      message: error.message,
      stack: error.stack,
      unitId,
      userId,
    });
    res.status(500).json({ message: "Failed to join unit", error: error.message });
  } finally {
    session.endSession();
  }
};

const leaveUnit = async (req, res) => {
  const { unitId } = req.params;
  const { _id: userId, churchId } = req.user;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log("[unitController] Leave unit request:", { unitId, userId: userId.toString(), churchId });

    // Validate unitId format
    if (!mongoose.Types.ObjectId.isValid(unitId)) {
      console.error("[unitController] Invalid unitId format:", { unitId });
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid unit ID format" });
    }

    // Validate user
    if (!userId) {
      console.error("[unitController] Unauthorized: User not found in request");
      await session.abortTransaction();
      return res.status(401).json({ message: "Unauthorized: User not found in request" });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      console.error("[unitController] User not found:", { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: "User not found" });
    }

    // Find unit and verify church association
    const unit = await Unit.findOne({
      _id: new mongoose.Types.ObjectId(unitId),
      church: new mongoose.Types.ObjectId(churchId),
    }).session(session);
    if (!unit) {
      console.error("[unitController] Unit not found or not associated with church:", { unitId, churchId });
      await session.abortTransaction();
      return res.status(404).json({ message: "Unit not found or not associated with your church" });
    }

    // Prevent unitHead from leaving
    if (unit.unitHead && unit.unitHead.toString() === userId.toString()) {
      console.warn("[unitController] UnitHead attempting to leave unit:", { userId, unitId });
      await session.abortTransaction();
      return res.status(403).json({ message: "Unit head cannot leave the unit. Contact a church admin to be removed." });
    }

    // Check if user is in the unit
    if (!unit.members.some((member) => member.toString() === userId.toString())) {
      console.warn("[unitController] User not in unit:", { userId, unitId, members: unit.members.map(id => id.toString()) });
      await session.abortTransaction();
      return res.status(400).json({ message: "You are not a member of this unit" });
    }

    // Remove user from UnitChat
    let unitChat = await Chat.findOne({ unit: unitId }).session(session);
    if (unitChat) {
      unitChat.participants = unitChat.participants.filter((participant) => participant.toString() !== userId.toString());
      await unitChat.save({ session });
    } else {
      console.warn("[unitController] No unitChat found for unit:", { unitId });
    }

    // Remove user from Chat
    let chat = await Chat.findOne({ chatType: "unit", unit: unitChat?._id }).session(session);
    if (chat) {
      chat.participants = chat.participants.filter((p) => p.toString() !== userId.toString());
      chat.unreadCounts = chat.unreadCounts.filter((uc) => uc.user.toString() !== userId.toString());
      await chat.save({ session });
    } else {
      console.warn("[unitController] No chat found for unitChat:", { unitChatId: unitChat?._id });
    }

    // Update Unit and User
    unit.members = unit.members.filter((member) => member.toString() !== userId.toString());
    unit.totalMembers = unit.members.length;

    user.assignedUnits = user.assignedUnits.filter((id) => id.toString() !== unitId);
    user.unitChats = user.unitChats.filter((chatId) => chatId.toString() !== (chat?._id?.toString() || ""));

    await unit.save({ validateModifiedOnly: true, session });
    await user.save({ validateModifiedOnly: true, session });

    await session.commitTransaction();
    console.log("[unitController] User left unit successfully:", { unitId, unitName: unit.unitName, userId });

    const populatedUnit = await Unit.findById(unitId)
      .populate("church", "churchName")
      .populate("members.userId", "name userName firstName lastName userImage")
      .lean();

    res.status(200).json({
      message: "User left the unit successfully",
      unit: {
        _id: unit._id,
        unitName: unit.unitName,
        totalMembers: unit.totalMembers,
        members: populatedUnit.members,
        churchId: unit.church,
        churchName: populatedUnit.church?.churchName || "Unknown Church",
        unitLogo: unit.unitLogo,
        description: unit.description,
      },
      user: {
        _id: user._id,
        assignedUnits: user.assignedUnits,
        unitChats: user.unitChats,
        churchId: user.churchId,
        churchName: user.churchName,
        isEmailVerified: user.isEmailVerified,
        role: user.role,
        name: user.name,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[unitController] Leave unit error:", {
      message: error.message,
      stack: error.stack,
      unitId,
      userId,
    });
    res.status(500).json({ message: "Failed to leave unit", error: error.message });
  } finally {
    session.endSession();
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
  const user = req.user;

  console.log("unitController: fetchUnit request", { unitId, churchId, userId: user._id.toString() });

  if (!mongoose.Types.ObjectId.isValid(unitId) || !churchId) {
    console.log("unitController: Invalid unit ID or church ID", { unitId, churchId });
    return res.status(400).json({ message: "Invalid unit ID or church ID" });
  }

  try {
const unit = await Unit.findOne({ _id: unitId, church: churchId })
      .populate("unitHead", "userName email")
      .populate("members", "userName email")
      .populate({
        path: "departments",
        select: "_id deptName description members chatId unit",
        populate: { path: "members", select: "userName email" },
      });

      console.log("unitController: Populated unit object before JSON response:", JSON.stringify(unit, null, 2));


    if (!unit) {
      console.log("unitController: Unit not found", { unitId, churchId });
      return res.status(404).json({ message: "Unit not found" });
    }

    console.log("unitController: Unit fetched", {
      unitId: unit._id.toString(),
      unitName: unit.unitName,
      unitHead: unit.unitHead ? unit.unitHead.userName : "No Head",
      unitLogo: unit.unitLogo,
      description: unit.description,
      departmentCount: unit.departments?.length || 0,
      departments: unit.departments?.map((d) => ({
        id: d._id.toString(),
        deptName: d.deptName,
        description: d.description,
        members: d.members?.filter(m => m && m._id).map((m) => m._id.toString()) || [],

        chatId: d.chatId?.toString(),
      })),
     members: unit.members?.filter(m => m && m._id).map((m) => m._id.toString()) || [],

      chatId: unit.chatId?.toString(),
    });

res.status(200).json({
  unit: {
    _id: unit._id.toString(),
    unitName: unit.unitName,
    description: unit.description,
    unitLogo: unit.unitLogo,
    unitHead: unit.unitHead,
    departments: unit.departments
      ?.filter(d => d != null) // Keep this filter
      .map((d) => ({
        _id: d._id.toString(),
        deptName: d.deptName,
        description: d.description,
        unit: d.unit?.toString(), // <--- ADDED OPTIONAL CHAINING HERE
        members: d.members?.filter(m => m && m._id).map((m) => m._id.toString()) || [], // This should now be fine
        chatId: d.chatId?.toString(),
      })) || [],
    chatGroups: unit.chatGroups,
    members: unit.members?.filter(m => m && m._id).map((m) => m._id.toString()) || [],
    totalMembers: unit.members?.filter(m => m && m._id).length || 0,
    chatId: unit.chatId?.toString(),
  },
});
  } catch (error) {
    console.error("unitController: Error fetching unit", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to fetch unit", error: error.message });
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
};
