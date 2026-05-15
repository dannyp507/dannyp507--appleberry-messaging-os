import {
  IsString,
  IsBoolean,
  IsOptional,
  IsIn,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

type FbCommentActionType = 'PRIVATE_REPLY' | 'PUBLIC_COMMENT' | 'BOTH';

export class KeywordDto {
  @IsString()
  @IsNotEmpty()
  keyword!: string;

  @IsString()
  @IsOptional()
  matchType?: 'EXACT' | 'CONTAINS';
}

export class CreateFbAutomationDto {
  @IsString()
  @IsNotEmpty()
  facebookPageId!: string;

  @IsString()
  @IsOptional()
  postId?: string;

  @IsString()
  @IsOptional()
  postSnippet?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(['PRIVATE_REPLY', 'PUBLIC_COMMENT', 'BOTH'])
  @IsOptional()
  actionType?: FbCommentActionType;

  @IsString()
  @IsNotEmpty()
  messageText!: string;

  /** Separate text for the private Messenger DM. Falls back to messageText if omitted. */
  @IsString()
  @IsOptional()
  dmText?: string;

  @IsString()
  @IsOptional()
  buttonLabel?: string;

  @IsString()
  @IsOptional()
  buttonUrl?: string;

  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @IsBoolean()
  @IsOptional()
  aiEnabled?: boolean;

  @IsString()
  @IsOptional()
  aiSystemPrompt?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeywordDto)
  keywords!: KeywordDto[];
}
