import { IsString, MinLength } from 'class-validator';

export class CreateContactGroupDto {
  @IsString()
  @MinLength(2)
  name!: string;
}
