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

type IgCommentActionType = 'PRIVATE_REPLY' | 'PUBLIC_COMMENT' | 'BOTH';

export class UpdateIgKeywordDto {
  @IsString()
  @IsNotEmpty()
  keyword!: string;

  @IsString()
  @IsOptional()
  matchType?: 'EXACT' | 'CONTAINS';
}

export class UpdateIgAutomationDto {
  @IsString() @IsOptional() instagramAccountId?: string;
  @IsString() @IsOptional() postId?: string;
  @IsString() @IsOptional() postSnippet?: string;
  @IsString() @IsOptional() name?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsIn(['PRIVATE_REPLY', 'PUBLIC_COMMENT', 'BOTH']) @IsOptional() actionType?: IgCommentActionType;
  @IsString() @IsOptional() messageText?: string;
  @IsString() @IsOptional() dmText?: string;
  @IsString() @IsOptional() mediaUrl?: string;
  @IsBoolean() @IsOptional() aiEnabled?: boolean;
  @IsString() @IsOptional() aiSystemPrompt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateIgKeywordDto)
  @IsOptional()
  keywords?: UpdateIgKeywordDto[];
}
