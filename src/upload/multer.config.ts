// src/upload/multer.config.ts

import { diskStorage } from 'multer';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';

// ✅ Which file type allow 
const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/jpg',
  'image/webp',
  'application/pdf',
];

// ✅ Maximum file size (5MB)
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ✅ File filter - only allow here image and PDF 
export const fileFilter = (
  req: any,
  file: Express.Multer.File,
  callback: any,
) => {
  if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        `Only ${ALLOWED_FILE_TYPES.join(', ')} files are allowed`,
      ),
      false,
    );
  }
  callback(null, true);
};

// ✅ NID Copy upload config
export const nidStorage = diskStorage({
  destination: './uploads/nid',
  filename: (req, file, callback) => {
    const uniqueName = `nid-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = extname(file.originalname);
    callback(null, `${uniqueName}${ext}`);
  },
});

// ✅ Trade License upload config
export const tradeLicenseStorage = diskStorage({
  destination: './uploads/trade-license',
  filename: (req, file, callback) => {
    const uniqueName = `tl-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = extname(file.originalname);
    callback(null, `${uniqueName}${ext}`);
  },
});

// ✅ Logo upload config
export const logoStorage = diskStorage({
  destination: './uploads/logo',
  filename: (req, file, callback) => {
    const uniqueName = `logo-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = extname(file.originalname);
    callback(null, `${uniqueName}${ext}`);
  },
});

// ✅ Combined config for all file
export const registerFileStorage = diskStorage({
  destination: (req, file, callback) => {
    let dest = './uploads/';

    switch (file.fieldname) {
      case 'nidCopy':
        dest += 'nid';
        break;
      case 'tradeLicense':
        dest += 'trade-license';
        break;
      case 'logo':
        dest += 'logo';
        break;
      default:
        dest += 'others';
    }

    callback(null, dest);
  },
  filename: (req, file, callback) => {
    const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = extname(file.originalname);
    callback(null, `${uniqueName}${ext}`);
  },
});