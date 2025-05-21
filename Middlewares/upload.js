const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../configs/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "comments_uploads",
    allowed_formats: ["jpg", "jpeg", "png", "pdf", "svg", "mp4", "mp3"],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file limit
});

module.exports = upload;
