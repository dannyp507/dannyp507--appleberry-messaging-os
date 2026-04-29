import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateDripStepDto {
  @IsInt()
  @Min(1)
  sortOrder: number;

  @IsInt()
  @Min(0)
  @Max(365)
  delayDays: number;

  @IsInt()
  @Min(0)
  @Max(23)
  delayHours: number;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;
}

export class CreateSequenceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDripStepDto)
  steps?: CreateDripStepDto[];
}
