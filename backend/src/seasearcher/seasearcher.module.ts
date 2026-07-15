import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SeaSearcherService } from './seasearcher.service';

@Module({
  imports: [HttpModule],
  providers: [SeaSearcherService],
  exports: [SeaSearcherService],
})
export class SeaSearcherModule {}
