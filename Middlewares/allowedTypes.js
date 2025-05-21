const allowedImageTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "application/pdf",
    "image/svg+xml",
  ];
  const allowedVideoTypes = ["video/mp4", "audio/mpeg", "audio/mp3"];
  
    const allowedTypes = (req, res, next) => {
      const { file } = req;
      const { mimetype } = file;

      if (allowedImageTypes.includes(mimetype)) {
        next();
      } else if (allowedVideoTypes.includes(mimetype)) {
        next();
      } else {
        res.status(400).json({ message: "Invalid file type" });
      }
    };

    module.exports = allowedTypes;