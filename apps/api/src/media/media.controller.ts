import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { Workspace } from '@prisma/client';
import { MediaService, MAX_UPLOAD_BYTES } from './media.service';

@Controller('media')
@UseGuards(WorkspaceContextGuard, RolesGuard)
@Roles('owner', 'admin', 'agent')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Upload and compress an image. Accepts multipart/form-data with field "file". */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @CurrentWorkspace() workspace: Workspace,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.media.upload(workspace.id, file);
  }

  /** List all media files for this workspace. */
  @Get()
  list(@CurrentWorkspace() workspace: Workspace) {
    return this.media.list(workspace.id);
  }

  /** Delete a media file by DB ID. */
  @Delete(':id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.media.remove(workspace.id, id);
  }
}
