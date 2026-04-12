import { IsString, IsUUID, MinLength } from 'class-validator';

export class SendInboxMessageDto {
  @IsUUID('4')
  threadId!: string;

  @IsString()
  @MinLength(1)
  message!: string;
}
