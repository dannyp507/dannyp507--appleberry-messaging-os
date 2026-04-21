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

  @IsOptional()
  @IsString()
  response?: string;

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

  /** Relative URL to an uploaded media file, e.g. '/uploads/media/abc.jpg'.
   *  When set the bot sends a media message; `response` becomes the caption. */
  @IsOptional()
  @IsString()
  mediaUrl?: string;
}
