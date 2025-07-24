const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
  },
  firstName: {
    type: String,
    required: [true, 'First Name is required'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Last Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email',
    ],
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone Number is required'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    match: [
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      'Password must have at least one uppercase letter, one lowercase letter, one number, and one special character',
    ],
  },
  cPassword: {
    type: String,
    minlength: 6,
    match: [
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
      'Confirm Password must meet the same criteria',
    ],
  },
  role: {
    type: String,
    enum: ['member', 'unitHead', 'churchAdmin'],
    default: 'member',
  },
  isUnitHead: {
    type: Boolean,
    default: false,
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
  },
  churchesJoined: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Church',
    },
  ],
  churchId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Church',
  default: null,
},
  assignedUnits: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
    },
  ],
  departments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
  ],
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
        enum: [
          'twitter',
          'github',
          'linkedin',
          'facebook',
          'instagram',
          'tiktok',
          'youtube',
          'website',
          'other',
        ],
      },
      url: { type: String },
    },
  ],
  posts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
    },
  ],
   privateChats: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Chat', // Now references the generic Chat model
        },
    ],
    unitChats: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Chat', // Now references the generic Chat model
        },
    ],
  departmentChats: [
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
    name: String,
  }
],

    generalChats: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Chat', // Now references the generic Chat model
        },
    ],
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
  },
  resetCode: {
    type: String,
  },
  resetCodeExpire: {
    type: Date,
  },
  bio: {
    type: String,
    maxlength: 250,
    default: '',
  },
  followers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  followersCount: {
    type: Number,
    default: 0,
  },
  following: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  followingCount: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
  },
});

// 🔐 Password Hashing
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ✅ Match Password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ✅ Update Last Login
userSchema.methods.updateLastLogin = async function () {
  this.lastLogin = Date.now();
  await this.save({ validateBeforeSave: false });
};

// 🔐 Generate Reset Token
userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

// 👥 Followers / Following Count Helpers
userSchema.methods.incrementFollowersCount = async function () {
  this.followersCount = this.followers.length;
  await this.save({ validateBeforeSave: false });
};

userSchema.methods.incrementFollowingCount = async function () {
  this.followingCount = this.following.length;
  await this.save({ validateBeforeSave: false });
};

userSchema.methods.decrementFollowersCount = async function () {
  this.followersCount = this.followers.length;
  await this.save({validateBeforeSave: false});
}

userSchema.methods.decrementFollowingCount = async function () {
  this.followingCount = this.following.length;
  await this.save({validateBeforeSave: false});
}
module.exports = mongoose.model('User', userSchema);
