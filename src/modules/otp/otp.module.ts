import { Module } from '@nestjs/common';
import { OtpService } from 'src/modules/otp/otp.service';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}