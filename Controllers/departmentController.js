const logger = require("../Middlewares/logger");
const Department = require("../Models/departments");

// Create a new department
const createDepartment = async (req, res) => {
    try {
        const { name, description } = req.body;

        // Only Admin or unit head can create departments
        if (req.user.role !== "admin" && req.user.role !== "unitHead") {
            return res.status(403).json({ message: "Only admins and unit heads can create departments" });
        }

        // Check if department already exists
        const existingDepartment = await Department.findOne({ name });
        if (existingDepartment) {
            return res.status(400).json({ message: "Department already exists" });
        }

        const department = new Department({ name, description });
        await department.save();

        res.status(201).json(department);
    } catch (error) {
        logger.error("Error creating department:", error);
        console.error("Error creating department:", error);
        res.status(500).json({ message: error.message });
    }
};

// Update a department

const updateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({ message: "Department not found" });
        } 
        department.name = name;
        department.description = description;
        await department.save();
        res.status(200).json(department);
    }
    catch (error) {
        logger.error("Error updating department:", error);
        console.error("Error updating department:", error);
        res.status(500).json({ message: error.message });
    }
}

// Delete a department
const deleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const department = await Department.findById(id);
        if (!department) {
            return res.status(404).json({ message: "Department not found" });
            await department.remove();
            res.status(200).json({ message: "Department deleted successfully" });
        }
    }
        catch (error) {
            logger.error("Error deleting department:", error);
            console.error("Error deleting department:", error);
            res.status(500).json({ message: error.message });
        }
    }

// Get all departments
const getAllDepartments = async (req, res) => {
    try {
        const departments = await Department.find();
        res.status(200).json(departments);
    } catch (error) {
        console.error("Error fetching departments:", error);
        res.status(500).json({ message: error.message });
    }
};


module.exports = { createDepartment, getAllDepartments, updateDepartment, deleteDepartment };
