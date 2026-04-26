import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsInt, Min, Max } from 'class-validator';

export class UpsertGoogleSheetsSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  spreadsheetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sheetName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  appointmentSheetName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  calendarId?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  appointmentDurationMins?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
