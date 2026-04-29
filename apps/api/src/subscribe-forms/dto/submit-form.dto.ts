import { IsOptional, IsString, MinLength } from 'class-validator';

export class SubmitFormDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsString()
  @MinLength(7)
  phone!: string;
}
