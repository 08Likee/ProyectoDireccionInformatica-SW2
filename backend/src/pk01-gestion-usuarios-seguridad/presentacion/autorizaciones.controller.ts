import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SESION_COOKIE, leerCookie } from '../../infraestructura/seguridad/csrf.guard';
import { AutorizacionesService } from '../negocio/autorizaciones.service';

/** Solo Director con autoridad y permiso vigentes. Todas las mutaciones están cubiertas por CsrfGuard. */
@Controller('api/administracion')
export class AutorizacionesController {
  constructor(private readonly autorizaciones: AutorizacionesService) {}
  private sesion(req: Request): string | null { return leerCookie(req, SESION_COOKIE); }

  @Get('contexto')
  contexto(@Req() req:Request) { return this.autorizaciones.contexto(this.sesion(req)); }

  @Get('catalogo')
  catalogo(@Req() req:Request) { return this.autorizaciones.catalogo(this.sesion(req)); }

  @Get('usuarios')
  usuarios(@Req() req:Request,@Query('q') q?:string) {
    return this.autorizaciones.buscarUsuarios(this.sesion(req),q);
  }

  @Get('asignaciones')
  asignaciones(@Req() req:Request,@Query('usuarioId') usuarioId?:string) {
    return this.autorizaciones.consultarAsignaciones(this.sesion(req),usuarioId);
  }

  @Post('roles')
  crearRol(@Req() req:Request,@Body() cuerpo:unknown) {
    return this.autorizaciones.crearRol(this.sesion(req),cuerpo);
  }

  @Put('roles/:id')
  actualizarRol(@Req() req:Request,@Param('id') id:string,@Body() cuerpo:unknown) {
    return this.autorizaciones.actualizarRol(this.sesion(req),id,cuerpo);
  }

  @Post('asignaciones/roles')
  asignarRol(@Req() req:Request,@Body() cuerpo:unknown) {
    return this.autorizaciones.asignarRol(this.sesion(req),cuerpo);
  }

  @Post('asignaciones/permisos')
  asignarPermiso(@Req() req:Request,@Body() cuerpo:unknown) {
    return this.autorizaciones.asignarPermiso(this.sesion(req),cuerpo);
  }

  @Patch('asignaciones/:tipo/:id/vigencia')
  modificarVigencia(@Req() req:Request,@Param('tipo') tipo:string,@Param('id') id:string,@Body() cuerpo:unknown) {
    return this.autorizaciones.modificarVigencia(this.sesion(req),tipo,id,cuerpo);
  }

  @Post('asignaciones/:tipo/:id/revocar')
  @HttpCode(200)
  revocar(@Req() req:Request,@Param('tipo') tipo:string,@Param('id') id:string,@Body() cuerpo:unknown) {
    return this.autorizaciones.revocar(this.sesion(req),tipo,id,cuerpo);
  }
}
