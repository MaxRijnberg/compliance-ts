import {
  Injectable,
  Logger,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  PascalCase,
  PascalCaseSearchResponse,
  PascalCaseSearchResult,
  PascalBankSearchResponse,
  PascalClientCreateResponse,
  ClientCreationResult,
  PascalSanctionsResult,
  PascalSanctionsStatus,
  PascalClientSearchResponse,
  ArchiveClientResult,
} from './pascal.types';

const NON_VALID_CASE_STATUSES = ['Archived', 'On hold', 'Preview'];

@Injectable()
export class PascalService {
  private readonly logger = new Logger(PascalService.name);
  private readonly baseUrl: string;
  private readonly searchUrl: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('PASCAL_BASE_URL');
    this.searchUrl = new URL('/api/v1/cases/searches', this.baseUrl).toString();

    this.headers = {
      Authorization: `Bearer ${this.configService.getOrThrow<string>('PASCAL_AUTH_TOKEN')}`,
      OrganizationId: this.configService.getOrThrow<string>('PASCAL_ORG_ID'),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    this.timeoutMs = this.configService.get<number>('API_TIMEOUT', 10000);
  }

  /**
   * Search for a case in Pascal by its name (case-insensitive).
   * See: https://app.pascal.vartion.com/docs#cases-POSTapi-v1-cases-searches
   */
  async getCaseIfExists(name: string): Promise<PascalCaseSearchResult> {
    this.logger.log(`Looking for case ${name} in Pascal`);

    const { data } = await this.postSearch<PascalCaseSearchResponse>({
      with: ['hitCountsPerSource'],
      name,
      allow_duplicate_conversion: true, // merges cases with the same name if one is archived
    });

    if (data.meta.total === 0) {
      const message = `No case in Pascal for '${name}'`;
      this.logger.warn(message);
      return { found: false, reason: 'not_found', message };
    }

    if (data.meta.total > 1) {
      // Duplicate-conversion is requested in the body, but filter archived
      // cases ourselves too in case it's not applied consistently.
      const validCases = data.data.filter(
        (c) => !NON_VALID_CASE_STATUSES.includes(c.status),
      );

      if (validCases.length === 0) {
        const message = `This case for '${name}' is archived in Pascal`;
        this.logger.warn(message);
        return { found: false, reason: 'archived', message };
      }

      if (validCases.length === 1) {
        return { found: true, case: validCases[0] };
      }

      const cases = validCases.map((c, i) => ({
        label: `CASE ${i + 1}`,
        url: `${this.baseUrl}/#/cases/${c.uuid}`,
      }));
      const message = `Multiple cases found for '${name}'`;
      this.logger.warn(`${message}: ${cases.map((c) => c.url).join(', ')}`);
      return { found: false, reason: 'multiple', message, cases };
    }

    return { found: true, case: data.data[0] };
  }

  /**
   * Determine sanctions status for a case previously fetched via
   * getCaseIfExists.
   * - None: no sanctions in Pascal
   * - Unresolved: unresolved sanctions in Pascal
   * - Found: positive sanctions found in Pascal
   */
  getSanctions(pascalCase: PascalCase): PascalSanctionsResult {
    const { hit_counts: hits, uuid } = pascalCase;
    const caseUrl = `${this.baseUrl}/#/cases/${uuid}`;

    if (hits.positive.sanctions > 0) {
      return { status: PascalSanctionsStatus.Found, caseUrl };
    }
    if (hits.unresolved.sanctions > 0) {
      return { status: PascalSanctionsStatus.Unresolved, caseUrl };
    }
    return { status: PascalSanctionsStatus.None, caseUrl };
  }

  /**
   * Look up a bank's name in Pascal by SWIFT code.
   *
   * Note: unlike getCaseIfExists, this reads `data` as a single object
   * rather than an array — matches the original behavior, but this
   * discrepancy between the two endpoints is unconfirmed. Also, unlike
   * getCaseIfExists, multiple-match handling isn't implemented here,
   * matching the original.
   */
  async getBankName(swift: string): Promise<string | null> {
    this.logger.log(`Looking for bank ${swift} in Pascal`);

    const { data } = await this.postSearch<PascalBankSearchResponse>({
      with: ['hitCountsPerSource'],
      per_page: 1,
      aliases: [swift],
      allow_duplicate_conversion: true,
    });

    if (data.meta.total === 0) {
      this.logger.warn(`No bank in Pascal with SWIFT '${swift}'`);
      return null;
    }

    return data.data.name;
  }

  /**
   * Creates a new Client in Pascal and links all existing cases for the
   * provided party names.
   */
  async createClient(
    names: string[],
    clientName?: string,
    labels: string[] = [],
  ): Promise<ClientCreationResult> {
    const resolvedName =
      clientName ??
      `Client - ${names.slice(0, 3).join(', ')}${names.length > 3 ? '...' : ''}`;

    this.logger.log(`Creating client: ${resolvedName} for names: ${names.join(', ')}`);

    const createUrl = new URL('/api/v1/clients', this.baseUrl).toString();
    let clientId: number;

    try {
      const response = await firstValueFrom(
        this.httpService.post<PascalClientCreateResponse>(
          createUrl,
          {
            name: resolvedName,
            labels,
            description: `Automated client created for parties: ${names.join(', ')}`,
          },
          { headers: this.headers, timeout: this.timeoutMs },
        ),
      );

      if (!response.data.id) {
        const message = 'Client created but ID missing in response';
        this.logger.error(message);
        throw new InternalServerErrorException(message);
      }

      clientId = response.data.id;
      this.logger.log(`Successfully created client with ID: ${clientId}`);
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      const detail = this.describeError(error);
      this.logger.error(`Failed to create client: ${detail}`);
      throw new ServiceUnavailableException(`Failed to create client: ${detail}`);
    }

    let linkedCount = 0;
    const failedLinks: string[] = [];

    for (const name of names) {
      const result = await this.getCaseIfExists(name);

      if (!result.found) {
        this.logger.warn(`Skipping '${name}': ${result.message}`);
        failedLinks.push(`${name}: ${result.message}`);
        continue;
      }

      const caseUuid = result.case.uuid;
      const patchUrl = new URL(`/api/v1/cases/${caseUuid}`, this.baseUrl).toString();

      try {
        const patchResponse = await firstValueFrom(
          this.httpService.patch(
            patchUrl,
            { clients: [clientId], monitoring_frequency_sanctions: 1, group_id: 54 },
            { headers: this.headers, timeout: this.timeoutMs },
          ),
        );

        if (patchResponse.status === 200) {
          this.logger.log(`SUCCESS: Linked case ${caseUuid} to client ${clientId}`);
          linkedCount++;
        } else {
          this.logger.error(
            `PATCH failed. Status: ${patchResponse.status}. Body: ${JSON.stringify(patchResponse.data)}`,
          );
          failedLinks.push(`${name}: Update failed. Status ${patchResponse.status}`);
        }
      } catch (error) {
        this.logger.error(`PATCH exception for ${caseUuid}: ${this.describeError(error)}`);
        failedLinks.push(`${name}: Exception during update.`);
      }
    }

    this.logger.log(
      `Client creation complete. ID: ${clientId}. Linked ${linkedCount}/${names.length} cases.`,
    );
    if (failedLinks.length > 0) {
      this.logger.warn(`Failed to link cases for: ${failedLinks.join('; ')}`);
    }

    return { clientId, linkedCount, failedLinks };
  }

  /**
   * Looks up the Pascal client auto-created for a portcall, matching on the
   * "Portcall {pcId}" naming convention used by createClient/the client
   * creator.
   */
  async getClientIdByPortcallId(pcId: string): Promise<number | null> {
    this.logger.log(`Looking for client for portcall ${pcId} in Pascal`);

    const searchUrl = new URL('/api/v1/clients/searches', this.baseUrl).toString();

    try {
      const response = await firstValueFrom(
        this.httpService.post<PascalClientSearchResponse>(
          searchUrl,
          { name: `Portcall ${pcId}`, per_page: 1, page: 1 },
          { headers: this.headers, timeout: this.timeoutMs },
        ),
      );

      return response.data.data[0]?.id ?? null;
    } catch (error) {
      this.logger.error(
        `Client search failed for portcall ${pcId}: ${this.describeError(error)}`,
      );
      return null;
    }
  }

  /**
   * Archives the Pascal client for a portcall's client (found via
   * getClientIdByPortcallId).
   */
  async archiveClient(pcId: string): Promise<ArchiveClientResult> {
    const clientId = await this.getClientIdByPortcallId(pcId);

    if (clientId === null) {
      return { success: false, message: `There was no client found for ${pcId}` };
    }

    const statusUrl = new URL(`/api/clients/${clientId}/status`, this.baseUrl).toString();

    try {
      await firstValueFrom(
        this.httpService.patch(
          statusUrl,
          { status: 'Archived', comment: '', change_case_status: false },
          { headers: this.headers, timeout: this.timeoutMs },
        ),
      );
    } catch (error) {
      const detail = this.describeError(error);
      this.logger.error(`Failed to archive client ${clientId}: ${detail}`);
      return { success: false, message: `An error occurred: ${detail}` };
    }

    return {
      success: true,
      message: `The client for portcall ${pcId} has been successfully archived!`,
    };
  }

  private async postSearch<T>(body: Record<string, unknown>): Promise<{ data: T }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(this.searchUrl, body, {
          headers: this.headers,
          timeout: this.timeoutMs,
        }),
      );
      return { data: response.data };
    } catch (error) {
      const detail = this.describeError(error);
      this.logger.error(`Pascal search request failed: ${detail}`);
      throw new ServiceUnavailableException(
        `Pascal search request failed: ${detail}`,
      );
    }
  }

  private describeError(error: unknown): string {
    if (error instanceof AxiosError) {
      return `${error.response?.status ?? ''} ${error.message}`.trim();
    }
    return error instanceof Error ? error.message : String(error);
  }
}
