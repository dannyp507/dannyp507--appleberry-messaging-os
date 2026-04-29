import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpsertSheetsConfigDto {
  @IsString()
  sheetId: string;

  @IsString()
  @IsOptional()
  sheetName?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  fields?: string[];
}
