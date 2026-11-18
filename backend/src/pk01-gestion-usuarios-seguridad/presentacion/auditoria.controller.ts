import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SESION_COOKIE, leerCookie } from '../../infraestructura/seguridad/csrf.guard';
import { AuditoriaService } from '../negocio/auditoria.service';

/** Endpoints estrictamente de lectura; la autorización y ámbito se verifican en cada consulta. */
@Controller('api/auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}
  private sesion(req: Request): string | null { return leerCookie(req, SESION_COOKIE); }

  @Get('direcciones')
  direcciones(@Req() req: Request) { return this.auditoria.ambitos(this.sesion(req)); }

  @Get('eventos')
  eventos(@Req() req: Request, @Query() filtros: Record<string, unknown>) {
    return this.auditoria.consultar(this.sesion(req), filtros);
  }

  @Get('eventos/:id')
  detalle(@Req() req: Request, @Param('id') id: string, @Query('direccionId') direccionId?: string) {
    return this.auditoria.detalle(this.sesion(req), id, direccionId);
  }
}
