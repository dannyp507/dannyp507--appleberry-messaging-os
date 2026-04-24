import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ContactFormDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  subject: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  message: string;
}
