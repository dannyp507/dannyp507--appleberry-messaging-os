import { ChannelType, KeywordActionType, KeywordMatchType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateKeywordTriggerDto {
  @IsString()
  @MinLength(1)
  keyword!: string;

  @IsOptional()
  @IsEnum(KeywordMatchType)
  matchType?: KeywordMatchType;

  @IsEnum(KeywordActionType)
  actionType!: KeywordActionType;

  /** Target flow/template ID for START_FLOW and SEND_TEMPLATE actions. */
  @IsOptional()
  @IsUUID('4')
  targetId?: string;

  /** Response text for SEND_MESSAGE action type (supports \\n---\\n multi-bubble). */
  @IsOptional()
  @IsString()
  response?: string;

  /** Scope to a specific channel. Null = fires on all channels. */
  @IsOptional()
  @IsEnum(ChannelType)
  channel?: ChannelType;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
