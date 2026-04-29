import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class CheckAvailabilityDto {
  /** ISO date string: "2025-06-15" */
  @IsDateString()
  date: string;

  /** 24h hour: 0-23 */
  @IsInt()
  hour: number;

  /** Slot duration in minutes — overrides config default */
  @IsInt()
  @Min(15)
  @IsOptional()
  durationMinutes?: number;
}
