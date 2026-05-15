import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateKeywordDto {
  @IsString()
  @IsNotEmpty()
  keyword!: string;

  @IsString()
  @IsOptional()
  matchType?: 'EXACT' | 'CONTAINS';
}

/** All fields optional — send only what you want to change.
 *  Providing `keywords` replaces the entire keyword list. */
export class UpdateFbAutomationDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() postId?: string;
  @IsString() @IsOptional() postSnippet?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsString() @IsOptional() actionType?: string;
  @IsString() @IsOptional() messageText?: string;
  @IsString() @IsOptional() buttonLabel?: string;
  @IsString() @IsOptional() buttonUrl?: string;
  @IsString() @IsOptional() mediaUrl?: string;
  @IsBoolean() @IsOptional() aiEnabled?: boolean;
  @IsString() @IsOptional() aiSystemPrompt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateKeywordDto)
  @IsOptional()
  keywords?: UpdateKeywordDto[];
}
