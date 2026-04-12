import { IsString, MinLength } from 'class-validator';

export class CreateChatbotFlowDto {
  @IsString()
  @MinLength(2)
  name!: string;
}
