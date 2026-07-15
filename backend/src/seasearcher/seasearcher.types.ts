export interface SeaSearcherTokenResponse {
  Message: string;
  Payload?: string;
}

export interface SeaSearcherSanctionsItem {
  // The Data.items[] shape from the vesselsanctions_v2 endpoint isn't
  // pinned down yet — extend this once we have a real sample response.
  [key: string]: unknown;
}

export interface SeaSearcherSanctionsResponse {
  IsSuccess: boolean;
  Data?: {
    items: SeaSearcherSanctionsItem[];
  };
}
