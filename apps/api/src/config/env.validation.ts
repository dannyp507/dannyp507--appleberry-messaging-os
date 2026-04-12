/**
 * Fail fast in production when critical env vars are missing.
 */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  const required = ['JWT_SECRET', 'DATABASE_URL'] as const;
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    throw new Error(
      `[env] Missing required variables in production: ${missing.join(', ')}`,
    );
  }
}
