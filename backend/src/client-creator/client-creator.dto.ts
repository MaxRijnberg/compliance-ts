import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateClientRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  parties!: string[];

  @IsString()
  clientName!: string;
}
