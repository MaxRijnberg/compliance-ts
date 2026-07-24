import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScreeningApiService } from './screening-api.service';
import {
  ArchiveClientResult,
  RunScreeningResponse,
  SCREENING_COLOURS,
  SCREENING_STATUSES,
  ScreeningAttachment,
} from './screening.models';

interface AttachmentWarning {
  name: string;
  error: string;
}

@Component({
  selector: 'app-screening',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './screening.component.html',
  styleUrl: './screening.component.css',
})
export class ScreeningComponent {
  readonly screeningStatuses = SCREENING_STATUSES;
  readonly screeningColours = SCREENING_COLOURS;

  // --- Input / active portcall ---
  portcallNumberInput = signal('');
  activePortcallNumber = signal<string | null>(null);

  // --- Loaded data ---
  parties = signal<Record<string, Set<string>>>({});
  otherParties = signal<string[]>([]);
  attachments = signal<ScreeningAttachment[]>([]);
  vessel = signal<{ name: string; imo: string } | null>(null);

  // --- UI-only state (replaces st.session_state) ---
  manualParties = signal<Set<string>>(new Set());
  selectedParties = signal<Record<string, boolean>>({});
  selectedAttachmentNames = signal<Set<string>>(new Set());
  blProcessed = signal(false);
  newPartyName = signal('');

  // --- Async / result state ---
  loadingInitial = signal(false);
  loadingExtract = signal(false);
  loadingScreening = signal(false);
  loadError = signal<string | null>(null);
  attachmentWarnings = signal<AttachmentWarning[]>([]);
  screeningResults = signal<RunScreeningResponse | null>(null);
  archivingClient = signal(false);
  archiveResult = signal<ArchiveClientResult | null>(null);

  // Mirrors build_all_parties(): merges structured, other, and manual parties.
  allParties = computed<Record<string, string[]>>(() => {
    const result: Record<string, string[]> = {};

    for (const [name, roles] of Object.entries(this.parties())) {
      result[name] = [...roles];
    }
    for (const name of this.otherParties()) {
      if (!(name in result)) result[name] = ['Other party'];
    }
    for (const name of this.manualParties()) {
      if (!(name in result)) result[name] = ['Manually added'];
    }

    return result;
  });

  finalParties = computed<string[]>(() =>
    Object.entries(this.selectedParties())
      .filter(([, selected]) => selected)
      .map(([name]) => name),
  );

  constructor(private readonly api: ScreeningApiService) {}

  loadPortcall(): void {
    const pcId = this.portcallNumberInput().trim();
    if (!pcId) return;

    // Reset UI-related state whenever the portcall changes (matches the
    // active_pc_id check in the original).
    if (this.activePortcallNumber() !== pcId) {
      this.manualParties.set(new Set());
      this.selectedParties.set({});
      this.blProcessed.set(false);
      this.attachmentWarnings.set([]);
      this.screeningResults.set(null);
      this.archiveResult.set(null);
      this.activePortcallNumber.set(pcId);
    }

    this.fetchScreeningData(pcId);
  }

  private fetchScreeningData(pcId: string): void {
    this.loadingInitial.set(true);
    this.loadError.set(null);

    this.api.getInitialData(pcId).subscribe({
      next: (data) => {
        const partiesAsSets: Record<string, Set<string>> = {};
        for (const [name, roles] of Object.entries(data.parties)) {
          partiesAsSets[name] = new Set(roles);
        }
        this.parties.set(partiesAsSets);
        this.otherParties.set(data.otherParties);
        this.attachments.set(data.attachments);
        this.vessel.set(data.vessel);

        this.selectedAttachmentNames.set(
          new Set(data.attachments.filter((a) => a.likelyBl).map((a) => a.name)),
        );

        this.syncSelectedPartiesWithAllParties();
        this.loadingInitial.set(false);
      },
      error: (err) => {
        this.loadError.set(this.describeHttpError(err));
        this.loadingInitial.set(false);
      },
    });
  }

  // Ensures every party in allParties() has a checkbox state, defaulting
  // newly-seen parties to checked (matches the original's default-True loop).
  private syncSelectedPartiesWithAllParties(): void {
    const current = { ...this.selectedParties() };
    for (const name of Object.keys(this.allParties())) {
      if (!(name in current)) current[name] = true;
    }
    this.selectedParties.set(current);
  }

  toggleAttachment(name: string, checked: boolean): void {
    const next = new Set(this.selectedAttachmentNames());
    if (checked) next.add(name);
    else next.delete(name);
    this.selectedAttachmentNames.set(next);
  }

  isAttachmentSelected(name: string): boolean {
    return this.selectedAttachmentNames().has(name);
  }

  extractFromSelectedBLs(): void {
    const selected = this.attachments().filter((a) =>
      this.selectedAttachmentNames().has(a.name),
    );
    if (selected.length === 0) return;

    this.loadingExtract.set(true);
    this.attachmentWarnings.set([]);

    this.api
      .extractBlParties(selected.map(({ name, url }) => ({ name, url })))
      .subscribe({
        next: (results) => {
          const parties = { ...this.parties() };
          const warnings: AttachmentWarning[] = [];

          for (const result of results) {
            if (result.error) {
              warnings.push({ name: result.name, error: result.error });
              continue;
            }
            for (const [party, role] of Object.entries(result.parties ?? {})) {
              if (!parties[party]) parties[party] = new Set();
              parties[party].add(role);
            }
          }

          this.parties.set(parties);
          this.attachmentWarnings.set(warnings);
          this.syncSelectedPartiesWithAllParties();
          this.blProcessed.set(true);
          this.loadingExtract.set(false);
        },
        error: (err) => {
          this.loadError.set(this.describeHttpError(err));
          this.loadingExtract.set(false);
        },
      });
  }

  toggleSelectedParty(name: string, checked: boolean): void {
    this.selectedParties.set({ ...this.selectedParties(), [name]: checked });
  }

  addManualParty(): void {
    const name = this.newPartyName().trim();
    if (!name) return;

    const next = new Set(this.manualParties());
    next.add(name);
    this.manualParties.set(next);
    this.selectedParties.set({ ...this.selectedParties(), [name]: true });
    this.newPartyName.set('');
  }

  runScreening(): void {
    const vessel = this.vessel();
    const finalParties = this.finalParties();
    if (!vessel || finalParties.length === 0) return;

    this.loadingScreening.set(true);
    this.screeningResults.set(null);
    this.archiveResult.set(null);

    this.api.runScreening(finalParties, vessel.name, vessel.imo).subscribe({
      next: (results) => {
        this.screeningResults.set(results);
        this.loadingScreening.set(false);
      },
      error: (err) => {
        this.loadError.set(this.describeHttpError(err));
        this.loadingScreening.set(false);
      },
    });
  }

  archiveClient(): void {
    const pcId = this.activePortcallNumber();
    if (!pcId) return;

    this.archivingClient.set(true);
    this.archiveResult.set(null);

    this.api.archiveClient(pcId).subscribe({
      next: (result) => {
        this.archiveResult.set(result);
        this.archivingClient.set(false);
      },
      error: (err) => {
        this.archiveResult.set({ success: false, message: this.describeHttpError(err) });
        this.archivingClient.set(false);
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
