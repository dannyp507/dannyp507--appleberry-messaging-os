export type AccessTokenPayload = {
  sub: string;
  email: string;
  organizationId: string;
  workspaceId: string | null;
};

export type RefreshTokenPayload = {
  sub: string;
  email: string;
  organizationId: string;
  workspaceId: string | null;
  typ: 'refresh';
};
