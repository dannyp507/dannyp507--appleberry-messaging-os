import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { AccessTokenPayload } from '../auth/auth.types';
import type { Workspace } from '@prisma/client';

@Controller('api-keys')
@UseGuards(WorkspaceContextGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @Permissions('manage_api_keys')
  create(
    @CurrentWorkspace() ws: Workspace,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeysService.create(ws.id, user.sub, dto);
  }

  @Get()
  @Permissions('manage_api_keys')
  list(@CurrentWorkspace() ws: Workspace) {
    return this.apiKeysService.list(ws.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('manage_api_keys')
  revoke(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.apiKeysService.revoke(ws.id, id);
  }
}
