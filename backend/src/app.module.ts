import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaludModule } from './infraestructura/salud/salud.module';
import { Pk01Module } from './pk01-gestion-usuarios-seguridad/pk01.module';
import { CrearCuentas1794960000000 } from './pk01-gestion-usuarios-seguridad/datos/migraciones/CrearCuentas1794960000000';
import { CrearAutorizaciones1794960001000 } from './pk01-gestion-usuarios-seguridad/datos/migraciones/CrearAutorizaciones1794960001000';
import { CrearDocumentos1794960002000 } from './pk02-gestion-documental/datos/migraciones/CrearDocumentos1794960002000';
import { AdecuarTamanoDocumental1794960003000 } from './pk02-gestion-documental/datos/migraciones/AdecuarTamanoDocumental1794960003000';
import { CrearExpedientes1794960004000 } from './pk02-gestion-documental/datos/migraciones/CrearExpedientes1794960004000';
import { CrearCorrespondencia1794960005000 } from './pk02-gestion-documental/datos/migraciones/CrearCorrespondencia1794960005000';
import { CrearSeguimientoCorrespondencia1794960006000 } from './pk02-gestion-documental/datos/migraciones/CrearSeguimientoCorrespondencia1794960006000';
import { Pk02Module } from './pk02-gestion-documental/pk02.module';
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
      migrations: [CrearCuentas1794960000000, CrearAutorizaciones1794960001000, CrearDocumentos1794960002000, AdecuarTamanoDocumental1794960003000, CrearExpedientes1794960004000, CrearCorrespondencia1794960005000, CrearSeguimientoCorrespondencia1794960006000],
      migrationsRun: true,
      retryAttempts: 10,
      retryDelay: 2000,
    }),
    SaludModule,
    Pk01Module,
    Pk02Module,
  ],
  providers: [{ provide: APP_GUARD, useClass: CsrfGuard }],
})
export class AppModule {}
