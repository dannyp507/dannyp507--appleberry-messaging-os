import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

class PositionDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

class NodePositionDto {
  @IsString()
  @IsNotEmpty()
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
