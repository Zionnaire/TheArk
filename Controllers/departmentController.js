const logger = require("../Middlewares/logger");
const Department = require("../Models/departments");
const Unit = require("../Models/unit")
const User = require('../Models/user')

// Create a new department
const createDepartment = async (req, res) => {
  const { name, description, unitId } = req.body;
  const user = req.user;

  if (!name || !unitId) {
    console.error("departmentController: Name and unitId are required", { unitId, name });
    return res.status(400).json({ message: "Name and unitId are required" });
  }

  const unit = await Unit.findById(unitId);
  if (!unit) {
    console.error("departmentController: Unit not found", { unitId });
    return res.status(404).json({ message: "Unit not found" });
  }

  if (user.role !== "unitHead" || unit.unitHead.toString() !== user._id.toString()) {
    console.error("departmentController: Unauthorized to create department", { userId: user._id, unitId });
    return res.status(403).json({ message: "Only unit head can create department" });
  }

  const department = new Department({
    name,
    description,
    unit: unitId,
    members: [],
  });

  await department.save();

  unit.departments.push(department._id);
  await unit.save();

  // console.log("departmentController: Department created", { departmentId: department._id, unitId });

  res.status(201).json({
    message: "Department created successfully",
    department,
  });
};

const updateDepartment = async (req, res) => {
  const { departmentId } = req.params;
  const { name, description, unitId } = req.body;
  const user = req.user;

  if (!name || !unitId) {
    console.error("departmentController: Name and unitId are required", { departmentId, unitId, name });
    return res.status(400).json({ message: "Name and unitId are required" });
  }

  const unit = await Unit.findById(unitId);
  if (!unit) {
    console.error("departmentController: Unit not found", { unitId });
    return res.status(404).json({ message: "Unit not found" });
  }

  if (user.role !== "unitHead" || unit.unitHead.toString() !== user._id.toString()) {
    console.error("departmentController: Unauthorized to edit department", { userId: user._id, unitId });
    return res.status(403).json({ message: "Only unit head can edit department" });
  }

  const department = await Department.findById(departmentId);
  if (!department) {
    console.error("departmentController: Department not found", { departmentId });
    return res.status(404).json({ message: "Department not found" });
  }

  if (department.unit.toString() !== unitId) {
    console.error("departmentController: Department does not belong to unit", { departmentId, unitId });
    return res.status(403).json({ message: "Department does not belong to this unit" });
  }

  department.name = name;
  department.description = description;
  await department.save();

  res.status(200).json({
    message: "Department updated successfully",
    department,
  });
};

const joinDepartment = async (req, res) => {
  const { departmentId } = req.params;
  const user = req.user;

  const department = await Department.findById(departmentId);
  if (!department) {
    console.error("departmentController: Department not found", { departmentId });
    return res.status(404).json({ message: "Department not found" });
  }

  const unit = await Unit.findById(department.unit);
  if (!unit) {
    console.error("departmentController: Unit not found", { unitId: department.unit });
    return res.status(404).json({ message: "Unit not found" });
  }

  if (!unit.members.includes(user._id)) {
    console.error("departmentController: User not a member of unit", { userId: user._id, unitId: department.unit });
    return res.status(403).json({ message: "You must be a unit member to join this department" });
  }

  if (department.members.includes(user._id)) {
    console.error("departmentController: User already in department", { userId: user._id, departmentId });
    return res.status(400).json({ message: "You are already a member of this department" });
  }

  department.members.push(user._id);
  await department.save();

  await User.findByIdAndUpdate(user._id, { $addToSet: { departments: departmentId } });

  // console.log("departmentController: User joined department", { departmentId, userId: user._id });

  res.status(200).json({
    message: "Joined department successfully",
    department,
  });
};

const leaveDepartment = async (req, res) => {
  const { departmentId } = req.params;
  const user = req.user;

  // console.log("departmentController: leaveDepartment", { departmentId, userId: user._id });

  const department = await Department.findById(departmentId);
  if (!department) {
    console.error("departmentController: Department not found", { departmentId });
    return res.status(404).json({ message: "Department not found" });
  }

  if (!department.members.includes(user._id)) {
    console.error("departmentController: User not in department", { userId: user._id, departmentId });
    return res.status(400).json({ message: "You are not a member of this department" });
  }

  department.members = department.members.filter((id) => id.toString() !== user._id.toString());
  await department.save();

  await User.findByIdAndUpdate(user._id, { $pull: { departments: departmentId } });

  // console.log("departmentController: User left department", { departmentId, userId: user._id });

  res.status(200).json({
    message: "Left department successfully",
    department,
  });
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
