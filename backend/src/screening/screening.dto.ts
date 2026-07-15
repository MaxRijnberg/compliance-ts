import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';
import { PascalCaseLink, PascalSanctionsStatus } from '../pascal/pascal.types';

export class ScreeningAttachmentRefDto {
  @IsString()
  name!: string;

  @IsString()
  url!: string;
}

export class ExtractBlPartiesRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScreeningAttachmentRefDto)
  attachments!: ScreeningAttachmentRefDto[];
}

export class RunScreeningRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  parties!: string[];

  @IsString()
  vesselName!: string;

  @IsString()
  vesselImo!: string;
}

// --- Response shapes ---

export interface ScreeningAttachmentDto {
  name: string;
  url: string;
  /** Precomputed via BL_PATTERN — use as the checkbox's default checked state. */
  likelyBl: boolean;
}

export interface ScreeningInitResponseDto {
  /** party name -> roles */
  parties: Record<string, string[]>;
  otherParties: string[];
  attachments: ScreeningAttachmentDto[];
  vessel: { name: string; imo: string };
}

export interface AttachmentExtractionResultDto {
  name: string;
  parties?: Record<string, string>;
  error?: string;
}

export type ScreeningPartyResultDto =
  | { party: string; found: true; status: PascalSanctionsStatus; caseUrl: string }
  | {
      party: string;
      found: false;
      reason: 'not_found' | 'archived' | 'multiple';
      message: string;
      cases?: PascalCaseLink[];
    };

export interface ScreeningVesselResultDto {
  name: string;
  imo: string;
  sanctioned: boolean;
}

export interface RunScreeningResponseDto {
  partyResults: ScreeningPartyResultDto[];
  vessel: ScreeningVesselResultDto;
}
