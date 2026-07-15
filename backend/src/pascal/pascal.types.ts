export interface PascalHitCounts {
  positive: { sanctions: number; [key: string]: number };
  unresolved: { sanctions: number; [key: string]: number };
  [key: string]: unknown;
}

/**
 * A single case as returned by Pascal's /cases/searches endpoint.
 * Renamed from the Python `PascalResponse` alias to `PascalCase`,
 * since this represents one case object, not a full API response envelope.
 */
export interface PascalCase {
  uuid: string;
  status: string;
  hit_counts: PascalHitCounts;
  [key: string]: unknown;
}

export interface PascalCaseSearchResponse {
  meta: { total: number };
  data: PascalCase[];
}

/**
 * Bank-search response shape — kept separate from PascalCaseSearchResponse
 * because the original code reads `data` as a single object here, not an
 * array. Confirm against a real response before relying on this.
 */
export interface PascalBankSearchResponse {
  meta: { total: number };
  data: { name: string };
}

export interface PascalCaseLink {
  label: string;
  url: string;
}

export type PascalCaseSearchResult =
  | { found: true; case: PascalCase }
  | { found: false; reason: 'not_found' | 'archived'; message: string }
  | {
      found: false;
      reason: 'multiple';
      message: string;
      cases: PascalCaseLink[];
    };

export enum PascalSanctionsStatus {
  None = 0,
  Unresolved = 1,
  Found = 2,
}

export interface PascalSanctionsResult {
  status: PascalSanctionsStatus;
  caseUrl: string;
}
