import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ScreeningService } from './screening.service';
import { ArchiveClientResult } from '../pascal/pascal.types';
import {
  ExtractBlPartiesRequestDto,
  RunScreeningRequestDto,
  ScreeningInitResponseDto,
  AttachmentExtractionResultDto,
  RunScreeningResponseDto,
} from './screening.dto';

@Controller('screening')
export class ScreeningController {
  constructor(private readonly screeningService: ScreeningService) {}

  @Get('portcalls/:portcallNumber')
  getInitialData(
    @Param('portcallNumber') portcallNumber: string,
  ): Promise<ScreeningInitResponseDto> {
    return this.screeningService.getInitialData(portcallNumber);
  }

  @Post('extract-bl')
  extractPartiesFromAttachments(
    @Body() body: ExtractBlPartiesRequestDto,
  ): Promise<AttachmentExtractionResultDto[]> {
    return this.screeningService.extractPartiesFromAttachments(body.attachments);
  }

  @Post('run')
  runScreening(@Body() body: RunScreeningRequestDto): Promise<RunScreeningResponseDto> {
    return this.screeningService.runScreening(body.parties, {
      name: body.vesselName,
      imo: body.vesselImo,
    });
  }

  @Post('portcalls/:portcallNumber/archive-client')
  archiveClient(
    @Param('portcallNumber') portcallNumber: string,
  ): Promise<ArchiveClientResult> {
    return this.screeningService.archiveClient(portcallNumber);
  }
}
