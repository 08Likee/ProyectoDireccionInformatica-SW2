import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaludModule } from './infraestructura/salud/salud.module';
import { Pk01Module } from './pk01-gestion-usuarios-seguridad/pk01.module';
import { CrearCuentas1794960000000 } from './pk01-gestion-usuarios-seguridad/datos/migraciones/CrearCuentas1794960000000';
import { CrearAutorizaciones1794960001000 } from './pk01-gestion-usuarios-seguridad/datos/migraciones/CrearAutorizaciones1794960001000';
import { APP_GUARD } from '@nestjs/core';
import { CsrfGuard } from './infraestructura/seguridad/csrf.guard';

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
      migrations: [CrearCuentas1794960000000, CrearAutorizaciones1794960001000],
      migrationsRun: true,
      retryAttempts: 10,
      retryDelay: 2000,
    }),
    SaludModule,
    Pk01Module,
  ],
  providers: [{ provide: APP_GUARD, useClass: CsrfGuard }],
})
export class AppModule {}
