import { ForbiddenException, Injectable } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { AutorizacionesService } from '../../pk01-gestion-usuarios-seguridad/negocio/autorizaciones.service';
import { DocumentosRepository } from '../datos/documentos.repository';

export const DOCUMENTOS_RESTRINGIDOS = 'DOCUMENTOS_RESTRINGIDOS_CONSULTAR';
export const RESTRICCIONES_GESTIONAR = 'DOCUMENTOS_RESTRICCIONES_GESTIONAR';
@Injectable()
export class AccesoDocumentalService {
  constructor(private readonly autorizaciones: AutorizacionesService, private readonly repo: DocumentosRepository) {}
  async tiene(token: string|null, codigo: string, direccion: string): Promise<boolean> {
    try { await this.autorizaciones.exigirPermiso(token,codigo,direccion); return true; }
    catch(e) { if(e instanceof ForbiddenException) return false; throw e; }
  }
  async exigir(token:string|null, direccion:string, documento:string, permiso:string,q?:QueryRunner):Promise<void> {
    await this.autorizaciones.exigirPermiso(token,permiso,direccion,q);
    if(await this.repo.restringido(documento,q)) await this.autorizaciones.exigirPermiso(token,DOCUMENTOS_RESTRINGIDOS,direccion,q);
  }
}
