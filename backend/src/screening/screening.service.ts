import { Injectable, Logger } from '@nestjs/common';
import { PortAbleService } from '../portable/portable.service';
import { PascalService } from '../pascal/pascal.service';
import { SeaSearcherService } from '../seasearcher/seasearcher.service';
import { BlReaderService } from '../portable/bl-reader.service';
import { BL_PATTERN } from '../portable/bl-reader.interface';
import { ArchiveClientResult } from '../pascal/pascal.types';
import {
  ScreeningAttachmentRefDto,
  ScreeningInitResponseDto,
  AttachmentExtractionResultDto,
  RunScreeningResponseDto,
  ScreeningPartyResultDto,
} from './screening.dto';

@Injectable()
export class ScreeningService {
  private readonly logger = new Logger(ScreeningService.name);

  constructor(
    private readonly portAbleService: PortAbleService,
    private readonly pascalService: PascalService,
    private readonly seaSearcherService: SeaSearcherService,
    private readonly blReaderService: BlReaderService,
  ) {}

  /**
   * Loads a portcall's parties, other parties, and attachments (with a
   * likelyBl hint per attachment for the checkbox default state).
   */
  async getInitialData(portcallNum: string): Promise<ScreeningInitResponseDto> {
    const result = await this.portAbleService.findPartiesFromPortcall(portcallNum);

    const parties: Record<string, string[]> = Object.fromEntries(
      Object.entries(result.parties).map(([name, roles]) => [name, [...roles]]),
    );

    const attachments = Object.entries(result.attachments).map(([name, url]) => ({
      name,
      url,
      likelyBl: BL_PATTERN.test(name),
    }));

    return {
      parties,
      otherParties: [...result.otherParties],
      attachments,
      vessel: { name: result.vesselName, imo: result.vesselImo },
    };
  }

  /**
   * Downloads and extracts parties from each selected attachment
   * independently. Per-attachment failures are captured rather than
   * aborting the batch, matching the original's try/except-per-attachment
   * + st.warning behavior. The frontend is responsible for merging these
   * results into its own party list (same as build_all_parties did in
   * Streamlit) — this stays stateless.
   */
  async extractPartiesFromAttachments(
    attachments: ScreeningAttachmentRefDto[],
  ): Promise<AttachmentExtractionResultDto[]> {
    const results: AttachmentExtractionResultDto[] = [];

    for (const { name, url } of attachments) {
      try {
        const content = await this.portAbleService.downloadAttachment(url);
        const parties = await this.blReaderService.getPartiesFromBl(content);
        results.push({ name, parties });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to process ${name}: ${message}`);
        results.push({ name, error: message });
      }
    }

    return results;
  }

  /**
   * Runs sanctions screening for a list of party names (via Pascal) and
   * the vessel (via SeaSearcher).
   */
  async runScreening(
    parties: string[],
    vessel: { name: string; imo: string },
  ): Promise<RunScreeningResponseDto> {
    const partyResults: ScreeningPartyResultDto[] = [];

    for (const party of parties) {
      const searchResult = await this.pascalService.getCaseIfExists(party);

      if (!searchResult.found) {
        partyResults.push({
          party,
          found: false,
          reason: searchResult.reason,
          message: searchResult.message,
          ...(searchResult.reason === 'multiple' ? { cases: searchResult.cases } : {}),
        });
        continue;
      }

      const { status, caseUrl } = this.pascalService.getSanctions(searchResult.case);
      partyResults.push({ party, found: true, status, caseUrl });
    }

    const sanctioned = await this.seaSearcherService.isSanctioned(vessel.imo);

    return {
      partyResults,
      vessel: { name: vessel.name, imo: vessel.imo, sanctioned },
    };
  }

  archiveClient(portcallNumber: string): Promise<ArchiveClientResult> {
    return this.pascalService.archiveClient(portcallNumber);
  }
}
