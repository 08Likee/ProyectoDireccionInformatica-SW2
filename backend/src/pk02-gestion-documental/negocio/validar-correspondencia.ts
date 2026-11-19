import { BadRequestException } from '@nestjs/common';
import { idDocumento, textoDocumento } from './validar-archivo';
import { campos, control, fecha, opcional } from './validar-expediente';
export const TIPOS_INTERLOCUTOR=['PROPIA_DIRECCION','UNIDAD_INTERNA','UNIDAD_EXTERNA','PERSONA','ORGANIZACION'] as const;
export function sentido(valor:unknown):'RECIBIDA'|'EMITIDA' {
  if(valor!=='RECIBIDA'&&valor!=='EMITIDA')throw new BadRequestException('Sentido inválido.');return valor;
}
export function referenciaOficial(valor:unknown):string|null {
  return opcional(valor,'Referencia oficial',50).replace(/ +/g,' ')||null;
}
export function validarCorrespondencia(entrada:unknown,alta:boolean){
  const x=campos(entrada,['tipoId','periodoId','remitenteId','destinatarioId','sentido','referenciaOficial','asunto','fechaComunicacion','referencia','observaciones','confirmarDuplicado',...(alta?['direccionId']:['versionControl','motivo'])]);
  if(x.confirmarDuplicado!==undefined&&typeof x.confirmarDuplicado!=='boolean')throw new BadRequestException('Confirmación inválida.');
  return {direccion:alta?idDocumento(x.direccionId):undefined,tipoId:idDocumento(x.tipoId),periodoId:x.periodoId===undefined||x.periodoId===null||x.periodoId===''?null:idDocumento(x.periodoId),
    remitenteId:idDocumento(x.remitenteId),destinatarioId:idDocumento(x.destinatarioId),sentido:sentido(x.sentido),referenciaOficial:referenciaOficial(x.referenciaOficial),
    asunto:textoDocumento(x.asunto,'Asunto',255,1),fechaComunicacion:fecha(x.fechaComunicacion),referencia:opcional(x.referencia,'Referencia',2000),observaciones:opcional(x.observaciones,'Observaciones',2000),
    confirmarDuplicado:x.confirmarDuplicado===true,version:alta?undefined:control(x.versionControl),motivo:alta?undefined:textoDocumento(x.motivo,'Justificación',1000,1)};
}
export function validarCatalogo(entrada:unknown,interlocutor:boolean){
  const x=campos(entrada,['direccionId','nombre',interlocutor?'tipo':'codigo']);
  const d=idDocumento(x.direccionId);
  if(interlocutor){
    if(!TIPOS_INTERLOCUTOR.some(t=>t===x.tipo))throw new BadRequestException('Tipo de interlocutor inválido.');
    return {direccion:d,nombre:x.tipo==='PROPIA_DIRECCION'?'':textoDocumento(x.nombre,'Nombre',255,1),codigo:x.tipo as string};
  }
  return {direccion:d,nombre:textoDocumento(x.nombre,'Nombre',150,1),codigo:textoDocumento(x.codigo,'Código',30,1)};
}
