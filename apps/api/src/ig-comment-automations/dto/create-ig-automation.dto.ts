import {
  IsString,
  IsBoolean,
  IsOptional,
  IsIn,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

type IgCommentActionType = 'PRIVATE_REPLY' | 'PUBLIC_COMMENT' | 'BOTH';

export class IgKeywordDto {
  @IsString()
  @IsNotEmpty()
  keyword!: string;

  @IsString()
  @IsOptional()
  matchType?: 'EXACT' | 'CONTAINS';
}

export class CreateIgAutomationDto {
  @IsString()
  @IsNotEmpty()
  instagramAccountId!: string;

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
  actionType?: IgCommentActionType;

  @IsString()
  @IsNotEmpty()
  messageText!: string;

  @IsString()
  @IsOptional()
  dmText?: string;

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
  @Type(() => IgKeywordDto)
  @ArrayMinSize(1)
  keywords!: IgKeywordDto[];
}
