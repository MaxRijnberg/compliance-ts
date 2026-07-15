import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadGatewayException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  PortAbleLoginResponse,
  PortAbleSearchResponse,
  PortAbleResponse,
  PortAbleEnvelope,
  PortAbleAttachmentItem,
  PortAblePartyData,
} from './portable.types';
import { BlReader, BL_READER, BL_PATTERN } from './bl-reader.interface';
import { decodeHtmlEntities } from './html-entities.util';

const IGNORED_PARTY_VALUES = new Set(['', '-', ' - ']);
const PORTCALL_ACTIVE_STATUSES = [
  'Expected',
  'Berthed',
  'Arrived',
  'Anchored',
  'Sailed',
  'Cancelled',
];

@Injectable()
export class PortAbleService {
  private readonly logger = new Logger(PortAbleService.name);
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;
  private readonly timeoutMs: number;

  // Shared login credential — safe to cache at service level, unlike the
  // per-search data below.
  private authToken: string | null = null;
  private loginPromise: Promise<string> | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(BL_READER) private readonly blReader: BlReader,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>('PORTABLE_BASE_URL');
    this.email = this.configService.getOrThrow<string>('PORTABLE_EMAIL');
    this.password = this.configService.getOrThrow<string>('PORTABLE_PASSWORD');
    this.timeoutMs = this.configService.get<number>('API_TIMEOUT', 10000);
  }

  /**
   * Finds all parties and attachments for a portcall and returns them.
   *
   * Unlike the Python version, this does NOT store results on `this` —
   * per-search data can't live on a singleton service without leaking
   * between concurrent users. Everything is built and returned locally.
   */
  async findPartiesFromPortcall(portcallNum: string): Promise<PortAblePartyData> {
    const parties: Record<string, Set<string>> = {};
    const otherParties = new Set<string>();
    const attachments: Record<string, string> = {};

    const addRole = (name: string | undefined | null, role: string) => {
      if (!name || IGNORED_PARTY_VALUES.has(name)) return;
      if (!parties[name]) parties[name] = new Set();
      parties[name].add(role);
    };

    const { id: portcallId, cargoConsignee, cargoShipper } =
      await this.getPortcallSearchId(portcallNum);
    for (const name of cargoConsignee) addRole(name, 'Cargo Consignee');
    for (const name of cargoShipper) addRole(name, 'Cargo Shipper');

    const response = await this.getPortcallData(portcallId);

    addRole(response.principal?.name, 'Principal');
    // After some testing, husbandry appears to be optional
    if (response.husbandry) addRole(response.husbandry.name, 'Husbandry');
    addRole(response.daOwner?.name, 'DA Owner');

    for (const party of response.otherPartiesList ?? []) {
      if (!(party.name in parties) && !party.name.startsWith('LBH ')) {
        otherParties.add(party.name);
      }
    }
    for (const party of response.portablePartiesList ?? []) {
      if (!(party.name in parties) && !party.name.startsWith('LBH ')) {
        otherParties.add(party.name);
      }
    }
    for (const item of response.attachmentsList ?? []) {
      attachments[item.filename] = item.url;
    }

    const vesselName = response.vessel.name;
    const vesselImo = response.vessel.imo;

    const bl = await this.getBl(response.attachmentsList ?? []);

    if (bl) {
      let blParties: Record<string, string>;
      try {
        blParties = await this.blReader.getPartiesFromBl(bl.content);
      } catch (error) {
        this.logger.error(`BL party extraction failed: ${this.describeError(error)}`);
        throw error;
      }
      for (const [party, role] of Object.entries(blParties)) {
        addRole(party, role);
      }
    }

    if (Object.keys(parties).length + otherParties.size === 0) {
      const message = `No parties found in PortAble for portcall ${portcallNum}`;
      this.logger.error(message);
      throw new NotFoundException(message);
    }

    return { parties, otherParties, attachments, vesselName, vesselImo, bl };
  }

  /**
   * Get the portcall ID and its cargo consignee/shipper names based on the
   * portcall number (e.g. UY260022, NL240190, CN250453).
   */
  async getPortcallSearchId(portcallNum: string): Promise<{
    id: string;
    cargoConsignee: string[];
    cargoShipper: string[];
  }> {
    this.logger.log(`Looking for ${portcallNum} in PortAble`);

    const payload = {
      filtersList: [
        { field: 'status', comparison: '=', value: PORTCALL_ACTIVE_STATUSES },
        { value: [portcallNum], comparison: '=', field: 'uniqueNumber' },
      ],
      order: { field: 'eta', direction: 10 },
    };

    const envelope = await this.authenticatedRequest<PortAbleSearchResponse>({
      method: 'POST',
      url: this.url('portcall/search'),
      data: payload,
    });

    if (!envelope.status) {
      const message = 'PortAble search request returned status: false';
      this.logger.error(message);
      throw new BadGatewayException(message);
    }

    if (envelope.data.total === 0) {
      const message = `Query was successful, but portcall ${portcallNum} does not exist.`;
      this.logger.error(message);
      throw new NotFoundException(message);
    }

    if (envelope.data.total > 1) {
      const message = `Query was successful, but portcall ${portcallNum} is not unique.`;
      this.logger.error(message);
      throw new ConflictException(message);
    }

    const entry = envelope.data.entries[0];
    if (!entry?.id) {
      const message = `No ID found for portcall ${portcallNum}`;
      this.logger.error(message);
      throw new InternalServerErrorException(message);
    }

    this.logger.log(`Portcall ${portcallNum} found and extracted ID`);
    return {
      id: entry.id,
      cargoConsignee: entry.cargoConsignee ?? [],
      cargoShipper: entry.cargoShipper ?? [],
    };
  }

  /**
   * Get the full portcall record (found in the URL as the portcall ID),
   * e.g. xvIq4XmgW7QnRCpkSejR.
   */
  async getPortcallData(portcallId: string): Promise<PortAbleResponse> {
    const envelope = await this.authenticatedRequest<
      PortAbleEnvelope<PortAbleResponse>
    >({
      method: 'GET',
      url: this.url(`portcall/${portcallId}`),
    });

    if (!envelope.status) {
      const message = 'PortAble portcall request returned status: false';
      this.logger.error(message);
      throw new BadGatewayException(message);
    }

    return envelope.data;
  }

  /**
   * Looks for the BL in the attachments list via BL_PATTERN. If multiple
   * are found, the most recent one (by createdAt) is used.
   */
  private async getBl(
    attachments: PortAbleAttachmentItem[],
  ): Promise<{ filename: string; content: Buffer } | null> {
    if (attachments.length === 0) {
      this.logger.warn('No attachments found for this Portcall');
      return null;
    }

    let blUrl = '';
    let blName = '';
    let blDate = new Date(0);

    for (const item of attachments) {
      if (BL_PATTERN.test(item.filename)) {
        this.logger.log(`${item.filename} was deduced to be (one of) the BLs.`);
        const createdAt = new Date(item.createdAt);
        if (createdAt > blDate) {
          blName = item.filename;
          blUrl = item.url;
          blDate = createdAt;
        }
      } else {
        this.logger.debug(`No match in '${item.filename}'`);
      }
    }

    if (blUrl !== '') {
      this.logger.log(`BL found: ${blName}`);
      const content = await this.downloadAttachment(blUrl);
      return { filename: blName, content };
    }

    const names = attachments.map((a) => a.filename);
    this.logger.warn(`No BL found in ${names.join(', ')}`);
    return null;
  }

  /**
   * Downloads an attachment (e.g. a BL candidate) from its (Google Drive)
   * URL. Public because the screening UI lets users pick any attachment
   * to extract parties from, not just the auto-detected best BL.
   *
   * Note: unauthenticated request, matching the original — no PortAble
   * session headers are sent. A timeout has been added here (the original
   * omitted it for this one call, which looked like an oversight).
   */
  async downloadAttachment(url: string): Promise<Buffer> {
    const decodedUrl = decodeHtmlEntities(url);

    try {
      const response = await firstValueFrom(
        this.httpService.get(decodedUrl, {
          responseType: 'arraybuffer',
          timeout: this.timeoutMs,
        }),
      );
      return Buffer.from(response.data);
    } catch (error) {
      const message = `Failed to download attachment: ${this.describeError(error)}`;
      this.logger.error(message);
      throw new ServiceUnavailableException(message);
    }
  }

  /**
   * Logs into PortAble Agent and caches the token on the service. Only
   * re-runs when the cache is empty or a request comes back 401.
   */
  private async login(): Promise<string> {
    this.logger.log('Logging into PortAble');

    let response;
    try {
      response = await firstValueFrom(
        this.httpService.post<PortAbleLoginResponse>(
          this.url('auth/login'),
          { email: this.email, password: this.password },
          {
            headers: { accept: 'application/json', 'Content-Type': 'application/json' },
            timeout: this.timeoutMs,
          },
        ),
      );
    } catch (error) {
      const message = `Error logging into PortAble: ${this.describeError(error)}`;
      this.logger.error(message);
      throw new ServiceUnavailableException(message);
    }

    const envelope = response.data;
    if (!envelope.status) {
      const message = 'PortAble login returned status: false';
      this.logger.error(message);
      throw new BadGatewayException(message);
    }
    if (!envelope.data?.accessToken) {
      const message = `'accessToken' not in response data (${JSON.stringify(envelope.data)})`;
      this.logger.error(message);
      throw new InternalServerErrorException(message);
    }

    this.authToken = envelope.data.accessToken;
    this.logger.log('Successful login into PortAble');
    return this.authToken;
  }

  private async ensureAuthToken(): Promise<string> {
    if (this.authToken) return this.authToken;
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => {
        this.loginPromise = null;
      });
    }
    return this.loginPromise;
  }

  /**
   * Performs an authenticated PortAble request, retrying once with a
   * fresh login if the token has expired (401). Not present in the
   * original — added because a singleton service will outlive a single
   * Streamlit session and the token will eventually expire.
   */
  private async authenticatedRequest<T>(
    config: AxiosRequestConfig,
    retryOn401 = true,
  ): Promise<T> {
    const token = await this.ensureAuthToken();

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>({
          ...config,
          headers: {
            ...config.headers,
            Authorization: `Bearer ${token}`,
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: this.timeoutMs,
        }),
      );
      return response.data;
    } catch (error) {
      if (retryOn401 && error instanceof AxiosError && error.response?.status === 401) {
        this.authToken = null;
        return this.authenticatedRequest<T>(config, false);
      }
      const message = `PortAble request failed: ${this.describeError(error)}`;
      this.logger.error(message);
      throw new ServiceUnavailableException(message);
    }
  }

  private url(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  private describeError(error: unknown): string {
    if (error instanceof AxiosError) {
      return `${error.response?.status ?? ''} ${error.message}`.trim();
    }
    return error instanceof Error ? error.message : String(error);
  }
}
