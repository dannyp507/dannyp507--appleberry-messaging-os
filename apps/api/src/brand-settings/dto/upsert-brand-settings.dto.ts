import { IsOptional, IsString } from 'class-validator';

export class UpsertBrandSettingsDto {
  @IsString() @IsOptional() businessName?: string;
  @IsString() @IsOptional() industry?: string;
  @IsString() @IsOptional() toneOfVoice?: string;
  @IsString() @IsOptional() productsServices?: string;
  @IsString() @IsOptional() faqs?: string;
  @IsString() @IsOptional() businessHours?: string;
  @IsString() @IsOptional() contactDetails?: string;
  @IsString() @IsOptional() websiteUrl?: string;
  @IsString() @IsOptional() wordsToUse?: string;
  @IsString() @IsOptional() wordsToAvoid?: string;
  @IsString() @IsOptional() escalationInstructions?: string;
  @IsString() @IsOptional() customInstructions?: string;
}
