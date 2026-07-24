export interface ScreeningAttachment {
  name: string;
  url: string;
  likelyBl: boolean;
}

export interface ScreeningInitResponse {
  parties: Record<string, string[]>;
  otherParties: string[];
  attachments: ScreeningAttachment[];
  vessel: { name: string; imo: string };
}

export interface AttachmentExtractionResult {
  name: string;
  parties?: Record<string, string>;
  error?: string;
}

export type ScreeningPartyResult =
  | { party: string; found: true; status: 0 | 1 | 2; caseUrl: string }
  | {
      party: string;
      found: false;
      reason: 'not_found' | 'archived' | 'multiple';
      message: string;
      cases?: { label: string; url: string }[];
    };

export interface ScreeningVesselResult {
  name: string;
  imo: string;
  sanctioned: boolean;
}

export interface RunScreeningResponse {
  partyResults: ScreeningPartyResult[];
  vessel: ScreeningVesselResult;
}

export interface ArchiveClientResult {
  success: boolean;
  message: string;
}

// Ported from the Python SCREENING_STATUSES / SCREENING_COLOURS
export const SCREENING_STATUSES: Record<number, string> = {
  0: '',
  1: '- Unresolved sanction hits',
  2: '- SANCTIONED ENTITY',
};

export const SCREENING_COLOURS: Record<number, string> = {
  0: '#09741B',
  1: '#C08000',
  2: '#9C2007',
};
