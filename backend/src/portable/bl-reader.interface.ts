export const BL_READER = Symbol('BlReader');

/**
 * Extracts party name -> role from a Bill of Lading file's raw bytes.
 * Async because real implementations need PDF parsing / OCR.
 */
export interface BlReader {
  getPartiesFromBl(blContent: Buffer): Promise<Record<string, string>>;
}

/**
 * Ported from the Python BL_PATTERN (compiled with re.VERBOSE | re.IGNORECASE).
 *
 * NOTE: re.VERBOSE strips ALL unescaped whitespace from the source pattern,
 * including the literal spaces inside "bill (?:of )? lading". After that
 * stripping, branch 2 actually reduces to `bill(?:of)?lading` — i.e. NO
 * separator is allowed between "bill"/"of"/"lading" at all. It matches
 * "BillOfLading.pdf" but NOT "Bill_of_Lading.pdf" or "Bill of Lading.pdf".
 * Branch 3's comment ("CRITICAL FIX: Added separator between 'cargo' and
 * 'doc(s)'") shows this exact gotcha was already caught and fixed there —
 * just seemingly not in branch 2. Ported as-is (bug included) rather than
 * silently changed; flag if real filenames are being missed because of it.
 */
export const BL_PATTERN =
  /\b(?:b(?:o)?ls?(?=[/_\s\-.]|$)|bill(?:of)?lading|cargo(?:\s|_|\/|-)?docs?(?=[/_\s\-.]|$))\b/i;

