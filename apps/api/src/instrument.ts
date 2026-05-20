import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? 'https://32b22cbf7d34c8ca65301bb9e9c70316@o4511423306137600.ingest.us.sentry.io/4511423328813056',
  environment: process.env.NODE_ENV ?? 'development',
});
