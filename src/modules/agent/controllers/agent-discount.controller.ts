import {Body,Controller,Get,Post,Query,UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AgentDiscountService } from '../services/agent-discount.service';
import { CreateDiscountRuleDto } from '../dto/create-discount-rule.dto';

@Controller('agent/discounts')
@UseGuards(JwtAuthGuard)
export class AgentDiscountController {
  constructor(
    private readonly discountService: AgentDiscountService,
  ) {}

  @Get()
  async getDiscounts(@CurrentUser() user: any) {
    return this.discountService.getDiscounts(user.actualUserId);
  }

  @Get('discount-rules')
  async getDiscountRules(
    @Query('showDeleted') showDeleted?: string,
  ) {
    return this.discountService.getDiscountRules(
      showDeleted === 'true',
    );
  }

  @Post('discount-rules')
  async createDiscountRule(
    @Body() dto: CreateDiscountRuleDto,
    @CurrentUser() user: any,
  ) {
    return this.discountService.createDiscountRule(
      dto,
      user.id,
    );
  }
}