import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { RolesGuard }   from 'src/modules/auth/guard/roles.guard';
import { Roles }        from 'src/modules/auth/decorator/roles.decorator';
import { AdminDepositService } from 'src/modules/admin/services/admin-deposit.service';

@Controller('admin/deposits')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminDepositController {
  constructor(private readonly depositService: AdminDepositService) {}

  // ── GET ALL ──
  @Get()
  getAllDeposits(@Query() query: any) {
    return this.depositService.getAllDeposits(query);
  }

  // ── GET SINGLE ──
  @Get(':id')
  getDepositById(@Param('id') id: string) {
    return this.depositService.getDepositById(id);
  }

  // ── MANUAL CREATE ──
  @Post('manual')
  createManualDeposit(@Body() body: any, @Req() req: any) {
    return this.depositService.createManualDeposit(
      {
        userId:        body.userId,
        amount:        Number(body.amount),
        currency:      body.currency   || 'SAR',
        method:        body.method     || 'MANUAL',
        transactionId: body.transactionId || null,
        reference:     body.reference  || null,
        notes:         body.notes      || null,
        status:        body.status     || 'PENDING',
      },
      req.user.id,
      req.user.email,
    );
  }

  // ── APPROVE ──
  @Post(':id/approve')
  approveDeposit(@Param('id') id: string, @Req() req: any) {
    return this.depositService.approveDeposit(id, req.user.id, req.user.email);
  }

  // ── REJECT ──
  @Post(':id/reject')
  rejectDeposit(
    @Param('id') id: string,
    @Body() body: { rejectionNote: string },
    @Req() req: any,
  ) {
    return this.depositService.rejectDeposit(
      id,
      req.user.id,
      req.user.email,
      body.rejectionNote,
    );
  }

  // ── ATTACHMENT UPLOAD ──
  @Post(':id/attachment')
  @UseInterceptors(
    FileInterceptor('attachment', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'receipts'),
        filename: (_req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `receipt-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPG, PNG, WEBP, PDF allowed'), false);
        }
      },
    }),
  )
  uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // File path store করবো uploads/receipts/filename.jpg format এ
    const filePath = `/uploads/receipts/${file.filename}`;
    return this.depositService.uploadAttachment(id, filePath);
  }
}