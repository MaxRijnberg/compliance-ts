import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScreeningModule } from './screening/screening.module';
import { ClientCreatorModule } from './client-creator/client-creator.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScreeningModule,
    ClientCreatorModule,
  ],
})
export class AppModule {}
