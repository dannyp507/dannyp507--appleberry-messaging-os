import { IsString, MinLength } from 'class-validator';

export class CreateTelegramAccountDto {
  @IsString()
  name: string;

  @IsString()
  @MinLength(30)
  botToken: string;
}
