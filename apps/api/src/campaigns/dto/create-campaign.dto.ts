import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsUUID('4')
  templateId!: string;

  @IsUUID('4')
  contactGroupId!: string;

  @IsOptional()
  @IsUUID('4')
  whatsappAccountId?: string;

  /** Minimum delay between messages in milliseconds (default 1 000 ms = 1 s) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600_000)
  minDelayMs?: number;

  /** Maximum delay between messages in milliseconds (default 5 000 ms = 5 s) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600_000)
  maxDelayMs?: number;

  /** ISO date-time string — schedule the campaign to run at this time */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  /** HH:MM — only send messages after this time of day (e.g. "08:00") */
  @IsOptional()
  @IsString()
  sendWindowStart?: string;

  /** HH:MM — only send messages before this time of day (e.g. "18:00") */
  @IsOptional()
  @IsString()
  sendWindowEnd?: string;
}
