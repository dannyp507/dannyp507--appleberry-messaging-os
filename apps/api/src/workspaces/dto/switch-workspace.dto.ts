import { IsUUID } from 'class-validator';

export class SwitchWorkspaceDto {
  @IsUUID('4')
  workspaceId!: string;
}
