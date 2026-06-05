import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { GetUser } from 'src/modules/auth/decorator/get-user.decorator';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import { DepositService } from '../services/deposit.service';

@Controller('deposits')
@UseGuards(JwtAuthGuard)
export class DepositController {
  constructor(private readonly depositService: DepositService) {}

  // ── GET /api/v1/deposits ──
  @Get()
  async getDeposits(@GetUser('id') userId: string) {
    return this.depositService.getDeposits(userId);
  }

  // ── GET /api/v1/deposits/:id ──
  @Get(':id')
  async getDepositById(
    @GetUser('id') userId: string,
    @Param('id') depositId: string,
  ) {
    return this.depositService.getDepositById(userId, depositId);
  }

  // ── POST /api/v1/deposits ──
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('attachment', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = 'uploads/receipts';
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          const uniqueSuffix = `${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 5)}`;
          cb(null, `receipt-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'application/pdf',
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only JPG, PNG, WEBP, PDF files allowed',
            ),
            false,
          );
        }
      },
    }),
  )
  async createDeposit(
    @GetUser('id') userId: string,
    @Body() dto: CreateDepositDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.depositService.createDeposit(userId, dto, file);
  }
}