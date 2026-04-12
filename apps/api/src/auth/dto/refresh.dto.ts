import { IsOptional, IsString, MinLength } from 'class-validator';

/** Body optional when refresh token is sent via httpOnly cookie. */
export class RefreshDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  refreshToken?: string;
}
