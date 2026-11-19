import { Injectable,NotFoundException,UnauthorizedException } from '@nestjs/common';
import { hashToken } from '../../infraestructura/seguridad/seguridad.util';
import { AutorizacionesService } from '../../pk01-gestion-usuarios-seguridad/negocio/autorizaciones.service';
import { DocumentosRepository } from '../../pk02-gestion-documental/datos/documentos.repository';
import { CorrespondenciaService } from '../../pk02-gestion-documental/negocio/correspondencia.service';
import { DocumentosService } from '../../pk02-gestion-documental/negocio/documentos.service';
import { ExpedientesService } from '../../pk02-gestion-documental/negocio/expedientes.service';
import { SeguimientoService } from '../../pk02-gestion-documental/negocio/seguimiento.service';
import { AccesoDocumentalService,DOCUMENTOS_RESTRINGIDOS } from '../../pk02-gestion-documental/negocio/acceso-documental.service';
import { idDocumento } from '../../pk02-gestion-documental/negocio/validar-archivo';
import { campos } from '../../pk02-gestion-documental/negocio/validar-expediente';
import { ConsultasRepository } from '../datos/consultas.repository';
import { ambitoConsulta,fuente,Fuente,FUENTES,PERMISOS_FUENTE,validarConsulta } from './validar-consulta';
const PERMISO='FILTROS_CONSULTAR';
@Injectable()
export class ConsultasService {
  constructor(private readonly auth:AutorizacionesService,private readonly docs:DocumentosRepository,
    private readonly acceso:AccesoDocumentalService,private readonly repo:ConsultasRepository,
    private readonly correspondencia:CorrespondenciaService,private readonly documentos:DocumentosService,
    private readonly expedientes:ExpedientesService,private readonly seguimiento:SeguimientoService){}
  private async exigir(token:string|null,d:string,f:Fuente){
    await this.auth.exigirPermiso(token,PERMISO,d);
    for(const p of PERMISOS_FUENTE[f])await this.auth.exigirPermiso(token,p,d);
  }
  async ambitos(token:string|null){
    if(!token||! /^[A-Za-z0-9_-]{43}$/.test(token))throw new UnauthorizedException('Iniciá sesión para continuar.');
    const u=await this.docs.sesion(hashToken(token));if(!u)throw new UnauthorizedException('Sesión no vigente.');
    const dirs=await this.docs.ambitos(u,PERMISO);
    const ambitos=await Promise.all(dirs.map(async d=>{
      const fuentes:Fuente[]=[];
      if(!await this.acceso.tiene(token,PERMISO,d.id))return {...d,fuentes};
      for(const f of FUENTES){const autorizados=await Promise.all(PERMISOS_FUENTE[f].map(p=>this.acceso.tiene(token,p,d.id)));if(autorizados.every(Boolean))fuentes.push(f);}
      return {...d,fuentes};
    }));
    return {ambitos:ambitos.filter(d=>d.fuentes.length>0)};
  }
  async catalogos(token:string|null,entrada:unknown){
    const {direccionId:d,fuente:f}=ambitoConsulta(entrada);await this.exigir(token,d,f);
    if(f==='CORRESPONDENCIA'){
      const [tipos,interlocutores,periodos]=await Promise.all(['tipos','interlocutores','periodos'].map(k=>this.correspondencia.catalogo(token,d,k as 'tipos'|'interlocutores'|'periodos')));
      return {...tipos,...interlocutores,...periodos};
    }
    if(f==='EXPEDIENTES')return this.expedientes.periodos(token,d);
    if(f==='ACTUACIONES')return {...await this.seguimiento.tipos(token,d),...await this.correspondencia.catalogo(token,d,'interlocutores')};
    return {};
  }
  async listar(token:string|null,entrada:unknown){
    const c=validarConsulta(entrada);await this.exigir(token,c.direccionId,c.fuente);
    return this.repo.listar(c,c.fuente==='DOCUMENTOS'&&await this.acceso.tiene(token,DOCUMENTOS_RESTRINGIDOS,c.direccionId));
  }
  async detalle(token:string|null,fuenteRaw:unknown,idRaw:unknown,entrada:unknown){
    const f=fuente(fuenteRaw),id=idDocumento(idRaw),d=idDocumento(campos(entrada,['direccionId']).direccionId);
    await this.exigir(token,d,f);
    if(f==='CORRESPONDENCIA')return this.correspondencia.detalle(token,id,d);
    if(f==='DOCUMENTOS')return this.documentos.detalle(token,id,d);
    if(f==='EXPEDIENTES')return this.expedientes.detalle(token,id,d);
    const correspondenciaId=await this.repo.origenMovimiento(id,d);
    if(!correspondenciaId)throw new NotFoundException('Actuación no disponible.');
    const h=await this.seguimiento.detalle(token,correspondenciaId,d),movimiento=h.movimientos.find(m=>m.id===id);
    if(!movimiento)throw new NotFoundException('Actuación no disponible.');
    return {movimiento,correspondenciaId,evidencias:h.evidencias.filter(e=>(e as {movimientoId:string}).movimientoId===id)};
  }
}
