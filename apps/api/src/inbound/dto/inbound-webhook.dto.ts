import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class InboundWebhookDto {
  @IsUUID('4')
  whatsappAccountId!: string;

  @IsString()
  @MinLength(5)
  from!: string;

  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  externalMessageId?: string;
}
