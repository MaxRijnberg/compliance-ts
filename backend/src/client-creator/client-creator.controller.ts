import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ClientCreatorService } from './client-creator.service';
import { CreateClientRequestDto } from './client-creator.dto';
import { ClientCreationResult } from '../pascal/pascal.types';

@Controller('client-creator')
export class ClientCreatorController {
  constructor(private readonly clientCreatorService: ClientCreatorService) {}

  @Get('portcalls/:portcallNumber/parties')
  getParties(@Param('portcallNumber') portcallNumber: string): Promise<string[]> {
    return this.clientCreatorService.getParties(portcallNumber);
  }

  @Post('clients')
  createClient(@Body() body: CreateClientRequestDto): Promise<ClientCreationResult> {
    return this.clientCreatorService.createClient(body.parties, body.clientName);
  }
}
