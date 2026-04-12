import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Role slugs, e.g. owner, admin, agent */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
