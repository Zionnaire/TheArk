
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { isUnitHead } = require('../Middlewares/authAccess');
const { text } = require('body-parser');
const crypto = require('crypto');
const { type } = require('os');


const userSchema = new mongoose.Schema({
    userName: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
    },

    firstName: {   
        type: String,
        required: [true, 'First Name is required'],
        trim: true
     },

    lastName: {
        type: String,
        required: [true, 'Last Name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },

    phoneNumber: {
        type: String,
        required: [true, 'Phone Number is required'],
        // match: [/^\d{10}$/, 'Phone Number must be a 10-digit number']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        match: [/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Password must have at least one uppercase letter, one lowercase letter, one number, and one special character']
    },

    cPassword: {
        type: String,
        minlength: [6, 'Confirm Password must be at least 6 characters'],
        match: [/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Confirm Password must have at least one uppercase letter, one lowercase letter, one number, and one special character']
    },
    role: {
        type: String,
        enum: ['member', 'unitHead', 'churchAdmin'],
        default: 'member'
    },

    churchesJoined: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Church'
        }
    ],
    isUnitHead: {
        type: Boolean,
        default: false
    },

    roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role'
    },
  // user can be in up to 3 units and numerous departments
  assignedUnits: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Unit'
    }],
    departments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
    }],

    userImage: [
      {
        url: { type: String },
        cld_id: { type: String },
      },
    ],

socialMedia: [
    {
      platform: {
        type: String,
        enum: ['twitter', 'github', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube', 'website', 'other'],
      },
      url: { type: String},
   
    }
  ],

posts:[
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
    }   
],
      privateChats: [{ type: mongoose.Schema.Types.ObjectId, ref: "PrivateChat" }],
  unitChats: [{ type: mongoose.Schema.Types.ObjectId, ref: "UnitChat" }],
  departmentChats: [{ type: mongoose.Schema.Types.ObjectId, ref: "DepartmentChat" }],
  generalChats: [{ type: mongoose.Schema.Types.ObjectId, ref: "GeneralChat" }],
   isEmailVerified: {
        type: Boolean,
        default: false,
      },
      verificationCode: {
        type: String,
      },
        verificationCodeExpire: {
            type: Date,
        },
 isActive: {
        type: Boolean,
        default: false,
      },
      resetPasswordToken: {
        type: String,
        default: null,
      },
      resetPasswordExpire: {
        type: Date,
        default: Date.now,
      },
      resetCode: {
        type: String,
      },
        resetCodeExpire: {
            type: Date,
        },

       // *** New Fields ***
  bio: {
    type: String,
    maxlength: 250,
    default: ''
  },

  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followersCount: {
    type: Number,
    default: 0
  },

  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followingCount: {
    type: Number,
    default: 0
  },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date
    }
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};
userSchema.methods.updateLastLogin = async function() {
    this.lastLogin = Date.now();
    await this.save({ validateBeforeSave: false });
};

userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 mins

  userSchema.methods.incrementFollowersCount = async function() {
  this.followersCount = this.followers.length;
  await this.save({ validateBeforeSave: false });
};

userSchema.methods.incrementFollowingCount = async function() {
  this.followingCount = this.following.length;
  await this.save({ validateBeforeSave: false });

  return resetToken; // Return plain token to send via email
};


}

module.exports = mongoose.model('User', userSchema);