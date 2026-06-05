import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AdminManualOperationService } from '../services/admin-manual-operation.service';
import { GetOperationsDto } from 'src/modules/admin/dto/manual-operation/get-operations.dto';
import { CreateOperationDto } from 'src/modules/admin/dto/manual-operation/create-operation.dto';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { AdminRoleGuard } from 'src/modules/admin/guards/admin-role.guard';

@Controller('admin/operations')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminManualOperationController {
  private readonly logger = new Logger(AdminManualOperationController.name);

  constructor(
    private readonly operationService: AdminManualOperationService,
  ) {}

  // ── GET /admin/operations ──
  @Get()
  @HttpCode(HttpStatus.OK)
  async getOperations(@Query() query: GetOperationsDto) {
    this.logger.debug(
      `GET /admin/operations | query: ${JSON.stringify(query)}`
    );
    return this.operationService.getOperations(query);
  }

  // ── GET /admin/operations/agent/:agentId/summary ──
  // NOTE: This must be BEFORE :id to avoid route conflict
  @Get('agent/:agentId/summary')
  @HttpCode(HttpStatus.OK)
  async getAgentSummary(@Param('agentId') agentId: string) {
    this.logger.debug(
      `GET /admin/operations/agent/${agentId}/summary`
    );
    return this.operationService.getAgentSummary(agentId);
  }

  // ── GET /admin/operations/:id ──
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getOperationById(@Param('id') id: string) {
    this.logger.debug(`GET /admin/operations/${id}`);
    return this.operationService.getOperationById(id);
  }

  // ── POST /admin/operations ──
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOperation(
    @Request() req: any,
    @Body() body: CreateOperationDto,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    const adminEmail = req.user?.email;

    this.logger.debug(
      `POST /admin/operations | ` +
      `admin: ${adminEmail} (${adminId}) | ` +
      `body: ${JSON.stringify(body)}`
    );

    return this.operationService.createOperation(adminId, adminEmail, body);
  }
}