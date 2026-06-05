// src/modules/admin/controllers/admin-discount.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AdminDiscountService } from '../services/admin-discount.service';
import { CreateDiscountRuleDto } from '../dto/create-discount-rule.dto';

@Controller('admin')
export class AdminDiscountController {
  constructor(
    private readonly discountService: AdminDiscountService,
  ) {}

  // GET /api/v1/admin/discount-rules
  @Get('discount-rules')
  async getDiscountRules(
    @Query('showDeleted') showDeleted?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.discountService.getDiscountRules({
      showDeleted: showDeleted === 'true',
      type,
      search,
    });
  }

  // POST /api/v1/admin/discount-rules
  @Post('discount-rules')
  async createDiscountRule(
    @Body() dto: CreateDiscountRuleDto,
  ) {
    return this.discountService.createDiscountRule(dto);
  }

  // PUT /api/v1/admin/discount-rules/:id
  @Put('discount-rules/:id')
  async updateDiscountRule(
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.discountService.updateDiscountRule(id, dto);
  }

  // DELETE /api/v1/admin/discount-rules/:id
  @Delete('discount-rules/:id')
  async deleteDiscountRule(@Param('id') id: string) {
    return this.discountService.deleteDiscountRule(id);
  }

  // GET /api/v1/admin/agents
  @Get('agents')
  async getAgents(@Query('limit') limit?: string) {
    return this.discountService.getAgents(
      Number(limit || 500),
    );
  }
}