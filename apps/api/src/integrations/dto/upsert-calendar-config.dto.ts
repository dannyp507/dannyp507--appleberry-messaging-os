import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpsertCalendarConfigDto {
  @IsString()
  @IsOptional()
  calendarId?: string;

  @IsString()
  businessEmail: string;

  @IsInt()
  @Min(15)
  @IsOptional()
  slotDuration?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  bookingWindowDays?: number;
}
