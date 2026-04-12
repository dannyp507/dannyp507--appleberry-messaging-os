import { IsUUID } from 'class-validator';

export class SetEntryNodeDto {
  @IsUUID('4')
  entryNodeId!: string;
}
