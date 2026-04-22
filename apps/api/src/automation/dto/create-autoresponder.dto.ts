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

  /** Scope to a specific WhatsApp account. Omit for workspace-wide. */
  @IsOptional()
  @IsUUID()
  whatsappAccountId?: string;

  /**
   * Scope to a specific Facebook Page (Messenger).
   * When set, this rule only fires for messages received on that page.
   * A rule with both whatsappAccountId=null AND facebookPageId=null
   * fires on ALL channels (workspace-wide fallback).
   */
  @IsOptional()
  @IsUUID()
  facebookPageId?: string;

  /** Relative URL to an uploaded media file, e.g. '/uploads/media/abc.jpg'. */
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  /**
   * When true the `response` field is treated as an AI system prompt.
   * The AI generates the reply dynamically instead of sending a static text.
   */
  @IsOptional()
  @IsBoolean()
  useAi?: boolean;
}
