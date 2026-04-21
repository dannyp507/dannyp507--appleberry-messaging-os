import { IsString, MinLength } from 'class-validator';

export class OAuthSessionDto {
  @IsString()
  @MinLength(16)
  sessionToken!: string;
}
