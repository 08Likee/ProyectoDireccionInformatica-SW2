import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaludModule } from './infraestructura/salud/salud.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? '5432'),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB ?? 'direccion_informatica',
      autoLoadEntities: true,
      synchronize: false,
      migrationsRun: false,
      retryAttempts: 10,
      retryDelay: 2000,
    }),
    SaludModule,
  ],
})
export class AppModule {}
