import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsString()
  @MinLength(5)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];

  @IsOptional()
  @IsString()
  defaultCountry?: string;
}
