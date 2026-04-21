import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { AutomationService } from './automation.service';
import { CreateAutoresponderDto } from './dto/create-autoresponder.dto';

const UPLOADS_BASE = process.env.UPLOADS_BASE_DIR ?? '/app/uploads';
const MEDIA_DIR = path.join(UPLOADS_BASE, 'media');

@Controller('autoresponder')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('manage_automation')
export class AutoresponderController {
  constructor(private readonly automation: AutomationService) {}

  @Get('rules')
  list(
    @CurrentWorkspace() workspace: Workspace,
    @Query('account') account?: string,
  ) {
    return this.automation.listAutoresponders(workspace.id, account);
  }

  @Post('rules')
  create(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: CreateAutoresponderDto,
  ) {
    return this.automation.createAutoresponder(workspace.id, dto);
  }

  @Patch('rules/:id')
  update(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAutoresponderDto,
  ) {
    return this.automation.updateAutoresponder(workspace.id, id, dto);
  }

  @Patch('rules/:id/toggle')
  toggle(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.automation.toggleAutoresponder(workspace.id, id);
  }

  @Delete('rules/:id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.automation.deleteAutoresponder(workspace.id, id);
  }

  /** Upload a media file for use with an autoresponder rule.
   *  Returns { url: '/uploads/media/<filename>' } which can be stored as mediaUrl. */
  @Post('media/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdirSync(MEDIA_DIR, { recursive: true });
          cb(null, MEDIA_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          cb(null, `${unique}${ext}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
      fileFilter: (_req, file, cb) => {
        const allowed =
          /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|3gp|mkv|webm|mp3|ogg|opus|m4a|wav|aac|pdf|doc|docx|xls|xlsx|pptx|zip|txt)$/i;
        if (!allowed.test(file.originalname)) {
          return cb(new BadRequestException('File type not allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return { url: `/uploads/media/${file.filename}` };
  }
}
