import { ChatbotFlowStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetFlowStatusDto {
  @IsEnum(ChatbotFlowStatus)
  status!: ChatbotFlowStatus;
}
