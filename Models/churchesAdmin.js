//Create  Model for a new church

const mongoose = require('mongoose');
const departments = require('./departments'); // Assuming this is another model or utility, keep it.
const bcrypt = require('bcryptjs'); // Add bcrypt for password hashing methods, similar to User schema
const crypto = require('crypto'); // Add crypto for password reset token methods

const Schema = mongoose.Schema;

const churchSchema = new Schema({
    churchName: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true,
        minlength: 6, // Added minlength for consistency with user schema
        // You might want to add match regex for password complexity here too,
        // similar to your User schema, if passwords should be strong for churches.
    //  match: [/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, 'Password must have at least one uppercase letter, one lowercase letter, one number, and one special character'],
    },

    cPassword: {
        type: String,
        // If you add password regex to 'password', add it here too.
    },
    churchAddress: {
        type: String,
        required: true
    },
    churchCity: {
        type: String,
        required: true
    },
    churchState: {
        type: String,
        required: true
    },

    churchEmail: {
        type: String,
        required: true,
        trim: true,
        unique: true, // Should be unique for churches too
        lowercase: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please enter a valid email',
        ],
    },
    churchLogo: [
    {
      url: { type: String },
      cld_id: { type: String },
    },
  ],
    verificationCode: {
        type: String,
    },
    verificationCodeExpire: {
        type: Date,
    },

    // Social media links, let it be an array of objects
    churchMedia: [
        {
            name: {
                type: String,
                required: true
            },
            link: {
                type: String,
                required: true
            }
        }
    ],
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    role: {
        type: String,
        default: 'churchAdmin',
        enum: ['churchAdmin'] // Explicitly list allowed roles if only 'churchAdmin' is expected
    },

    phoneNumber: {
        type: String,
        
    },
    churchMembers: [
        {
            _id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            name: {
                type: String,
                // required: true
            },
            email: {
                type: String,
                // required: true
            }
        }
    ],

  units: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  }
],
    totalMembers: {
        type: Number,
        default: 0
    },
    // --- START: Added fields for Follow/Unfollow functionality ---
    followers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'followersOnModel', // Dynamically reference 'User' or 'Church'
        },
    ],
    followersOnModel: {
        type: String,
        enum: ['User', 'Church'], // Defines which models can follow a Church
        // This field is generally set alongside the ObjectId when pushing to the `followers` array.
        // It helps Mongoose know which model to use for population.
    },
    following: [
        {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'followingOnModel', // Dynamically reference 'User' or 'Church'
        },
    ],
    followingOnModel: {
        type: String,
        enum: ['User', 'Church'], // Defines which models a Church can follow
        // Similar to followersOnModel, set when pushing to `following`.
    },
    followersCount: {
        type: Number,
        default: 0,
    },
    followingCount: {
        type: Number,
        default: 0,
    },
    // --- END: Added fields for Follow/Unfollow functionality ---

    // Adding password reset fields, consistent with User schema
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
    // Adding lastLogin field, consistent with User schema
    lastLogin: {
        type: Date,
    },

}, { timestamps: true });

// 🔐 Password Hashing (Add pre-save hook for password hashing)
churchSchema.pre('save', async function (next) {
    // Check if the password field is being modified
    console.log('--- Inside churchSchema.pre("save") hook ---');
    console.log('isModified("password"):', this.isModified('password')); // Should be true on new creation or password change

    if (!this.isModified('password')) {
        console.log('Password not modified, skipping hashing.');
        return next();
    }

    console.log('Password WILL be hashed.');
    console.log('Plain text password BEFORE hashing (this.password):', this.password); // CRITICAL LOG

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(this.password, salt); // Hash the password
    
    this.password = hashedPassword; // Assign the hashed password back
    console.log('Hashed password AFTER hashing (this.password):', this.password); // CRITICAL LOG

    // Clear cPassword as it's no longer needed after hashing
    this.cPassword = undefined; // Ensure cPassword is not saved to DB
    
    console.log('Hashing complete. Calling next().');
    next();
});


// ✅ Match Password (Method to compare passwords)
churchSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// ✅ Update Last Login (Method to update last login timestamp)
churchSchema.methods.updateLastLogin = async function () {
    this.lastLogin = Date.now();
    await this.save({ validateBeforeSave: false });
};

// 🔐 Generate Reset Token (Method for password reset token generation)
churchSchema.methods.generatePasswordResetToken = function () {
    const resetToken = crypto.randomBytes(32).toString('hex');
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    return resetToken;
};

// 👥 Followers / Following Count Helpers (Methods to update counts)
churchSchema.methods.incrementFollowersCount = async function () {
    this.followersCount = this.followers.length;
    await this.save({ validateBeforeSave: false });
};

churchSchema.methods.incrementFollowingCount = async function () {
    this.followingCount = this.following.length;
    await this.save({ validateBeforeSave: false });
};

churchSchema.methods.decrementFollowersCount = async function () {
    this.followersCount = this.followers.length;
    await this.save({ validateBeforeSave: false });
}

churchSchema.methods.decrementFollowingCount = async function () {
    this.followingCount = this.following.length;
    await this.save({ validateBeforeSave: false });
}

const Church = mongoose.model('Church', churchSchema);
module.exports = Church;