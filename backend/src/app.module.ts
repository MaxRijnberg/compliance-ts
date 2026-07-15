import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScreeningModule } from './screening/screening.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScreeningModule,
  ],
})
export class AppModule {}
