import { Injectable, Logger } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import { pdfToPng } from 'pdf-to-png-converter';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { BlReader } from './bl-reader.interface';

const PDF_SIGNATURE = '%PDF';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// The section labels findValue() searches for. Also used to recognize when
// scanning has run into the *next* section's label instead of a value.
const SECTION_LABELS = ['Shipper', 'Consignor', 'Consignee', 'Notify address', 'Notify'];

/**
 * npm dependencies: pdf-parse, pdf-to-png-converter, tesseract.js
 */
@Injectable()
export class BlReaderService implements BlReader {
  private readonly logger = new Logger(BlReaderService.name);

  /**
   * Finds the parties in a BL (Bill of Lading).
   * Returns e.g. { "Acme Shipping Co": "Cargo Shipper", "Acme Imports": "Cargo Consignee" }
   */
  async getPartiesFromBl(blContent: Buffer): Promise<Record<string, string>> {
    if (blContent.subarray(0, 4).toString('latin1') === PDF_SIGNATURE) {
      return this.extractFromPdf(blContent);
    }

    if (blContent.subarray(0, 8).equals(PNG_SIGNATURE)) {
      return this.extractFromPng(blContent);
    }

    this.logger.warn('BL cannot be read.');
    return {};
  }

  private async extractFromPdf(fileBytes: Buffer): Promise<Record<string, string>> {
    const { text } = await pdfParse(fileBytes);
    if (text && text.trim()) {
      return this.extractPartiesFromText(text);
    }

    this.logger.warn('PDF has no extractable text (likely a scanned BL); falling back to OCR.');
    return this.extractFromScannedPdf(fileBytes);
  }

  private async extractFromScannedPdf(fileBytes: Buffer): Promise<Record<string, string>> {
    const pages = await pdfToPng(fileBytes, { disableFontFace: true });
    if (!pages.length) {
      this.logger.warn('Scanned PDF could not be rasterized for OCR.');
      return {};
    }

    const images = pages
      .map((page) => page.content)
      .filter((content): content is Buffer => content !== undefined);
    const text = await this.ocrImages(images);
    return this.extractPartiesFromText(text);
  }

  private async extractFromPng(fileBytes: Buffer): Promise<Record<string, string>> {
    const text = await this.ocrImages([fileBytes]);
    return this.extractPartiesFromText(text);
  }

  /**
   * OEM.DEFAULT (3) + PSM.SINGLE_BLOCK (6) mirror the original
   * `--oem 3 --psm 6` pytesseract config. A worker is spun up per call for
   * simplicity/correctness — if BL volume is high, consider a shared
   * worker pool instead of creating one per request.
   */
  private async ocrImages(images: Buffer[]): Promise<string> {
    const worker = await createWorker('eng', OEM.DEFAULT);
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const texts: string[] = [];
      for (const image of images) {
        const {
          data: { text },
        } = await worker.recognize(image);
        texts.push(text);
      }
      return texts.join('\n');
    } finally {
      await worker.terminate();
    }
  }

  private extractPartiesFromText(rawText: string): Record<string, string> {
    let text = rawText.replace(/\r/g, '\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n+/g, '\n').trim();
    const lines = text.split('\n');

    // Finds the first non-empty line after a label (Shipper, Consignee, Notify, etc.)
    const findValue = (labels: string[]): string | null => {
      for (let i = 0; i < lines.length; i++) {
        for (const label of labels) {
          if (new RegExp(`\\b${label}\\b`, 'i').test(lines[i])) {
            for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
              const value = lines[j].trim();
              if (!value) continue;
              // Stop (no value found) if we've run into the next section's
              // label instead of a value — a party name in plain title case
              // (e.g. "Acme Shipping Co") must NOT be mistaken for one of
              // these, so match against the known labels specifically
              // rather than a generic title-case pattern.
              if (SECTION_LABELS.some((sectionLabel) => new RegExp(`^${sectionLabel}\\b`, 'i').test(value))) {
                break;
              }
              return value;
            }
          }
        }
      }
      return null;
    };

    const shipper = findValue(['Shipper', 'Consignor']);
    let consignee = findValue(['Consignee']);
    const notify = findValue(['Notify address', 'Notify']);

    // Normalize consignee ("to the order of ...")
    if (consignee) {
      consignee = consignee.replace(/to the order of /i, '');
    }

    // Mirrors the Python dict-literal construction order: if two labels
    // resolve to the same name, the later key wins (notify > consignee > shipper).
    const parties: Record<string, string> = {};
    if (shipper) parties[shipper] = 'Cargo Shipper';
    if (consignee) parties[consignee] = 'Cargo Consignee';
    if (notify) parties[notify] = 'Notify';

    return parties;
  }
}
