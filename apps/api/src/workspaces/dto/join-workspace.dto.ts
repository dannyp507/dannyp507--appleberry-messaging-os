import { IsUUID } from 'class-validator';

export class JoinWorkspaceDto {
  @IsUUID('4')
  workspaceId!: string;
}
