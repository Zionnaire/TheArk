// I want to create a middleware that will send verification email link to the user's email address.

// The middleware should be able to send the email verification link to the user's email address when the user signs up.
// The middleware should be able to verify the email address when the user clicks on the verification link.
// The middleware should be able to send the email verification link to the user's email address when the user requests a new verification link.
// The middleware should be able to resend the email verification link to the user's email address when the user requests a new verification link.



const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const User = require("../Models/user"); 
const Church = require("../Models/churchesAdmin"); 
const dotenv = require("dotenv");

dotenv.config();

const transporter = nodemailer.createTransport({
  host: "smtp.mailersend.net",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});



// Generate Verification Token
const generateVerificationToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

// Send Verification Email
const sendVerificationEmail = async (email, name, verificationCode) => {
    try {
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        const mailOptions = {
            from: process.env.EMAIL_USERNAME,
            to: email,
            subject: "Verify Your Account",
            text: `Hi ${name},\n\nYour verification code is: ${verificationCode}. It expires in 10 minutes.\n\nThank you!`,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Verification email sent to ${email}`);
    } catch (error) {
        console.error("Error sending verification email:", error);
    }
};

// Send Email
const sendEmail = async (email, subject, text) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USERNAME,
            to: email,
            subject: subject,
            text: text,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${email}`);
    } catch (error) {
        console.error("Error sending email:", error);
    }
};

// Middleware to Send Email After Signup
const sendVerificationOnSignup = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        const church = await Church.findOne({ churchEmail: email }); // Assuming you have a Church model

        if (!user && !church) { 
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isVerified || church.isEmailVerified) {
            return res.status(400).json({ message: "Email already verified" });
        }

       const target = user || church;
await sendVerificationEmail(target.email, target.firstName || target.churchName, target.verificationCode);

        res.status(200).json({ message: "Verification email sent. Please check your inbox." });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
};

// Middleware to Verify Email
const verifyEmail = async (req, res) => {
    try {
      const { token } = req.params;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Decoded token:", decoded);
  
      const user = await User.findById(decoded.userId);
      const church = await Church.findById(decoded.churchId);
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      } else if (!church) {
        return res.status(404).json({ message: "Church not found" });       
        }
  
      if (user && user.isVerified) {
        return res.status(400).json({ message: "User email already verified" });
      }
  
      if (church && church.isEmailVerified) {
        return res.status(400).json({ message: "Church email already verified" });
      }
  
      if (user) {
        user.isVerified = true;
        await user.save();
      }
  
      if (church) {
        church.isEmailVerified = true;
        await church.save();
      }
  
      res.status(200).json({ message: "Email successfully verified" });
    } catch (error) {
      res.status(400).json({ message: "Invalid or expired token" });
    }
  };
  

// Middleware to Resend Verification Email
const resendVerificationEmail = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const church = await Church.findById(req.church._id); // Assuming you have a Church model

        if (!user || !church) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isVerified || church.isEmailVerified) {
            return res.status(400).json({ message: "Email already verified" });
        }

if (user && !user.isVerified) await sendVerificationEmail(user.email, user.firstName, user.verificationCode);
if (church && !church.isEmailVerified) await sendVerificationEmail(church.churchEmail, church.churchName, church.verificationCode);

res.status(200).json({ message: "Verification email resent" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
};

module.exports = { sendEmail, sendVerificationOnSignup, verifyEmail, resendVerificationEmail, sendVerificationEmail, transporter };
