import { IsDateString, IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  title: string;

  /** ISO date-time string for start: "2025-06-15T10:00:00" */
  @IsDateString()
  startTime: string;

  /** Slot duration in minutes — overrides config default */
  @IsInt()
  @Min(15)
  @IsOptional()
  durationMinutes?: number;

  /** Customer name */
  @IsString()
  @IsOptional()
  customerName?: string;

  /** Customer email to add as attendee */
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  /** Optional extra notes appended to the event description */
  @IsString()
  @IsOptional()
  notes?: string;
}
