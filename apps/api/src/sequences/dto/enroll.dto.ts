import { IsArray, IsUUID } from 'class-validator';

export class EnrollDto {
  /** IDs of ContactSubscription records to enroll */
  @IsArray()
  @IsUUID(undefined, { each: true })
  subscriptionIds: string[];

  /** WhatsApp account to send drip messages from */
  @IsUUID()
  whatsappAccountId: string;
}
