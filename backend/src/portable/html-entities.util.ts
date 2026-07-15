/**
 * Minimal HTML entity decoder — covers the common named entities plus
 * numeric (decimal/hex) references. Equivalent to Python's html.unescape()
 * for the entities likely to appear in a URL. For full HTML entity table
 * coverage, swap this for the `he` npm package.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(?:#0*39|apos);/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    );
}
