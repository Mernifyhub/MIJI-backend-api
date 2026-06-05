// src/auth/dto/auth-response.dto.ts

import { Role, AgentStatus, AgentTier } from '@prisma/client';

export class UserPayloadDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: AgentStatus;
  tier: AgentTier;
  agentId: string | null;
  agentName: string;
}

export class AuthResponseDto {
  message: string;
  accessToken: string;
  refreshToken: string;
  user: UserPayloadDto;
}