import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', 'smtp.gmail.com'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.getOrThrow('SMTP_USER'),
        pass: this.config.getOrThrow('SMTP_PASS'),
      },
    });
  }

  async sendOtp(email: string, otp: string): Promise<void> {
    const appName = this.config.get('APP_NAME', 'MIJI');
    const smtpUser = this.config.get('SMTP_USER');

    try {
      await this.transporter.sendMail({
        from: `"${appName}" <${smtpUser}>`,
        to: email,
        subject: `${otp} - Your ${appName} Login OTP`,
        html: `
          <!DOCTYPE html>
          <html>
            <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f7fb;">
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
                <tr>
                  <td align="center">
                    <table width="480" cellpadding="0" cellspacing="0"
                      style="background:#fff;border-radius:16px;overflow:hidden;
                             box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                      
                      <!-- Header -->
                      <tr>
                        <td style="background:linear-gradient(135deg,#0B2545,#1d4e89);
                                   padding:32px;text-align:center;">
                          <h1 style="color:#fff;margin:0;font-size:28px;
                                     letter-spacing:4px;">${appName}</h1>
                          <p style="color:#93c5fd;margin:8px 0 0;
                                    font-size:13px;">B2B Travel Solutions</p>
                        </td>
                      </tr>

                      <!-- Body -->
                      <tr>
                        <td style="padding:40px 32px;">
                          <p style="color:#374151;font-size:15px;margin:0 0 8px;">
                            Your login verification code:
                          </p>

                          <!-- OTP Box -->
                          <div style="background:#f0f4ff;border:2px dashed #1d4e89;
                                      border-radius:12px;padding:24px;
                                      text-align:center;margin:24px 0;">
                            <span style="font-size:42px;font-weight:900;
                                         letter-spacing:12px;color:#0B2545;
                                         font-family:monospace;">
                              ${otp}
                            </span>
                          </div>

                          <!-- Warning -->
                          <table width="100%" cellpadding="0" cellspacing="0"
                            style="background:#fff8ed;border-left:4px solid #f59e0b;
                                   border-radius:0 8px 8px 0;margin:0 0 24px;">
                            <tr>
                              <td style="padding:12px 16px;">
                                <p style="color:#92400e;font-size:13px;margin:0;">
                                  ⚠️ This code expires in 
                                  <strong>5 minutes</strong>. 
                                  Never share it with anyone.
                                </p>
                              </td>
                            </tr>
                          </table>

                          <p style="color:#6b7280;font-size:13px;margin:0;">
                            If you didn't request this code, 
                            please ignore this email.
                          </p>
                        </td>
                      </tr>

                      <!-- Footer -->
                      <tr>
                        <td style="background:#f9fafb;padding:20px 32px;
                                   text-align:center;border-top:1px solid #f3f4f6;">
                          <p style="color:#9ca3af;font-size:12px;margin:0;">
                            © ${new Date().getFullYear()} ${appName}. 
                            All rights reserved.
                          </p>
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });

      this.logger.log(`OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send OTP email to ${email}`,
        error?.stack,
      );
      throw new Error('Failed to send OTP email');
    }
  }
}