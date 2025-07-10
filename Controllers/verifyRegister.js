// controllers/authController.js
const User = require('../Models/user');
const Church = require('../Models/churchesAdmin'); 
const role = require('../Models/role');
const { signJwt } = require("../Middlewares/jwt");


const verifyAndRegister = async (req, res) => {
  try {
    const { verificationCode } = req.body;
    const userId = req.user._id; 

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isEmailVerified) return res.status(400).json({ message: 'User already verified' });

    if (user.verificationCode !== verificationCode) {
      return res.status(400).json({ message: 'Invalid verification code' });
   
    }
          console.log(user.verificationCode);

    if (Date.now() > user.verificationCodeExpire) {
      return res.status(400).json({ message: 'Verification code has expired' });
    }

    user.isEmailVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpire = null;
    await user.save({validateBeforeSave: false});

    const token = signJwt({ user });

    return res.status(200).json({
         message: 'Email verified successfully',
         token,
            user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            isEmailVerified: user.isEmailVerified,
            },
        
        });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// Create church registration verification
const churchVerifyAndRegister = async (req, res) => {
  try {
    const { verificationCode } = req.body;
    const churchId = req.user._id; 
    const church = await Church.findById(churchId);
    if (!church) return res.status(404).json({ message: 'Church not found' });

    if (church.isEmailVerified) return res.status(400).json({ message: 'Church already verified' });

    if (church.verificationCode !== verificationCode) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    if (Date.now() > church.verificationCodeExpire) {
      return res.status(400).json({ message: 'Verification code has expired' });
    }

    church.isEmailVerified = true;
    church.verificationCode = null;
    church.verificationCodeExpire = null;
    await church.save({ validateBeforeSave: false });

 // Generate token here using your signJwt helper
    const token = signJwt({ church });

    return res.status(200).json({
      message: 'Email verified successfully',
      token, 
      church: {
        churchId: church._id,
        churchEmail: church.churchEmail,
        churchName: church.churchName,
        isEmailVerified: church.isEmailVerified,
        role: church.role,
      },
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};



module.exports = { verifyAndRegister, churchVerifyAndRegister };
