import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ClientCreationResult } from './client-creator.models';

@Injectable({ providedIn: 'root' })
export class ClientCreatorApiService {
  // Adjust to your actual API base path/environment config.
  private readonly baseUrl = '/api/client-creator';

  constructor(private readonly http: HttpClient) {}

  getParties(portcallNumber: string): Observable<string[]> {
    return this.http.get<string[]>(
      `${this.baseUrl}/portcalls/${encodeURIComponent(portcallNumber)}/parties`,
    );
  }

  createClient(parties: string[], clientName: string): Observable<ClientCreationResult> {
    return this.http.post<ClientCreationResult>(`${this.baseUrl}/clients`, {
      parties,
      clientName,
    });
  }
}
