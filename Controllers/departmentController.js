const mongoose = require("mongoose");
const logger = require("../Middlewares/logger");
const Department = require("../Models/departments");
const Unit = require("../Models/unit")
const User = require('../Models/user')
const Chat = require('../Models/AllChats');
// const {DepartmentChat} = require('../Models/chat');
const { v4: uuidv4 } = require('uuid');

// Create a new department
const createDepartment = async (req, res) => {
  const { deptName, description, unitId } = req.body;
  const user = req.user;

  console.log("departmentController: createDepartment request", {
    userId: user?._id.toString(),
    deptName,
    description,
    unitId,
  });

  // Validate input
  if (!deptName || !unitId) {
    console.log("departmentController: Missing required fields", { deptName, unitId });
    return res.status(400).json({ success: false, message: "Department name and unit ID are required" });
  }

  if (!mongoose.Types.ObjectId.isValid(unitId)) {
    console.log("departmentController: Invalid unit ID", { unitId });
    return res.status(400).json({ success: false, message: "Invalid unit ID" });
  }

  // Start transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify unit exists and belongs to user's church
    const unit = await Unit.findOne({ _id: unitId, church: user.churchId })
      .populate("unitHead")
      .session(session);
    if (!unit) {
      console.log("departmentController: Unit not found", { unitId, churchId: user.churchId });
      throw new Error("Unit not found");
    }

    // Check if user is the unit head
    const unitHeadId = unit.unitHead?._id
      ? unit.unitHead._id.toString()
      : mongoose.Types.ObjectId.isValid(unit.unitHead)
      ? unit.unitHead.toString()
      : null;

    if (!unitHeadId || unitHeadId !== user._id.toString()) {
      console.log("departmentController: Authorization failed", {
        unitHeadId,
        userId: user._id.toString(),
        isUnitHead: user.isUnitHead,
        assignedUnits: user.assignedUnits,
      });
      throw new Error("Only unit heads can create departments");
    }

    // Create department
    const department = new Department({
      deptName,
      description: description || "No description provided",
      unit: unitId,
      church: user.churchId,
      members: [user._id],
      createdBy: user._id,
    });
    await department.save({ session });

    // Create chat
    const newChat = new Chat({
      chatType: "department",
      participants: [user._id],
      department: department._id,
      unit: unitId,
      church: user.churchId,
      name: `${deptName} Chat`,
      description: `Chat room for ${deptName}`,
      createdAt: new Date(),
      unreadCounts: [{ user: user._id, count: 0 }],
    });
    await newChat.save({ session });

    // Update department with chatId
    department.chatId = newChat._id;
    await department.save({ session });

    // Update unit with department
    unit.departments = unit.departments || [];
    unit.departments.push(department._id);
    await unit.save({ session });

    // Update user's departmentChats
    await User.findByIdAndUpdate(
      user._id,
      { $addToSet: { departmentChats: newChat._id } },
      { session }
    );

    // Commit transaction
    await session.commitTransaction();

    // Fetch updated department for response
    const updatedDepartment = await Department.findById(department._id)
      .populate("unit", "_id unitName")
      .populate("chatId", "_id")
      .lean();

    console.log("departmentController: Department created", {
      departmentId: department._id.toString(),
      deptName: department.deptName,
      chatId: newChat._id.toString(),
    });

    return res.status(201).json({
      success: true,
      message: "Department created successfully",
      department: {
        _id: updatedDepartment._id.toString(),
        deptName: updatedDepartment.deptName,
        description: updatedDepartment.description,
        unit: updatedDepartment.unit._id.toString(),
        unitName: updatedDepartment.unit.unitName,
        members: updatedDepartment.members.map((m) => m.toString()),
        chatId: updatedDepartment.chatId?._id.toString(),
      },
    });
  } catch (error) {
    // Only abort if transaction is active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("departmentController: Error creating department", {
      message: error.message,
      stack: error.stack,
      unitId,
      deptName,
    });
    return res.status(error.message === "Unit not found" ? 404 : error.message === "Only unit heads can create departments" ? 403 : 500).json({
      success: false,
      message: error.message || "Failed to create department",
    });
  } finally {
    session.endSession();
  }
};

const joinDepartment = async (req, res) => {
  const { departmentId } = req.body;
  const user = req.user;

  console.log("departmentController: joinDepartment request", {
    userId: user?._id.toString(),
    departmentId,
  });

  if (!departmentId) {
    console.log("departmentController: Missing department ID", { departmentId });
    return res.status(400).json({ message: "Department ID is required" });
  }

  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    console.log("departmentController: Invalid department ID", { departmentId });
    return res.status(400).json({ message: "Invalid department ID" });
  }

  const department = await Department.findOne({ _id: departmentId, unit: { $in: user.assignedUnits } })
    .populate("unit");

  if (!department) {
    console.log("departmentController: Department not found or user not in unit", {
      departmentId,
      userAssignedUnits: user.assignedUnits,
    });
    return res.status(404).json({ message: "Department not found or user not authorized for this unit" });
  }

  if (department.members.includes(user._id)) {
    console.log("departmentController: User already in department", {
      userId: user._id.toString(),
      departmentId,
    });
    return res.status(400).json({ message: "User is already a member of this department" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Add user to department members
    department.members.push(user._id);
    await department.save({ session });

    // Add user to department chat participants
    if (department.chatId) {
      await Chat.updateOne(
        { _id: department.chatId },
        {
          $addToSet: { participants: user._id },
          $set: { [`unreadCounts.${user._id}`]: { user: user._id, count: 0 } },
        },
        { session }
      );
    }

    await session.commitTransaction();

    console.log("departmentController: User joined department", {
      userId: user._id.toString(),
      departmentId,
      chatId: department.chatId?.toString(),
    });

    res.status(200).json({
      message: "Joined department successfully",
      department: {
        _id: department._id.toString(),
        deptName: department.deptName,
        description: department.description,
        unit: department.unit._id.toString(),
        members: department.members.map((m) => m.toString()),
        chatId: department.chatId?.toString(),
      },
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("departmentController: Error joining department", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to join department", error: error.message });
  } finally {
    session.endSession();
  }
};

const leaveDepartment = async (req, res) => {
  const { departmentId } = req.body;
  const user = req.user;

  console.log("departmentController: leaveDepartment request", {
    userId: user?._id.toString(),
    departmentId,
  });

  if (!departmentId) {
    console.log("departmentController: Missing department ID", { departmentId });
    return res.status(400).json({ message: "Department ID is required" });
  }

  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    console.log("departmentController: Invalid department ID", { departmentId });
    return res.status(400).json({ message: "Invalid department ID" });
  }

  const department = await Department.findOne({ _id: departmentId, unit: { $in: user.assignedUnits } })
    .populate("unit");

  if (!department) {
    console.log("departmentController: Department not found or user not in unit", {
      departmentId,
      userAssignedUnits: user.assignedUnits,
    });
    return res.status(404).json({ message: "Department not found or user not authorized for this unit" });
  }

  if (!department.members.includes(user._id)) {
    console.log("departmentController: User not in department", {
      userId: user._id.toString(),
      departmentId,
    });
    return res.status(400).json({ message: "User is not a member of this department" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Remove user from department members
    department.members = department.members.filter((memberId) => !memberId.equals(user._id));
    await department.save({ session });

    // Remove user from department chat participants
    if (department.chatId) {
      await Chat.updateOne(
        { _id: department.chatId },
        {
          $pull: { participants: user._id },
          $unset: { [`unreadCounts.${user._id}`]: "" },
        },
        { session }
      );
    }

    await session.commitTransaction();

    console.log("departmentController: User left department", {
      userId: user._id.toString(),
      departmentId,
      chatId: department.chatId?.toString(),
    });

    res.status(200).json({
      message: "Left department successfully",
      department: {
        _id: department._id.toString(),
        deptName: department.deptName,
        description: department.description,
        unit: department.unit._id.toString(),
        members: department.members.map((m) => m.toString()),
        chatId: department.chatId?.toString(),
      },
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("departmentController: Error leaving department", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to leave department", error: error.message });
  } finally {
    session.endSession();
  }
};

const updateDepartment = async (req, res) => {
  const { departmentId, deptName, description, unitId } = req.body;
  const user = req.user;

  console.log("departmentController: editDepartment request", {
    departmentId,
    userId: user._id.toString(),
    deptName,
    unitId,
    isUnitHead: user.isUnitHead,
    assignedUnits: user.assignedUnits,
  });

  if (!departmentId || !mongoose.Types.ObjectId.isValid(departmentId)) {
    console.log("departmentController: Invalid department ID", { departmentId });
    return res.status(400).json({ message: "Invalid department ID" });
  }

  if (!deptName || !unitId || !mongoose.Types.ObjectId.isValid(unitId)) {
    console.log("departmentController: Missing or invalid required fields", { deptName, unitId });
    return res.status(400).json({ message: "Department name and unit ID are required" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const department = await Department.findById(departmentId).session(session);
    if (!department) {
      console.log("departmentController: Department not found", { departmentId });
      return res.status(404).json({ message: "Department not found" });
    }

    const unit = await Unit.findOne({ _id: unitId, church: user.churchId }).populate("unitHead").session(session);
    if (!unit) {
      console.log("departmentController: Unit not found", { unitId, churchId: user.churchId });
      return res.status(404).json({ message: "Unit not found" });
    }

    console.log("departmentController: Unit details", {
      unitId: unit._id.toString(),
      unitHead: unit.unitHead ? unit.unitHead._id.toString() : null,
      userId: user._id.toString(),
    });

    if (!user.isUnitHead || !unit.unitHead || unit.unitHead._id.toString() !== user._id.toString()) {
      console.log("departmentController: Unauthorized to edit department", {
        userId: user._id.toString(),
        unitId: unit._id.toString(),
        isUnitHead: user.isUnitHead,
        unitHeadId: unit.unitHead ? unit.unitHead._id.toString() : null,
      });
      return res.status(403).json({ message: "Only unit head can edit department" });
    }

    await Department.updateOne(
      { _id: departmentId },
      { $set: { deptName, description, unit: unitId, updatedAt: new Date() } },
      { session }
    );

    await session.commitTransaction();

    const updatedDepartment = await Department.findById(departmentId)
      .populate("unit", "_id")
      .lean();

    console.log("departmentController: Department updated", {
      departmentId: updatedDepartment._id.toString(),
      deptName: updatedDepartment.deptName,
      unitId: updatedDepartment.unit._id.toString(),
    });

    res.status(200).json({
      message: "Department updated successfully",
      department: {
        _id: updatedDepartment._id.toString(),
        deptName: updatedDepartment.deptName,
        description: updatedDepartment.description,
        unit: updatedDepartment.unit._id.toString(),
        members: updatedDepartment.members.map((m) => m.toString()),
        chatId: updatedDepartment.chatId?.toString(),
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("departmentController: Error updating department", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: "Failed to update department", error: error.message });
  } finally {
    session.endSession();
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const { id: departmentId } = req.params;
    const { unitId } = req.body;
    const { _id: userId, role } = req.user;


    if (role !== "unitHead") {
      console.error("departmentController: Unauthorized attempt", { userId, role });
      return res.status(403).json({ message: "Only unit heads can delete departments" });
    }

    if (!unitId) {
      console.error("departmentController: Unit ID is required", { userId });
      return res.status(400).json({ message: "Unit ID is required" });
    }

    const unit = await Unit.findById(unitId);
    if (!unit) {
      console.error("departmentController: Unit not found", { unitId });
      return res.status(404).json({ message: "Unit not found", unitId });
    }

    if (unit.unitHead._id.toString() !== userId.toString()) {
      console.error("departmentController: User is not the unit head", { userId, unitHeadId: unit.unitHead._id });
      return res.status(403).json({ message: "You are not the unit head of this unit" });
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      console.error("departmentController: Department not found", { departmentId });
      return res.status(404).json({ message: "Department not found", departmentId });
    }

    if (department.unit.toString() !== unitId) {
      console.error("departmentController: Department does not belong to this unit", { departmentId, unitId });
      return res.status(400).json({ message: "Department does not belong to this unit" });
    }

    await department.deleteOne();
    unit.departments = unit.departments.filter((depId) => depId.toString() !== departmentId);
    await unit.save();

    // console.log("departmentController: Department deleted", { departmentId, unitId });

    res.status(200).json({ message: "Department deleted successfully" });
  } catch (error) {
    logger.error("departmentController: Error deleting department:", error);
    console.error("departmentController: Error deleting department:", error);
    res.status(500).json({ message: error.message });
  }
};

const getAllDepartments = async (req, res) => {
  try {
    const { unitId } = req.query;

    if (!unitId) {
      console.error("departmentController: Unit ID is required");
      return res.status(400).json({ message: "Unit ID is required" });
    }

    const departments = await Department.find({ unit: unitId }).lean();
    res.status(200).json(departments);
  } catch (error) {
    logger.error("departmentController: Error fetching departments:", error);
    console.error("departmentController: Error fetching departments:", error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { createDepartment, updateDepartment, joinDepartment, leaveDepartment, deleteDepartment, getAllDepartments };
