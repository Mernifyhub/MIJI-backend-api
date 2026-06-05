// src/modules/agent/controllers/agent-profile.controller.ts
import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CurrentUserType } from 'src/common/types/current-user.type';
import { AgentProfileService } from '../services/agent-profile.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class AgentProfileController {
  constructor(
    private readonly agentProfileService: AgentProfileService,
  ) {}

  // ── GET /api/v1/auth/profile ──
  @Get('auth/profile')
  async getProfile(@CurrentUser() user: CurrentUserType) {
    const profile = await this.agentProfileService.getProfile(
      user.actualUserId,
    );
    return {
      success: true,
      user: profile,
    };
  }

  // ── PUT /api/v1/auth/profile ──
  @Put('auth/profile')
  async updateProfile(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: UpdateProfileDto,
  ) {
    const updatedUser = await this.agentProfileService.updateProfile(
      user.actualUserId,
      dto,
    );
    return {
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser,
    };
  }

  // ── POST /api/v1/auth/profile/change-password ──
  @Post('auth/profile/change-password')
  async changePassword(
    @CurrentUser() user: CurrentUserType,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.agentProfileService.changePassword(
      user.actualUserId,
      dto,
    );
    return {
      success: true,
      message: 'Password changed successfully',
    };
  }

  // ── POST /api/v1/auth/profile/upload-document ──
  @Post('auth/profile/upload-document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './public/uploads',
        filename: (req, file, cb) => {
          const type = (req.body?.type as string) || 'file';
          const ext = extname(file.originalname).toLowerCase();
          const uniqueSuffix = `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

          // user id guard থেকে আসবে
          const userId = (req as any).user?.id || 'unknown';
          cb(null, `${type}-${userId}-${uniqueSuffix}${ext}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
      fileFilter: (req, file, cb) => {
        const type = req.body?.type as string;
        const allowedImages = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
        ];
        const allowedAll = [...allowedImages, 'application/pdf'];
        const allowed = type === 'logo' ? allowedImages : allowedAll;

        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              type === 'logo'
                ? 'Logo must be JPG, PNG or WEBP'
                : 'File must be JPG, PNG, WEBP or PDF',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadDocument(
    @CurrentUser() user: CurrentUserType,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const validTypes = ['nidCopy', 'tradeLicense', 'logo'];
    if (!type || !validTypes.includes(type)) {
      throw new BadRequestException('Invalid document type');
    }

    const publicPath = `/uploads/${file.filename}`;

    await this.agentProfileService.uploadDocument(
      user.actualUserId,
      type as 'nidCopy' | 'tradeLicense' | 'logo',
      publicPath,
    );

    const messages: Record<string, string> = {
      nidCopy: 'NID Copy uploaded successfully',
      tradeLicense: 'Trade License uploaded successfully',
      logo: 'Logo uploaded successfully',
    };

    return {
      success: true,
      message: messages[type],
      path: publicPath,
    };
  }
}