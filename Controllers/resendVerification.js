// controllers/resendCodeController.js
const User = require('../Models/user');
const Church = require('../Models/churchesAdmin');
const Transporter = require('../Middlewares/emailVerification');

const generateVerificationCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    // Try finding the user in both collections
    const user = await User.findOne({ email });
    const church = await Church.findOne({ email });

    if (!user && !church) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const account = user || church;

    // Assign verification code and expiry
    account.verificationCode = generateVerificationCode();
    account.verificationCodeExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await account.save();

    // Send email
    await Transporter.transporter.sendEmail(
      email,
      'Your new verification code',
      `Your verification code is ${account.verificationCode}`
    );

    return res.status(200).json({ message: 'Verification code resent successfully.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error resending verification code' });
  }
};


// Resend verification code for church registration
const resendChurchVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    // Try finding the church in the Church collection
    const church = await Church.findOne({ email });

    if (!church) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Assign verification code and expiry
    church.verificationCode = generateVerificationCode();
    church.verificationCodeExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await church.save();

    // Send email
    await Transporter.transporter.sendEmail(
      email,
      'Your new verification code',
      `Your verification code is ${church.verificationCode}`
    );

    return res.status(200).json({ message: 'Verification code resent successfully.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error resending verification code' });
  }
};

module.exports = { resendVerificationCode, resendChurchVerificationCode };
