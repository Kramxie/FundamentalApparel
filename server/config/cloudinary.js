import { v2 as cloudinary } from "cloudinary";

// Auto-detect CLOUDINARY_URL from environment variables
cloudinary.config();

export default cloudinary;
