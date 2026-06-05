// src/upload/upload.module.ts

import { Global, Module, OnModuleInit } from '@nestjs/common';
import { UploadService } from './upload.service';

@Global()
@Module({
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule implements OnModuleInit {
  constructor(private uploadService: UploadService) {}

  onModuleInit() {
    // ✅ Create folder once start server 
    this.uploadService.ensureUploadDirs();
  }
}