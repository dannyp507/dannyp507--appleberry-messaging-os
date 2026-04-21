import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpsertAiSettingsDto {
  @IsOptional()
  @IsIn(['openai', 'gemini'])
  defaultProvider?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  openaiApiKey?: string;

  @IsOptional()
  @IsString()
  openaiModel?: string;

  @IsOptional()
  @IsString()
  geminiApiKey?: string;

  @IsOptional()
  @IsString()
  geminiModel?: string;
}
