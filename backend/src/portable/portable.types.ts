export interface PortAbleEnvelope<T> {
  status: boolean;
  data: T;
}

export interface PortAbleLoginData {
  accessToken: string;
  [key: string]: unknown;
}
export type PortAbleLoginResponse = PortAbleEnvelope<PortAbleLoginData>;

export interface PortAbleSearchEntry {
  id: string;
  cargoConsignee: string[];
  cargoShipper: string[];
  [key: string]: unknown;
}
export type PortAbleSearchResponse = PortAbleEnvelope<{
  total: number;
  entries: PortAbleSearchEntry[];
}>;

export interface PortAbleParty {
  name: string;
  [key: string]: unknown;
}

export interface PortAbleAttachmentItem {
  filename: string;
  url: string;
  createdAt: string; // ISO 8601
  [key: string]: unknown;
}

/**
 * The `data` payload of a `GET portcall/{id}` response
 * (i.e. PortAbleEnvelope<PortAbleResponse>).
 */
export interface PortAbleResponse {
  principal: { name: string; [key: string]: unknown };
  husbandry?: { name: string; [key: string]: unknown } | null;
  daOwner: { name: string; [key: string]: unknown };
  otherPartiesList: PortAbleParty[] | null;
  portablePartiesList: PortAbleParty[] | null;
  vessel: { name: string; imo: string; [key: string]: unknown };
  attachmentsList: PortAbleAttachmentItem[];
  [key: string]: unknown;
}

/** Result of a full findPartiesFromPortcall() run — internal shape (uses Set). */
export interface PortAblePartyData {
  /** party name -> set of roles, e.g. "Cargo Consignee", "Principal" */
  parties: Record<string, Set<string>>;
  otherParties: Set<string>;
  /** filename -> download URL */
  attachments: Record<string, string>;
  vesselName: string;
  vesselImo: string;
  bl: { filename: string; content: Buffer } | null;
}

/**
 * JSON-safe version of PortAblePartyData — Sets don't survive
 * JSON.stringify, so convert with toPortAblePartyDataDto() before
 * returning this from a controller.
 */
export interface PortAblePartyDataDto {
  parties: Record<string, string[]>;
  otherParties: string[];
  attachments: Record<string, string>;
  vesselName: string;
  vesselImo: string;
  blFilename: string | null;
}

export function toPortAblePartyDataDto(
  data: PortAblePartyData,
): PortAblePartyDataDto {
  return {
    parties: Object.fromEntries(
      Object.entries(data.parties).map(([name, roles]) => [name, [...roles]]),
    ),
    otherParties: [...data.otherParties],
    attachments: data.attachments,
    vesselName: data.vesselName,
    vesselImo: data.vesselImo,
    blFilename: data.bl?.filename ?? null,
  };
}
