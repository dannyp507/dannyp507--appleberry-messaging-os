import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class PositionDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

class NodePositionDto {
  @IsUUID('4')
  id!: string;

  @ValidateNested()
  @Type(() => PositionDto)
  position!: PositionDto;
}

export class UpdateFlowGeometryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NodePositionDto)
  nodes!: NodePositionDto[];
}
