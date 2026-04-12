import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Workspace } from '@prisma/client';

export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Workspace => {
    const request = ctx.switchToHttp().getRequest<{ workspace: Workspace }>();
    return request.workspace;
  },
);
