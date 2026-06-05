// src/modules/admin/guards/admin-role.guard.ts
import { CanActivate,ExecutionContext,Injectable,ForbiddenException,} from '@nestjs/common';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const allowedRoles = ['ADMIN','MANAGER'];
    const userRole = String(user.role || '').toUpperCase();

    if (!allowedRoles.includes(userRole)) {
      throw new ForbiddenException(
        'Admin or Manager access required',
      );
    }

    return true;
  }
}