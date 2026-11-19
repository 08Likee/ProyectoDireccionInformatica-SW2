import { BadRequestException } from '@nestjs/common';
import { idDocumento,textoDocumento } from '../../pk02-gestion-documental/negocio/validar-archivo';
import { campos,fecha } from '../../pk02-gestion-documental/negocio/validar-expediente';
import { referenciaOficial,sentido } from '../../pk02-gestion-documental/negocio/validar-correspondencia';

import { MOVIMIENTOS } from '../../pk02-gestion-documental/negocio/validar-seguimiento';

export const PERMISOS_FUENTE={
  CORRESPONDENCIA:['CORRESPONDENCIA_CONSULTAR'],
  DOCUMENTOS:['DOCUMENTOS_CONSULTAR'],
  EXPEDIENTES:['EXPEDIENTES_CONSULTAR'],
  ACTUACIONES:['CORRESPONDENCIA_CONSULTAR','SEGUIMIENTO_CONSULTAR'],
} as const;
export type Fuente=keyof typeof PERMISOS_FUENTE;
export const FUENTES=Object.keys(PERMISOS_FUENTE) as Fuente[];
export const TAMANO_PAGINA=20;
export const MAX_PAGINA=100000;
const CAMPOS:Record<Fuente,string[]>={
  CORRESPONDENCIA:['identificador','referenciaOficial','sentido','tipoId','periodoId','remitenteId','destinatarioId'],
  DOCUMENTOS:['codigo','titulo','categoria','versionActual'],
  EXPEDIENTES:['identificador','codigo','asunto','periodoId'],
  ACTUACIONES:['identificador','tipoMovimiento','responsableId','destinoId'],
};
export function fuente(valor:unknown):Fuente{
  if(typeof valor!=='string'||!FUENTES.some(f=>f===valor))throw new BadRequestException('Fuente inválida.');
  return valor as Fuente;
}
export function ambitoConsulta(entrada:unknown){
  const x=campos(entrada,['direccionId','fuente']);return {direccionId:idDocumento(x.direccionId),fuente:fuente(x.fuente)};
}
export function identificadorVisual(valor:unknown,prefijo:'COR'|'EXP'){
  const t=textoDocumento(valor,'Identificador',23,1).toUpperCase();
  if(!new RegExp(`^${prefijo}-[0-9]{6,19}$`).test(t))throw new BadRequestException(`Identificador ${prefijo} inválido.`);
  const id=idDocumento(t.slice(4).replace(/^0+/,''));
  if(t!==`${prefijo}-${id.padStart(6,'0')}`)throw new BadRequestException('Identificador no canónico.');
  return id;
}
function entero(valor:unknown,max:number,min=0){
  if(typeof valor!=='string'||!/^\d{1,9}$/.test(valor)||Number(valor)<min||Number(valor)>max)throw new BadRequestException('Número fuera del rango permitido.');
  return Number(valor);
}
export function validarConsulta(entrada:unknown){
  const base=entrada as Record<string,unknown>|null;
  const f=fuente(base?.fuente),x=campos(entrada,['direccionId','fuente','pagina','desde','hasta',...CAMPOS[f]]);
  const filtros:Record<string,string|number>={};
  for(const k of [...CAMPOS[f],'desde','hasta']){
    const v=x[k];if(v===undefined||v==='')continue;
    if(k==='identificador')filtros[k]=identificadorVisual(v,f==='EXPEDIENTES'?'EXP':'COR');
    else if(k.endsWith('Id'))filtros[k]=idDocumento(v);
    else if(k==='desde'||k==='hasta')filtros[k]=fecha(v);
    else if(k==='sentido')filtros[k]=sentido(v);
    else if(k==='versionActual')filtros[k]=entero(v,1000,1);
    else if(k==='tipoMovimiento'){
      if(typeof v!=='string'||!MOVIMIENTOS.some(t=>t===v))throw new BadRequestException('Tipo de actuación inválido.');
      filtros[k]=v;
    }else if(k==='referenciaOficial'){
      const ref=referenciaOficial(v);if(!ref)throw new BadRequestException('Referencia inválida.');filtros[k]=ref;
    }else if(k==='codigo'&&f==='DOCUMENTOS'){
      const codigo=textoDocumento(v,'Código documental',36,36);
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codigo))throw new BadRequestException('Código UUID inválido.');
      filtros[k]=codigo.toLowerCase();
    }else filtros[k]=textoDocumento(v,k,k==='titulo'?160:k==='categoria'?80:k==='asunto'?250:50,1);
  }
  if(filtros.desde&&filtros.hasta&&String(filtros.desde)>String(filtros.hasta))throw new BadRequestException('El intervalo de fechas no es válido.');
  return {fuente:f,direccionId:idDocumento(x.direccionId),pagina:x.pagina===undefined?0:entero(x.pagina,MAX_PAGINA),filtros};
}
export type ConsultaValidada=ReturnType<typeof validarConsulta>;
