const mongoose = require("mongoose");
const ChatGroup = require("../Models/chatGroup");
const Unit = require("../Models/unit");
const User = require("../Models/user");

const createGroupChat = async (req, res) => {
  try {
    const { name, units } = req.body; 
    const userId = req.user._id;

    if (!name || !units || units.length === 0) {
      return res.status(400).json({ message: "Name and units are required" });
    }

    // Fetch all units
    const fetchedUnits = await Unit.find({ _id: { $in: units } });

    if (fetchedUnits.length === 0) {
      return res.status(404).json({ message: "No valid units found" });
    }

    // Collect all unique member IDs from those units
    let allMemberIds = [];
    fetchedUnits.forEach(unit => {
      if (unit.members && unit.members.length > 0) {
        unit.members.forEach(member => {
          allMemberIds.push(member._id.toString());
        });
      }
    });

    // Remove duplicate members
    allMemberIds = [...new Set(allMemberIds)];

    // Create the new group
    const newGroup = await ChatGroup.create({
      name,
      createdBy: userId,
      units,
      members: allMemberIds
    });

    // Update each Unit's chatGroups array
    await Promise.all(fetchedUnits.map(async (unit) => {
      unit.chatGroups.push({ _id: newGroup._id, name: newGroup.name });
      await unit.save();
    }));

    // Socket emit to notify all members of the new group
    const groupMembers = await User.find({ _id: { $in: allMemberIds } });
    groupMembers.forEach(member => {
      io.to(member.socketId).emit("new_group_chat", {
        groupId: newGroup._id,
        groupName: newGroup.name,
        createdBy: req.user.name,
        units: fetchedUnits.map(unit => unit.name),
        members: allMemberIds
        });
    });

    return res.status(201).json({
      message: "Group Chat created successfully",
      group: newGroup
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// Get all group chats for a user
const getAllGroupChats = async (req, res) => {
  try {
    const userId = req.user._id;
    const groups = await ChatGroup.find({ members: userId }).populate("createdBy", "name email").populate("units", "name").populate("members", "name email");
    return res.status(200).json({
      message: "Group Chats fetched successfully",
      groups
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server Error" });
  }
};

const updateGroupChat = async (req, res) => {
    try {
      const { id } = req.params;
      const { name, units } = req.body; 
      const userId = req.user._id;
  
      const group = await ChatGroup.findById(id).populate("createdBy", "name email").populate("units", "name").populate("members", "name email");
      if (!group) {
        return res.status(404).json({ message: "Group Chat not found" });
      }
  
      // Only the creator or admin can update
      if (group.createdBy.toString() !== userId.toString()) {
        return res.status(403).json({ message: "You are not authorized to update this group" });
      }
  
      // Update group name if provided
      if (name) {
        group.name = name;
      }
  
      // If units are provided, update units and members
      if (units && units.length > 0) {
        const fetchedUnits = await Unit.find({ _id: { $in: units } });
  
        let allMemberIds = [];
        fetchedUnits.forEach(unit => {
          if (unit.members && unit.members.length > 0) {
            unit.members.forEach(member => {
              allMemberIds.push(member._id.toString());
            });
          }
        });
  
        allMemberIds = [...new Set(allMemberIds)]; // Remove duplicates
  
        group.units = units;
        group.members = allMemberIds;
      }
  
      await group.save();
  
      return res.status(200).json({
        message: "Group Chat updated successfully",
        group
      });
  
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server Error" });
    }
  };
  

  const deleteGroupChat = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user._id;
  
      const group = await ChatGroup.findById(id);
      if (!group) {
        return res.status(404).json({ message: "Group Chat not found" });
      }
  
      if (group.createdBy.toString() !== userId.toString()) {
        return res.status(403).json({ message: "You are not authorized to delete this group" });
      }
  
      // Remove the group reference from each unit
      await Unit.updateMany(
        { "chatGroups._id": id },
        { $pull: { chatGroups: { _id: id } } }
      );
  
      await group.deleteOne();
  
      return res.status(200).json({ message: "Group Chat deleted successfully" });
  
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server Error" });
    }
  };

  module.exports = {
createGroupChat,
getAllGroupChats,
updateGroupChat,
deleteGroupChat


  }
  