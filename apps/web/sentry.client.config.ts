import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? 'https://cc9b229abb21a2d61f9df930bc587732@o4511423306137600.ingest.us.sentry.io/4511423379734528',
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 1,
  debug: false,
});
