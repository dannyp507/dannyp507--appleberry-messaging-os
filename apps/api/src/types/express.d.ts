import type { Workspace } from '@prisma/client';

export type AuthUser = {
  userId: string;
  email: string;
  organizationId: string;
  workspaceId: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      workspace?: Workspace;
    }
  }
}

export {};
