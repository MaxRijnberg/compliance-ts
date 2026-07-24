import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ArchiveClientResult,
  AttachmentExtractionResult,
  RunScreeningResponse,
  ScreeningInitResponse,
} from './screening.models';

@Injectable({ providedIn: 'root' })
export class ScreeningApiService {
  // Adjust to your actual API base path/environment config.
  private readonly baseUrl = '/api/screening';

  constructor(private readonly http: HttpClient) {}

  getInitialData(portcallNumber: string): Observable<ScreeningInitResponse> {
    return this.http.get<ScreeningInitResponse>(
      `${this.baseUrl}/portcalls/${encodeURIComponent(portcallNumber)}`,
    );
  }

  extractBlParties(
    attachments: { name: string; url: string }[],
  ): Observable<AttachmentExtractionResult[]> {
    return this.http.post<AttachmentExtractionResult[]>(`${this.baseUrl}/extract-bl`, {
      attachments,
    });
  }

  runScreening(
    parties: string[],
    vesselName: string,
    vesselImo: string,
  ): Observable<RunScreeningResponse> {
    return this.http.post<RunScreeningResponse>(`${this.baseUrl}/run`, {
      parties,
      vesselName,
      vesselImo,
    });
  }

  archiveClient(portcallNumber: string): Observable<ArchiveClientResult> {
    return this.http.post<ArchiveClientResult>(
      `${this.baseUrl}/portcalls/${encodeURIComponent(portcallNumber)}/archive-client`,
      {},
    );
  }
}
