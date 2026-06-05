// src/common/decorators/current-user.decorator.ts
import {createParamDecorator,ExecutionContext,UnauthorizedException,} from '@nestjs/common';
import { CurrentUserType } from 'src/common/types/current-user.type';
type RawUser = {
  id: string;
  type?: string;
  agentId?: string;
};

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserType => {
    const request =
      ctx.switchToHttp().getRequest<{ user?: RawUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }

    const actualUserId =
      user.type === 'subuser'
        ? user.agentId || user.id
        : user.id;

    return {
      ...user,
      actualUserId,
    };
  },
);