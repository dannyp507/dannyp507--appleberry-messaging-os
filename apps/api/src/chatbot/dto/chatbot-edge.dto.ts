import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class CreateChatbotEdgeDto {
  @IsUUID('4')
  fromNodeId!: string;

  @IsUUID('4')
  toNodeId!: string;

  @IsOptional()
  @IsObject()
  condition?: Record<string, unknown>;
}
