import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(5)
  to!: string;

  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsUUID('4')
  whatsappAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  contactId?: string;
}
