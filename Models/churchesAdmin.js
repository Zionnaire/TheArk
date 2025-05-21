//Create  Model for a new church

const mongoose = require('mongoose');
const departments = require('./departments');

const Schema = mongoose.Schema;

const churchSchema = new Schema({
    churchName: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    },

    cPassword: {
        type: String,
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
    },
    churchLogo: {
        type: String,
    },
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
        default: 'churchAdmin'
    },
    members: [
        {
            _id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            name: {
                type: String,
                required: true
            }
        }
    ],

    units: [
        {
            _id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Unit'
            },
            name: {
                type: String,
                required: true
            },
       

            chats: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Chat'
                }
            ],
            departments: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Department'
                }
            ]      
        }
    ],
    totalMembers: {
        type: Number,
        default: 0
    },
}, { timestamps: true });

const Church = mongoose.model('Church', churchSchema);
module.exports = Church;
