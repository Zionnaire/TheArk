const UnitHead = require("../Models/unitHeads");
const Unit = require("../Models/unit");

const createUnitHead = async (req, res) => {
  try {
    const { name, email, password, assignedUnit } = req.body;

    // Only admins can create unit heads
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admins can create unit heads" });
    }

    // Check if unit head already exists
    const existingUnitHead = await UnitHead.findOne({ role: "unitHead" });
    if (existingUnitHead) {
      return res.status(400).json({ message: "A Unit Head already exists" });
    }

    // Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const unitHead = new UnitHead({
      name,
      email,
      password: hashedPassword,
      assignedUnit,
    });

    await unitHead.save();
    res.status(201).json({ message: "Unit Head created successfully" });
  } catch (error) {
    console.error("Error creating unit head:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get all unit heads
const getAllUnitHeads = async (req, res) => {
  try {
    const unitHeads = await UnitHead.find();
    res.status(200).json(unitHeads);
  } catch (error) {
    console.error("Error fetching unit heads:", error);
    res.status(500).json({ message: error.message });
  } 
  };

  // Get a single unit head

  const getUnitHeadById = async (req, res) => {
    try {
      const unitHead = await UnitHead.findById(req.params.id);
      if (!unitHead) {
        return res.status(404).json({ message: "Unit Head not found" });
      }
      res.status(200).json(unitHead);
    } catch (error) {
      console.error("Error fetching unit head:", error);
      res.status(500).json({ message: error.message });
    }
  };





  module.exports = {
    createUnitHead,
    getAllUnitHeads,
    getUnitHeadById,
  };