import { AutoresponderMatchType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAutoresponderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @MinLength(1)
  keyword!: string;

  @IsOptional()
  @IsEnum(AutoresponderMatchType)
  matchType?: AutoresponderMatchType;

  @IsString()
  @MinLength(1)
  response!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Scope this rule to a specific WhatsApp account. Omit to apply workspace-wide. */
  @IsOptional()
  @IsUUID()
  whatsappAccountId?: string;
}
