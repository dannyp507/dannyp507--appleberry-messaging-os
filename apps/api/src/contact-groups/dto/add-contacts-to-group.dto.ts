import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class AddContactsToGroupDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  contactIds!: string[];
}
