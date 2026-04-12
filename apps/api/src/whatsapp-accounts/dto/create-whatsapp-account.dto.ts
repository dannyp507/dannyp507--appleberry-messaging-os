import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { WhatsAppProviderType } from '@prisma/client';

export class CreateWhatsAppAccountDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(WhatsAppProviderType)
  providerType?: WhatsAppProviderType;
}
