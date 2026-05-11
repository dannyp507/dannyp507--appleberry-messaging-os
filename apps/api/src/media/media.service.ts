import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

/** Accepted input mime types */
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

/** Max upload size before compression (10 MB) */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Target max dimension after resize */
const MAX_DIMENSION = 1200;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get uploadsDir(): string {
    return this.config.get<string>('UPLOADS_BASE_DIR') ?? path.join(process.cwd(), 'uploads');
  }

  private get publicUrl(): string {
    return this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3001';
  }

  /** Compress and save an uploaded image, then persist the DB record. */
  async upload(
    workspaceId: string,
    file: Express.Multer.File,
  ) {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, GIF, HEIC.`,
      );
    }

    // Ensure the workspace uploads directory exists
    const workspaceDir = path.join(this.uploadsDir, workspaceId);
    await fs.mkdir(workspaceDir, { recursive: true });

    // Compress with sharp
    // GIFs: keep as-is (sharp strips animation), output WebP
    // Everything else: JPEG q80, max 1200px
    const storedName = `${randomUUID()}.jpg`;
    const destPath = path.join(workspaceDir, storedName);

    let compressed: Buffer;
    try {
      compressed = await sharp(file.buffer)
        .rotate() // auto-rotate from EXIF
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
    } catch (err) {
      this.logger.error(`sharp compression failed: ${String(err)}`);
      throw new BadRequestException('Could not process image. Please try a different file.');
    }

    await fs.writeFile(destPath, compressed);

    const url = `${this.publicUrl}/uploads/${workspaceId}/${storedName}`;

    const media = await this.prisma.workspaceMedia.create({
      data: {
        workspaceId,
        originalName: file.originalname,
        storedName,
        mimeType: 'image/jpeg',
        sizeBytes: compressed.length,
        url,
      },
    });

    this.logger.log(
      `Uploaded media ${media.id} for workspace ${workspaceId}: ` +
        `${file.originalname} → ${storedName} ` +
        `(${Math.round(file.size / 1024)}KB → ${Math.round(compressed.length / 1024)}KB)`,
    );

    return media;
  }

  /** List all media for a workspace, newest first. */
  list(workspaceId: string) {
    return this.prisma.workspaceMedia.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Delete a media record and its file from disk. */
  async remove(workspaceId: string, id: string) {
    const media = await this.prisma.workspaceMedia.findFirst({
      where: { id, workspaceId },
    });
    if (!media) throw new NotFoundException('Media not found');

    // Delete file from disk (non-fatal if already missing)
    const filePath = path.join(this.uploadsDir, workspaceId, media.storedName);
    await fs.unlink(filePath).catch((err) => {
      this.logger.warn(`Could not delete file ${filePath}: ${String(err)}`);
    });

    await this.prisma.workspaceMedia.delete({ where: { id } });
    return { deleted: true };
  }
}
