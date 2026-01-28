/**
 * File Upload Routes
 * 
 * Provides endpoints for:
 * - Upload image (POST /api/upload/image)
 * 
 * Requirements: 1.3, 1.4
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    // Generate unique filename: uuid-timestamp.ext
    const uniqueId = uuidv4();
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}-${timestamp}${ext}`);
  },
});

// File filter to validate file types
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allowed MIME types
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  // Allowed extensions
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  if (allowedMimeTypes.includes(mimeType) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, GIF, and WEBP images are allowed.'));
  }
};

// Configure multer with size limit and file filter
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB in bytes
  },
  fileFilter: fileFilter,
});

/**
 * POST /api/upload/image
 * 
 * Upload an image file for questions or options
 * 
 * Request:
 * - Content-Type: multipart/form-data
 * - Body: image file (max 5MB)
 * - Allowed types: jpg, jpeg, png, gif, webp
 * 
 * Response:
 * - 200: Image uploaded successfully
 * - 400: Validation error (no file, invalid type, size exceeded)
 * - 500: Server error
 * 
 * Validates: Requirements 1.3, 1.4
 */
router.post('/image', upload.single('image'), (req: Request, res: Response): void => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide an image file in the "image" field',
      });
      return;
    }

    // Generate URL path for the uploaded image
    // In production, this would be a CDN URL or cloud storage URL
    const imageUrl = `/uploads/${req.file.filename}`;

    // Return success response with image URL
    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: imageUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (error) {
    console.error('Error uploading image:', error);

    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: 'Failed to upload image',
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to upload image',
        message: 'Unknown error occurred',
      });
    }
  }
});

// Error handling middleware for multer errors
router.use((error: any, _req: Request, res: Response, next: any): void => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: 'File too large',
        message: 'Image size must not exceed 5MB',
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: 'Upload error',
      message: error.message,
    });
    return;
  }

  if (error) {
    res.status(400).json({
      success: false,
      error: 'Upload error',
      message: error.message,
    });
    return;
  }

  next();
});

export default router;
