const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');

// Configure Cloudinary using CLOUDINARY_URL from .env
// CLOUDINARY_URL format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
// This is automatically parsed by cloudinary when CLOUDINARY_URL env var is set
cloudinary.config();

// Log configuration status (without exposing secrets)
console.log('[Cloudinary] Configured with cloud:', cloudinary.config().cloud_name || 'NOT SET');

// File filter for images
const imageFileFilter = (req, file, cb) => {
    const allowedExt = /\.(jpeg|jpg|png|webp|avif|gif)$/i;
    const allowedMime = /^image\/(jpeg|png|webp|gif|avif)$/i;
    const originalName = file.originalname || '';
    const ext = path.extname(originalName).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (allowedExt.test(ext) && allowedMime.test(mime)) {
        cb(null, true);
    } else {
        cb(new Error(`Only image files are allowed (jpeg, jpg, png, webp, gif). Received: "${originalName}"`), false);
    }
};

// File filter for videos and images (for returns)
const mediaFileFilter = (req, file, cb) => {
    const allowedVideo = /\.(mp4|mov|webm|mkv)$/i;
    const allowedImage = /\.(jpeg|jpg|png|webp)$/i;
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedVideo.test(ext) || allowedImage.test(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only video/image files allowed'), false);
    }
};

// Storage for product images
const productStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'fundamental-apparel/products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
        transformation: [{ width: 1200, height: 1200, crop: 'limit', quality: 'auto' }],
        public_id: (req, file) => {
            const base = path.basename(file.originalname, path.extname(file.originalname))
                .replace(/\s+/g, '-').toLowerCase();
            return `${Date.now()}-${base}`;
        }
    }
});

// Storage for review images
const reviewStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'fundamental-apparel/reviews',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
        public_id: (req, file) => {
            const base = path.basename(file.originalname, path.extname(file.originalname))
                .replace(/\s+/g, '-').toLowerCase();
            return `review-${Date.now()}-${base}`;
        }
    }
});

// Storage for receipt images
const receiptStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'fundamental-apparel/receipts',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit', quality: 'auto' }],
        public_id: (req, file) => `receipt-${Date.now()}-${Math.round(Math.random() * 1e9)}`
    }
});

// Storage for return request media (images and videos)
const returnStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const isVideo = ['.mp4', '.mov', '.webm', '.mkv'].includes(ext);
        
        return {
            folder: 'fundamental-apparel/returns',
            resource_type: isVideo ? 'video' : 'image',
            allowed_formats: isVideo ? ['mp4', 'mov', 'webm', 'mkv'] : ['jpg', 'jpeg', 'png', 'webp'],
            public_id: `return-${Date.now()}-${Math.round(Math.random() * 1e9)}`
        };
    }
});

// Storage for message attachments
const messageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'fundamental-apparel/messages',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit', quality: 'auto' }],
        public_id: (req, file) => `msg-${Date.now()}-${Math.round(Math.random() * 1e9)}`
    }
});

// Storage for custom order designs
const customOrderStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'fundamental-apparel/custom-orders',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'ai', 'psd'],
        public_id: (req, file) => {
            const base = path.basename(file.originalname, path.extname(file.originalname))
                .replace(/\s+/g, '-').toLowerCase();
            return `custom-${Date.now()}-${base}`;
        }
    }
});

// Create multer upload instances
const productUpload = multer({
    storage: productStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const reviewUpload = multer({
    storage: reviewStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 4 * 1024 * 1024 } // 4MB
});

const receiptUpload = multer({
    storage: receiptStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const returnUpload = multer({
    storage: returnStorage,
    fileFilter: mediaFileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB for videos
});

const messageUpload = multer({
    storage: messageStorage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const customOrderUpload = multer({
    storage: customOrderStorage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Helper to delete image from Cloudinary
const deleteImage = async (publicIdOrUrl) => {
    try {
        let publicId = publicIdOrUrl;
        
        // If it's a URL, extract the public_id
        if (publicIdOrUrl && publicIdOrUrl.includes('cloudinary.com')) {
            // Extract public_id from URL: https://res.cloudinary.com/cloud_name/image/upload/v123/folder/filename.jpg
            const match = publicIdOrUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
            if (match) {
                publicId = match[1];
            }
        }
        
        if (publicId) {
            const result = await cloudinary.uploader.destroy(publicId);
            console.log('[Cloudinary] Deleted:', publicId, result);
            return result;
        }
    } catch (error) {
        console.error('[Cloudinary] Delete error:', error);
    }
};

// Helper to delete video from Cloudinary
const deleteVideo = async (publicIdOrUrl) => {
    try {
        let publicId = publicIdOrUrl;
        
        if (publicIdOrUrl && publicIdOrUrl.includes('cloudinary.com')) {
            const match = publicIdOrUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
            if (match) {
                publicId = match[1];
            }
        }
        
        if (publicId) {
            const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
            console.log('[Cloudinary] Deleted video:', publicId, result);
            return result;
        }
    } catch (error) {
        console.error('[Cloudinary] Delete video error:', error);
    }
};

module.exports = {
    cloudinary,
    productUpload,
    reviewUpload,
    receiptUpload,
    returnUpload,
    messageUpload,
    customOrderUpload,
    deleteImage,
    deleteVideo
};
