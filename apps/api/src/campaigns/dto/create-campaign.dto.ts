import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsUUID('4')
  templateId!: string;

  @IsUUID('4')
  contactGroupId!: string;

  @IsOptional()
  @IsUUID('4')
  whatsappAccountId?: string;
}
