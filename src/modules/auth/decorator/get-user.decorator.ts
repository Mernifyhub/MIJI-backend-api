// src/auth/decorator/get-user.decorator.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common'; 

export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // যদি specific field চাও, যেমন @GetUser('email')
    if (data) {
      return user?.[data];
    }

    return user;
  },
);