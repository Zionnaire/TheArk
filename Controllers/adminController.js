  const mongoose = require('mongoose');
  const Admin = require('../Models/admin');
  const User = require('../Models/user');
  const Unit = require('../Models/unit');  
  const Department = require('../Models/departments');
  const bcrypt = require('bcryptjs');
  const { signJwt } = require('../Middlewares/jwt');
  const logger = require('../Middlewares/logger');
  const { uploadToCloudinary } = require('../Middlewares/cloudinaryUpload');

  // Create admin
  const createAdmin = async (req, res) => {
      try {
          const { username, email, password, cPassword } = req.body;

          // Check if admin already exists
          const adminExists = await Admin.findOne({ email });
          if (adminExists) {
              return res.status(400).json({ message: 'Admin already exists' });
          }

          if (password !== cPassword) {
              return res.status(400).json({ message: 'Passwords do not match' });
          }

          // Hash password
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(password, salt);

          // Create admin
          const admin = await Admin.create({
              username,
              email,
              password: hashedPassword,
              cPassword,
              role: 'admin'
          });

          if (admin) {
            res.status(201).json({
              _id: admin._id,
              username: admin.username,
              email: admin.email,
              role: admin.role,
              token: signJwt({ id: admin._id, role: admin.role }),
            });
          } else {
            res.status(400).json({ message: "Invalid admin data" });
          }
        }  catch (error) {
          res.status(500).json({ message: error.message });
      }
  };

  // Login admin
  // @Route   POST /api/admins/login
    // @access  Public
  const loginAdmin = async (req, res) => {
      try {
          const { email, password } = req.body;

          // Check admin exists
          const admin = await Admin.findOne({ email });
        
          if (admin && (await bcrypt.compare(password, admin.password))) {
              res.status(200).json({
                  _id: admin._id,
                  username: admin.username,
                  email: admin.email,
                  token: signJwt({ id: admin._id, role: admin.role }),
              });
          } else {
              res.status(401).json({ message: 'Invalid credentials' });
          }
      } catch (error) {
          res.status(500).json({ message: error.message });
      }
  };

  // Change user's role from member to head of unit
  // @Route   PUT /api/users/:userId/role
  // @access  Private/Admin
  const changeMemberRole = async (req, res) => {
    try {
        
      const { userId } = req.params;
      const { role } = req.body;
  
      // Log to debug
      console.log("Received userId:", userId);
  
      // Ensure `userId` is a valid ObjectId
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid user ID format" });
      }
  
      // Ensure admin is authenticated
      if (!req.admin) {
        return res.status(403).json({ message: "Unauthorized access" });
      }
  
      const admin = await Admin.findById(req.admin._id);
      if (!admin || admin.role !== "admin") {
        return res.status(403).json({ message: "Only admins can change roles" });
      }
  
      // Try to find the user in the database
      let user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found, register first" });
      }
  
      const unitHead = await User.findOne({ role: "unitHead" });
  
      if (user.role === "unitHead" || user.isUnitHead) {
        return res.status(400).json({ message: "User is already a unit head" });
      }
  
      if (role === "unitHead" && unitHead) {
        return res.status(400).json({ message: "A Unit Head already exists" });
      }
  
      user.role = role;
      user.isUnitHead = role === "unitHead";
      await user.save({ validateBeforeSave: false });
  
      res.status(200).json({ message: "Role changed successfully" });
  
      if (role === "unitHead" && unitHead) {
        unitHead.role = "member";
        await unitHead.save();
      }
    } catch (error) {
      console.error("Error changing role:", error);
      res.status(500).json({ message: error.message });
    }
  };

  // Get all Unit Heads
  const getAllUnitHeads = async (req, res) => {
    try {
  
      const unitHeads = await User.find({ role: "unitHead" });
  
      if (!unitHeads || unitHeads.length === 0) {
        return res.status(404).json({ message: "No unit heads found" });
      }
  
      res.status(200).json(unitHeads);
    } catch (error) {
        logger.error("Error fetching unit heads:", error);
      console.error("Error fetching unit heads:", error);
      res.status(500).json({ message: error.message });
    }
  };
  


  // Get admin profile
  const getAdminProfile = async (req, res) => {
      try {
          const admin = await Admin.findById(req.admin._id);
        
          if (admin) {
              res.status(200).json({
                  _id: admin._id,
                  username: admin.username,
                  email: admin.email,
                  role: admin.role,
                    adminImage: admin.adminImage,
              });
          } else {
              res.status(404).json({ message: 'Admin not found' });
          }
      } catch (error) {
          res.status(500).json({ message: error.message });
      }
  };

  // Update admin profile
  const updateAdminProfile = async (req, res) => {
      try {
          const admin = await Admin.findById(req.admin._id);

          if (admin) {
              admin.username = req.body.username || admin.username;
              admin.email = req.body.email || admin.email;

              if (req.body.password) {
                  const salt = await bcrypt.genSalt(10);
                  admin.password = await bcrypt.hash(req.body.password, salt);
              }

             
              // Handle image upload
        if (req.files && req.files.adminImage) {
            // console.log("Uploading file to Cloudinary...");

            const file = req.files.adminImage;
            const base64Image = `data:${file.mimetype};base64,${file.data.toString("base64")}`;
            
            const result = await uploadToCloudinary(base64Image, "profile-images/");
            // console.log("File uploaded to Cloudinary:", result);
            admin.adminImage = [{ url: result.secure_url, cld_id: result.public_id }];
        }

              const updatedAdmin = await admin.save({ validateBeforeSave: false });

              res.status(200).json({
                  _id: updatedAdmin._id,
                  username: updatedAdmin.username,
                  email: updatedAdmin.email,
                  token: signJwt({ id: updatedAdmin._id, role: updatedAdmin.role }),
                  adminImage: updatedAdmin.adminImage,
              });
          } else {
              res.status(404).json({ message: 'Admin not found' });
          }
      } catch (error) {
        logger.error("Error updating admin profile:", error);
          res.status(500).json({ message: error.message });
      }
  };


  // @desc    Get single unit
// @route   GET /api/units/:id
// @access  Public

const getUnitById = async (req, res) => {
    try {
        const unit = await Unit.findById(req.params.id);
        if (!unit) {
            return res.status(404).json({ message: 'Unit not found' });
        }
        res.status(200).json(unit);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }   
}

// @desc    Get all units
// @route   GET /api/units
// @access  Public

const getAllUnits = async (req, res) => {
    try {
        // Only units that has isActive set to true should be returned
        const units = await Unit.find({ isActive: true });
        res.status(200).json(units);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Create unit
// @route   POST /api/units
// @access  Private/Admin

const createUnit = async (req, res) => {
    console.log("Unit model:", Unit);
    
    const { unitName, description, unitHeadId, departments } = req.body;

    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Only admins can create units" });
        }

        const unitExists = await Unit.findOne({ unitName });
        if (unitExists) {
            return res.status(400).json({ message: "Unit already exists" });
        }

        // ✅ Ensure all departments exist in the database
        const existingDepartments = await Department.find({ name: { $in: departments } }, "_id name");
        const existingDepartmentNames = existingDepartments.map(dep => dep.name);

        let newDepartments = [];
        for (const dept of departments) {
            if (!existingDepartmentNames.includes(dept)) {
                const newDept = await Department.create({ name: dept }); // Create missing department
                newDepartments.push(newDept);
            }
        }

        // ✅ Merge existing and new departments
        const allDepartments = [...existingDepartments, ...newDepartments].map(dep => ({
            _id: dep._id,
            name: dep.name
        }));

        // ✅ Create unit
        const unit = new Unit({
            unitName,
            description,
            unitHead: unitHeadId,
            departments: allDepartments
        });

        unit.totalMembers = (await User.countDocuments({ role: "member", unit: unit._id })) + 1;
        unit.totalUnits = (await Unit.countDocuments()) + 1;

        await unit.save();
        res.status(201).json(unit);

        if (unitHeadId) {
            const unitHead = await User.findById(unitHeadId);
            if (unitHead) {
                unitHead.role = "unitHead";
                await unitHead.save();
            }
        }
    } catch (error) {
        console.error("Error creating unit:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update unit
// @route   PUT /api/units/:id
// @access  Private/Admin

const updateUnit = async (req, res) => {
    const { unitName, description, unitHeadId, departments, isActive } = req.body;

    try {
        // Check if user is an admin
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Only admins can update units" });
        }

        //  Find Unit by ID
        const unit = await Unit.findById(req.params.id);
        if (!unit) {
            return res.status(404).json({ message: "Unit not found" });
        }

        // Update Fields If Provided
        unit.unitName = unitName || unit.unitName;
        unit.description = description || unit.description;
        unit.unitHead = unitHeadId || unit.unitHead;
        unit.isActive = isActive !== undefined ? isActive : unit.isActive;

        // Handle Departments (Ensure names and IDs)
        if (departments && Array.isArray(departments)) {
            // Find existing departments
            const existingDepartments = await Department.find({ name: { $in: departments } }, "_id name");
            const existingDepartmentNames = existingDepartments.map(dep => dep.name);

            let newDepartments = [];
            for (const dept of departments) {
                if (!existingDepartmentNames.includes(dept)) {
                    const newDept = await Department.create({ name: dept }); // Create missing department
                    newDepartments.push(newDept);
                }
            }

            // Merge both existing & new departments
            unit.departments = [...existingDepartments, ...newDepartments].map(dep => ({
                _id: dep._id,
                name: dep.name
            }));
        }

        //  Update Unit Head Role If Provided
        if (unitHeadId) {
            const unitHead = await User.findById(unitHeadId);
            if (unitHead) {
                unitHead.role = "unitHead";
                await unitHead.save();
            }
        }

        // Save Updated Unit
        await unit.save();
        res.status(200).json(unit);

    } catch (error) {
        console.error("Error updating unit:", error);
        res.status(500).json({ message: error.message });
    }
};


// @desc    Deactivate unit
// @route   DELETE /api/units/:id
// @access  Private/Admin
const deactivateUnit = async (req, res) => {    
    try {
        // Check if user is an admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can delete units' });
        }
        const unit = await Unit.findById(req.params.id);
        if (unit) {
        // Unit should not be deleted but turned inactive
        unit.isActive = false;
        //    await unit.remove();
            res.status(200).json({ message: 'Unit deactivated successfully' });
        }
        else {
            res.status(404).json({ message: 'Unit not found' });
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }   
}

// I want to be able to restore a deleted unit
// @desc    Restore deleted unit    
// @route   PUT /api/units/restore/:id
// @access  Private/Admin
const reactivateUnit = async (req, res) => {
    try {
        // Check if user is an admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can restore deleted units' });
        }
        const unit = await Unit.findById(req.params.id);
        if (unit) {
            unit.isActive = true;
            await unit.save();
            res.status(200).json(unit);
        }
        else {
            res.status(404).json({ message: 'Unit not found' });
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// @desc    Get all deleted units
// @route   GET /api/units/deleted
// @access  Private/Admin
const getInactiveUnits = async (req, res) => {
    try {
        // Check if user is an admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can view deleted units' });
        }
        const units = await Unit.find({ isActive: false });
            res.status(200).json(units);
        } catch (error) {
        res.status(500).json({ message: error.message });
    }
}


  // Get all users
  const getAllUsers = async (req, res) => {
      try {
          const users = await User.find();
          res.status(200).json(users);
      } catch (error) {
          res.status(500).json({ message: error.message });
      }
    };

    // Get a user by ID
    const getUserById = async (req, res) => {
        try {
            const user = await User.findById(req.params.id);
            if (user) {
                res.status(200).json(
                    user
                );
            }
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    // Delete a user
    const deleteUser = async (req, res) => {
        try {
            const user = await User.findById(req.params.id);
            if (user) {
                await user.remove();
                res.status(200).json({ message: 'User deleted successfully' });
            }
            else {
                res.status(404).json({ message: 'User not found' });
            } 
        }
        catch (error) {
            res.status(500).json({ message: error.message });
        }
    }


    const getAllReports = async (req, res) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ message: "Unauthorized access" });
            }
    
            const reports = await Report.find()
                .populate("comment", "content user")
                .populate("reportedBy", "username email")
                .sort({ createdAt: -1 });
    
            res.status(200).json({ reports });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    };
    
    const updateReportStatus = async (req, res) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ message: "Unauthorized access" });
            }
    
            const { reportId, status } = req.body;
            if (!["reviewed", "resolved"].includes(status)) {
                return res.status(400).json({ message: "Invalid status" });
            }
    
            const report = await Report.findByIdAndUpdate(reportId, { status }, { new: true });
            if (!report) {
                return res.status(404).json({ message: "Report not found" });
            }
    
            res.status(200).json({ message: `Report marked as ${status}`, report });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    };

    const deleteReportedComment = async (req, res) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ message: "Unauthorized access" });
            }
    
            const { commentId } = req.params;
            const comment = await Comment.findById(commentId);
            if (!comment) {
                return res.status(404).json({ message: "Comment not found" });
            }
    
            await comment.deleteOne();
            await Report.deleteMany({ comment: commentId }); // Remove associated reports
    
            res.status(200).json({ message: "Comment deleted successfully" });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    };
    
 

  module.exports = {
      createAdmin,
      loginAdmin,
      getAdminProfile,
      updateAdminProfile,
      changeMemberRole,
      getAllUnitHeads,
      getAllUsers,
      createUnit,
      updateUnit,
        getUserById,
        deleteUser,
        getUnitById,
        getAllUnits,
        getInactiveUnits,
        reactivateUnit,
        deactivateUnit,
        getAllReports,
        updateReportStatus,
        deleteReportedComment,
       
    };