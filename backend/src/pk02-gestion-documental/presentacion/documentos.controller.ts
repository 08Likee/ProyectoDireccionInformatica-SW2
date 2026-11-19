import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { leerCookie, SESION_COOKIE } from '../../infraestructura/seguridad/csrf.guard';
import { DocumentosService } from '../negocio/documentos.service';
import { ArchivoSubido, TAMANO_MAXIMO_ARCHIVO } from '../negocio/validar-archivo';

@Controller('api/documentos')
export class DocumentosController {
  constructor(private readonly documentos: DocumentosService) {}
  private token(req: Request): string | null { return leerCookie(req,SESION_COOKIE); }

  @Get('ambitos')
  ambitos(@Req() req: Request) { return this.documentos.ambitos(this.token(req)); }

  @Get()
  listar(@Req() req: Request, @Query() filtros: Record<string,unknown>) {
    return this.documentos.listar(this.token(req),filtros);
  }

  @Post()
  @UseInterceptors(FileInterceptor('archivo',{limits:{fileSize:TAMANO_MAXIMO_ARCHIVO,files:1,fields:4,parts:5,fieldSize:1500}}))
  crear(@Req() req: Request, @Body() datos: Record<string,unknown>, @UploadedFile() archivo?: ArchivoSubido) {
    return this.documentos.crear(this.token(req),datos,archivo);
  }

  @Get(':id')
  detalle(@Req() req: Request, @Param('id') id: string, @Query('direccionId') direccionId: string) {
    return this.documentos.detalle(this.token(req),id,direccionId);
  }

  @Patch(':id')
  actualizar(@Req() req: Request, @Param('id') id: string, @Query('direccionId') direccionId: string,
    @Body() datos: Record<string,unknown>) {
    return this.documentos.actualizar(this.token(req),id,direccionId,datos);
  }

  @Post(':id/versiones')
  @UseInterceptors(FileInterceptor('archivo',{limits:{fileSize:TAMANO_MAXIMO_ARCHIVO,files:1,fields:2,parts:3,fieldSize:1500}}))
  version(@Req() req: Request, @Param('id') id: string, @Body() datos: Record<string,unknown>,
    @UploadedFile() archivo?: ArchivoSubido) {
    return this.documentos.nuevaVersion(this.token(req),id,datos,archivo);
  }

  @Get(':id/versiones/:numero/archivo')
  async descargar(@Req() req: Request, @Res() res: Response,
    @Param('id') id: string, @Param('numero') numero: string, @Query('direccionId') direccionId: string): Promise<void> {
    const { datos,archivo } = await this.documentos.descargar(this.token(req),id,direccionId,numero);
    res.setHeader('Content-Type',archivo.tipoMime);
    res.setHeader('Content-Disposition',`attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(archivo.nombreOriginal)}`);
    res.setHeader('Content-Length',String(datos.length));
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.end(datos);
  }
}
