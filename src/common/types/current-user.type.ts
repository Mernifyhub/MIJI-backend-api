// src/common/types/current-user.type.ts
export interface CurrentUserType {
  id: string;
  type?: string;
  agentId?: string;
  actualUserId: string;
}