import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushKeysDto {
  @IsString() p256dh: string;
  @IsString() auth: string;
}

export class PushSubscribeDto {
  @IsString() endpoint: string;
  @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
  @IsOptional() @IsString() userAgent?: string;
}
