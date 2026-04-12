import { ChatbotNodeType } from '@prisma/client';
import { IsEnum, IsObject, IsOptional } from 'class-validator';

export class CreateChatbotNodeDto {
  @IsEnum(ChatbotNodeType)
  type!: ChatbotNodeType;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  position?: Record<string, unknown>;
}
