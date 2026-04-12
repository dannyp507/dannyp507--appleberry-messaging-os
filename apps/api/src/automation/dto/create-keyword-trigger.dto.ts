import { KeywordActionType, KeywordMatchType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateKeywordTriggerDto {
  @IsString()
  @MinLength(1)
  keyword!: string;

  @IsOptional()
  @IsEnum(KeywordMatchType)
  matchType?: KeywordMatchType;

  @IsEnum(KeywordActionType)
  actionType!: KeywordActionType;

  @IsUUID('4')
  targetId!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
