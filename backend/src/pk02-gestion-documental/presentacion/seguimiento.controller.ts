import { Body,Controller,Get,Param,Patch,Post,Query,Req } from '@nestjs/common';
import type { Request } from 'express';
import { leerCookie,SESION_COOKIE } from '../../infraestructura/seguridad/csrf.guard';
import { SeguimientoService } from '../negocio/seguimiento.service';
@Controller('api')
export class SeguimientoController {
  constructor(private readonly servicio:SeguimientoService){}
  private token(r:Request){return leerCookie(r,SESION_COOKIE);}
  @Get('seguimiento/ambitos') ambitos(@Req() r:Request){return this.servicio.ambitos(this.token(r));}
  @Get('seguimiento/tipos') tipos(@Req() r:Request,@Query('direccionId') d:string){return this.servicio.tipos(this.token(r),d);}
  @Get('correspondencia/:id/seguimiento') detalle(@Req() r:Request,@Param('id') id:string,@Query('direccionId') d:string){return this.servicio.detalle(this.token(r),id,d);}
  @Post('correspondencia/:id/seguimiento') registrar(@Req() r:Request,@Param('id') id:string,@Query('direccionId') d:string,@Body() x:unknown){return this.servicio.registrar(this.token(r),id,d,x);}
  @Post('correspondencia/:id/seguimiento/:movimiento/documentos') vincular(@Req() r:Request,@Param('id') id:string,@Param('movimiento') m:string,@Query('direccionId') d:string,@Body() x:unknown){return this.servicio.vincular(this.token(r),id,d,m,x);}
  @Patch('correspondencia/:id/seguimiento/:movimiento/documentos/:vinculo/retirar') retirar(@Req() r:Request,@Param('id') id:string,@Param('movimiento') m:string,@Param('vinculo') v:string,@Query('direccionId') d:string,@Body() x:unknown){return this.servicio.retirar(this.token(r),id,d,m,v,x);}
}
