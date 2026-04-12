import { InboxThreadStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class UpdateInboxThreadDto {
  @IsOptional()
  @IsEnum(InboxThreadStatus)
  status?: InboxThreadStatus;

  @IsOptional()
  @IsUUID('4')
  assignedToId?: string | null;
}
