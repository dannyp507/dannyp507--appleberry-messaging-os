import { SetMetadata } from '@nestjs/common';

export const ORG_ROLES_KEY = 'orgRoles';

/** Organization-level role slugs (membership.role.slug) */
export const OrgRoles = (...roles: string[]) => SetMetadata(ORG_ROLES_KEY, roles);
