import { IsArray, IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { TemplateType } from '@prisma/client';

export class CreateTemplateDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  @IsString()
  header?: string;

  @IsOptional()
  @IsString()
  footer?: string;

  @IsOptional()
  @IsArray()
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE';
    text: string;
    value?: string; // url or phone number
  }>;

  @IsOptional()
  @IsArray()
  sections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}
