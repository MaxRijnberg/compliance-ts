import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enables the class-validator decorators on the screening DTOs.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Adjust/remove once the Angular app is served from the same origin or
  // behind a proper reverse proxy — wide open for local testing only.
  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Compliance backend listening on http://localhost:${port}`);
}

bootstrap();
