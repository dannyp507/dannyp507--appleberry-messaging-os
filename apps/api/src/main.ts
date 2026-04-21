import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import * as fs from 'fs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateProductionEnv } from './config/env.validation';

async function bootstrap() {
  validateProductionEnv();

  const app = await NestFactory.create(AppModule, { rawBody: true });

  const expressApp = app.getHttpAdapter().getInstance();
  if (process.env.TRUST_PROXY === '1' && typeof expressApp?.set === 'function') {
    expressApp.set('trust proxy', 1);
  }

  // Serve uploaded media files (images, videos, documents) at /uploads/*
  const uploadsBase = process.env.UPLOADS_BASE_DIR ?? '/app/uploads';
  fs.mkdirSync(uploadsBase, { recursive: true });
  expressApp.use('/uploads', express.static(uploadsBase));

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(cookieParser());

  const corsOrigins =
    process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ??
    ['http://localhost:3000'];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}
bootstrap();
