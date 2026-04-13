import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiKeyScope } from '@prisma/client';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsArray()
  @IsEnum(ApiKeyScope, { each: true })
  @IsOptional()
  scopes?: ApiKeyScope[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ipAllowlist?: string[];

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
