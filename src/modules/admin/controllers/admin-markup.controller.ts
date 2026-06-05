// src/modules/admin/controllers/admin-markup.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { GetUser } from 'src/modules/auth/decorator/get-user.decorator';
import { AdminMarkupService } from '../services/admin-markup.service';
import { CreateMarkupDto } from '../dto/markup/create-markup.dto';
import { UpdateMarkupDto } from '../dto/markup/update-markup.dto';

@Controller('admin/markups')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminMarkupController {
  constructor(
    private readonly markupService: AdminMarkupService,
  ) {}

  // GET /api/v1/admin/markups
  @Get()
  async findAll(
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.markupService.findAll({
      type,
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  // GET /api/v1/admin/markups/:id
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.markupService.findOne(id);
  }

  // POST /api/v1/admin/markups
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateMarkupDto,
    @GetUser('id') userId: string,
  ) {
    dto.createdById = userId;
    const markup = await this.markupService.create(dto);
    return { markup };
  }

  // PUT /api/v1/admin/markups/:id
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMarkupDto,
    @GetUser('id') userId: string,
  ) {
    dto.updatedById = userId;
    const markup = await this.markupService.update(id, dto);
    return { markup };
  }

  // DELETE /api/v1/admin/markups/:id
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.markupService.remove(id);
  }

  // PATCH /api/v1/admin/markups/:id/toggle
  @Patch(':id/toggle')
  async toggle(
    @Param('id') id: string,
    @GetUser('id') userId: string,
  ) {
    return this.markupService.toggle(id, userId);
  }

  // POST /api/v1/admin/markups/calculate
  @Post('calculate')
  async calculate(@Body() body: any) {
    return this.markupService.calculate(body);
  }
}