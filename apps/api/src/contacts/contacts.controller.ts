import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts.query';

const uploadDir = '/tmp/appleberry-uploads';

@Controller('contacts')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('manage_contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  @Get()
  list(
    @CurrentWorkspace() workspace: Workspace,
    @Query() query: ListContactsQueryDto,
  ) {
    return this.contacts.list(workspace.id, query);
  }

  @Post()
  create(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: CreateContactDto,
  ) {
    return this.contacts.create(workspace.id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contacts.remove(workspace.id, id);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, _file, cb) => cb(null, `${randomUUID()}.csv`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  importCsv(
    @CurrentWorkspace() workspace: Workspace,
    @UploadedFile() file: Express.Multer.File,
    @Query('groupId') groupId?: string,
    @Query('defaultCountry') defaultCountry?: string,
  ) {
    if (!file?.path) {
      throw new BadRequestException('file is required');
    }
    return this.contacts.enqueueImport(
      workspace.id,
      file.path,
      groupId,
      defaultCountry,
    );
  }
}
