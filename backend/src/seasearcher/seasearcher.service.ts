import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  SeaSearcherTokenResponse,
  SeaSearcherSanctionsResponse,
} from './seasearcher.types';

@Injectable()
export class SeaSearcherService {
  private readonly baseUrl: string;
  private readonly tokenUrl: string;
  private readonly sanctionsUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.getOrThrow<string>(
      'SEASEARCHER_BASE_URL',
    );
    this.tokenUrl = `${this.baseUrl}/tokenprovider`;
    this.sanctionsUrl = `${this.baseUrl}/vesselsanctions_v2`;
    this.username = this.configService.getOrThrow<string>(
      'SEASEARCHER_USERNAME',
    );
    this.password = this.configService.getOrThrow<string>(
      'SEASEARCHER_PASSWORD',
    );
    this.timeoutMs = this.configService.get<number>('API_TIMEOUT', 10000);
  }

  /**
   * Retrieves a fresh authorization token.
   *
   * Note: mirrors the original client — a token is requested on every
   * call rather than cached/reused. If you want caching with expiry
   * tracking instead, this is the place to add it.
   */
  private async getAuthToken(): Promise<string> {
    let response;

    try {
      response = await firstValueFrom(
        this.httpService.post<SeaSearcherTokenResponse>(
          this.tokenUrl,
          { username: this.username, password: this.password },
          { timeout: this.timeoutMs },
        ),
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        `Network error during token retrieval: ${this.describeError(error)}`,
      );
    }

    const { data } = response;

    if (data.Message !== 'Success') {
      throw new UnauthorizedException(
        `Authentication failed: ${data.Message}`,
      );
    }

    if (!data.Payload) {
      throw new InternalServerErrorException(
        'Token received but payload is empty.',
      );
    }

    return data.Payload;
  }

  /**
   * Checks whether a vessel with the given IMO is sanctioned.
   *
   * @param imo The IMO number of the vessel (e.g. "9515802").
   */
  async isSanctioned(imo: string): Promise<boolean> {
    const token = await this.getAuthToken();

    try {
      const response = await firstValueFrom(
        this.httpService.get<SeaSearcherSanctionsResponse>(
          this.sanctionsUrl,
          {
            headers: {
              Authorization: token,
              'Content-Type': 'application/json',
            },
            params: { vesselImo: imo },
            timeout: this.timeoutMs,
          },
        ),
      );

      const { data } = response;

      // If items is non-empty, the vessel is sanctioned.
      if (data.IsSuccess) {
        return (data.Data?.items?.length ?? 0) > 0;
      }

      // IsSuccess false but no HTTP error: treat as not sanctioned.
      return false;
    } catch (error) {
      throw this.mapRequestError(error);
    }
  }

  private mapRequestError(error: unknown): Error {
    if (error instanceof AxiosError && error.response) {
      const status = error.response.status;

      if (status === 401) {
        return new UnauthorizedException(
          'Authentication failed (401). Check credentials.',
        );
      }

      if (status === 403) {
        return new ForbiddenException(
          'Forbidden (403). Your subscription may not include this endpoint.',
        );
      }

      return new InternalServerErrorException(
        `API request failed with status ${status}: ${error.message}`,
      );
    }

    return new ServiceUnavailableException(
      `Network error: ${this.describeError(error)}`,
    );
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
