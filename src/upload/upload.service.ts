// src/upload/upload.service.ts

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  // ✅ For generate file url 
  getFileUrl(file: Express.Multer.File): string {
    return `/uploads/${file.filename}`;
  }

  // ✅ For Delete The File 
  async deleteFile(filePath: string): Promise<void> {
    try {
      const fullPath = path.join(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        this.logger.log(`File deleted: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to delete file: ${filePath}`, error);
    }
  }

  // ✅ Make Upload Folder (if not have)
  ensureUploadDirs(): void {
    const dirs = [
      './uploads/nid',
      './uploads/trade-license',
      './uploads/logo',
      './uploads/others',
    ];
      //Here forEach loop check one by one dir || recursive:true means if not avaiable parent folder create parent folder also 
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
           fs.mkdirSync(dir, { recursive: true });
        this.logger.log(`Created directory: ${dir}`);
      }
    });
  }
}