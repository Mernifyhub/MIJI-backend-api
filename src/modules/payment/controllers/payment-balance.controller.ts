import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CurrentUserType } from 'src/common/types/current-user.type';
import { PaymentBalanceService } from '../services/payment-balance.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PaymentBalanceController {
  constructor(
    private readonly paymentBalanceService: PaymentBalanceService,
  ) {}

  @Get('balance')
  async getBalance(@CurrentUser() user: CurrentUserType) {
    const balanceData =
      await this.paymentBalanceService.getAgentBalance(
        user.actualUserId,
      );

    return {
      success: true,
      balance: balanceData.balance,
      walletBalance: balanceData.walletBalance,
      storedBalance: balanceData.storedBalance,
      computedBalance: balanceData.computedBalance,
      creditLimit: balanceData.creditLimit,
      usedLimit: balanceData.usedLimit,
      availableCredit: balanceData.availableCredit,
      remainingCredit: balanceData.remainingCredit,
      totalAvailable: balanceData.totalAvailable,
      currency: 'SAR',
    };
  }
}