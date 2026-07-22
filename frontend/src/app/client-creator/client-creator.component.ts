import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientCreatorApiService } from './client-creator-api.service';
import { ClientCreationResult } from './client-creator.models';

@Component({
  selector: 'app-client-creator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-creator.component.html',
  styleUrl: './client-creator.component.css',
})
export class ClientCreatorComponent {
  // --- Step 1: retrieve parties ---
  portcallInput = signal('');
  activePortcall = signal<string | null>(null);
  parties = signal<string[]>([]);
  partiesLoaded = signal(false);

  loadingParties = signal(false);
  partiesError = signal<string | null>(null);

  // --- Step 2/3: create client ---
  clientNameInput = signal('');
  creatingClient = signal(false);
  clientError = signal<string | null>(null);
  result = signal<ClientCreationResult | null>(null);

  failedCount = computed(() => this.result()?.failedLinks.length ?? 0);

  executionSummary = computed(() => {
    const r = this.result();
    if (!r) return null;
    return {
      portcall: this.activePortcall(),
      clientName: this.clientNameInput(),
      clientId: r.clientId,
      partiesFound: this.parties().length,
      linkedCount: r.linkedCount,
      failedLinks: r.failedLinks,
    };
  });

  constructor(private readonly api: ClientCreatorApiService) {}

  retrieveParties(): void {
    const portcall = this.portcallInput().trim();
    if (!portcall) {
      this.partiesError.set('Please enter a PortCall number.');
      return;
    }

    this.loadingParties.set(true);
    this.partiesError.set(null);
    this.partiesLoaded.set(false);
    this.result.set(null);

    this.api.getParties(portcall).subscribe({
      next: (parties) => {
        if (parties.length === 0) {
          this.partiesError.set(`No parties found for '${portcall}'.`);
        } else {
          this.parties.set(parties);
          this.activePortcall.set(portcall);
          this.partiesLoaded.set(true);
          this.clientNameInput.set(`Portcall ${portcall}`);
        }
        this.loadingParties.set(false);
      },
      error: (err) => {
        this.partiesError.set(this.describeHttpError(err));
        this.loadingParties.set(false);
      },
    });
  }

  createClient(): void {
    const parties = this.parties();
    const clientName = this.clientNameInput().trim();
    if (parties.length === 0 || !clientName) return;

    this.creatingClient.set(true);
    this.clientError.set(null);
    this.result.set(null);

    this.api.createClient(parties, clientName).subscribe({
      next: (result) => {
        this.result.set(result);
        this.creatingClient.set(false);
      },
      error: (err) => {
        this.clientError.set(this.describeHttpError(err));
        this.creatingClient.set(false);
      },
    });
  }

  private describeHttpError(err: unknown): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const inner = (err as { error?: { message?: string } }).error;
      if (inner?.message) return inner.message;
    }
    return 'Request failed. Please try again.';
  }
}
