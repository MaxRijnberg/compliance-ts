import { Injectable, Logger } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { BlReader } from './bl-reader.interface';

const PDF_SIGNATURE = '%PDF';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * npm dependencies: pdf-parse, tesseract.js
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
    return this.extractPartiesFromText(text);
  }

  /**
   * OEM.DEFAULT (3) + PSM.SINGLE_BLOCK (6) mirror the original
   * `--oem 3 --psm 6` pytesseract config. A worker is spun up per call for
   * simplicity/correctness — if BL volume is high, consider a shared
   * worker pool instead of creating one per request.
   */
  private async extractFromPng(fileBytes: Buffer): Promise<Record<string, string>> {
    const worker = await createWorker('eng', OEM.DEFAULT);
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const {
        data: { text },
      } = await worker.recognize(fileBytes);
      return this.extractPartiesFromText(text);
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
              // Stop if next section starts
              if (/^[A-Z][A-Za-z ]+$/.test(value)) continue;
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
