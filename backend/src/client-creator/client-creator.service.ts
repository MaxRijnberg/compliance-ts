import { Injectable } from '@nestjs/common';
import { PortAbleService } from '../portable/portable.service';
import { PascalService } from '../pascal/pascal.service';
import { ClientCreationResult } from '../pascal/pascal.types';

@Injectable()
export class ClientCreatorService {
  constructor(
    private readonly portAbleService: PortAbleService,
    private readonly pascalService: PascalService,
  ) {}

  /**
   * Mirrors the Python retrieve_parties(): merges structured party names
   * and other-party names from PortAble into one sorted, de-duplicated list.
   */
  async getParties(portcallNumber: string): Promise<string[]> {
    const { parties, otherParties } =
      await this.portAbleService.findPartiesFromPortcall(portcallNumber);

    const names = new Set<string>([...Object.keys(parties), ...otherParties]);
    return [...names].sort();
  }

  createClient(parties: string[], clientName: string): Promise<ClientCreationResult> {
    return this.pascalService.createClient(parties, clientName);
  }
}
