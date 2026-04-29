import { IsEnum } from 'class-validator';
import { SubscriberStatus } from '@prisma/client';

export class UpdateSubscriberDto {
  @IsEnum(SubscriberStatus)
  status: SubscriberStatus;
}
