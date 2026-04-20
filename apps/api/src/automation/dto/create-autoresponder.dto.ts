import { AutoresponderMatchType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

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

  @IsString()
  @MinLength(1)
  response!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
