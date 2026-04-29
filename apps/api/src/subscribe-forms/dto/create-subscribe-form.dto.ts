import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSubscribeFormDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID('4')
  whatsappAccountId!: string;

  @IsOptional()
  @IsUUID('4')
  sequenceId?: string;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
