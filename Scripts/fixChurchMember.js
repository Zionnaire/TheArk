const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Church = require('../Models/churchesAdmin'); // Make sure the path to your Church model is correct
const User = require('../Models/user'); // Make sure the path to your User model is correct

// Replace with your actual database connection string
dotenv.config();
const dbURI = process.env.MONGODB_URI;
// Replace these with the actual IDs of your church and the two active users
const churchId = "686f0042db694e57d750e4a9";
const activeUserIds = ["6892195a406da27e86015d35", "68921ea5406da27e86015f8e"];

const migrateChurchMembers = async () => {
  try {
    // Connect to your MongoDB database
    await mongoose.connect(dbURI);
    console.log("Connected to MongoDB...");

    // Find the two active users
    const activeUsers = await User.find({ _id: { $in: activeUserIds } });
    if (activeUsers.length === 0) {
      console.error("No active users found with the provided IDs. Aborting migration.");
      await mongoose.disconnect();
      return;
    }

    // Create a new, corrected churchMembers array
    const newChurchMembers = activeUsers.map(user => ({
      _id: user._id,
      name: user.userName || `${user.firstName} ${user.lastName}`,
      email: user.email
    }));

    // Find the target church and update the churchMembers array
    const result = await Church.findByIdAndUpdate(
      churchId,
      { churchMembers: newChurchMembers },
      { new: true, runValidators: true }
    );

    if (result) {
      console.log("Successfully updated church members for church:", result.churchName);
      console.log("New churchMembers array:", newChurchMembers);
    } else {
      console.error("Church not found with the provided ID. Aborting migration.");
    }

    // Disconnect from the database
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  } catch (error) {
    console.error("Migration failed:", error);
    await mongoose.disconnect();
  }
};

migrateChurchMembers();
