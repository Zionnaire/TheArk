
const cloudinary = require("../configs/cloudinary");


//Cloudinary File Upload
// Cloudinary File Upload for Videos
const uploadVideoToCloudinary = async (buffer, folderPath) => {
  try {
    const base64 = buffer.toString('base64');
    const dataURI = `data:video/mp4;base64,${base64}`;

    const { secure_url: videoUrl, public_id: videoCldId } = await cloudinary.uploader.upload(dataURI, {
      resource_type: 'video',
      folder: folderPath,
    });

    return { videoUrl, videoCldId };
  } catch (error) {
    console.error("Cloudinary Upload Error:", error.message);
    throw new Error("Error uploading video to Cloudinary");
  }
};


// Cloudinary File Upload for Images
const uploadToCloudinary = async (buffer, folder) => {
  try {
    const base64 = buffer.toString('base64');
    const dataURI = `data:image/jpeg;base64,${base64}`;

    const { secure_url, public_id } = await cloudinary.uploader.upload(dataURI, {
      folder,
    });

    return { secure_url, public_id };
  } catch (error) {
    console.error("Cloudinary Upload Error:", error.message);
    throw new Error("Error uploading image to Cloudinary");
  }
};

const deleteFromCloudinary = async (publicId) => {
  return await cloudinary.uploader.destroy(publicId);
};


module.exports = { uploadToCloudinary, uploadVideoToCloudinary, deleteFromCloudinary };
