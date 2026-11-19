import { BadRequestException, ConflictException } from '@nestjs/common';
import { campos,control,fecha,opcional } from './validar-expediente';
import { idDocumento,textoDocumento } from './validar-archivo';
export const MOVIMIENTOS=['RECEPCION','ENVIO','DERIVACION','SEGUIMIENTO','RESPUESTA','REITERACION','ACLARACION'] as const;
export type TipoMovimiento=typeof MOVIMIENTOS[number];
export function validarActuacion(entrada:unknown){
  const x=campos(entrada,['tipo','fechaActuacion','responsableId','destinoId','observacion','referencia','relacionadaId','versionRelacionada','aclaradoId','versionControl']);
  const tipo=MOVIMIENTOS.find(t=>t===x.tipo);if(!tipo)throw new BadRequestException('Tipo de actuación inválido.');
  // Hora civil de Bolivia; no depender de la zona horaria del contenedor o navegador.
  if(typeof x.fechaActuacion!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.fechaActuacion))throw new BadRequestException('Fecha y hora de actuación inválidas.');
  const dia=fecha(x.fechaActuacion.slice(0,10)),instante=new Date(x.fechaActuacion+':00-04:00');
  if(instante.getTime()>Date.now())throw new BadRequestException('La actuación no puede ser futura.');
  const relacionada=x.relacionadaId==null||x.relacionadaId===''?null:idDocumento(x.relacionadaId),aclarado=x.aclaradoId==null||x.aclaradoId===''?null:idDocumento(x.aclaradoId),destino=x.destinoId==null||x.destinoId===''?null:idDocumento(x.destinoId);
  if((tipo==='RESPUESTA'||tipo==='REITERACION')!==Boolean(relacionada)||(tipo==='ACLARACION')!==Boolean(aclarado)||(!relacionada&&x.versionRelacionada!=null))throw new BadRequestException('Referencia de actuación inválida.');
  if(tipo==='DERIVACION'&&!destino)throw new BadRequestException('Seleccioná el destino de la derivación.');
  return {tipo,dia,instante,responsable:idDocumento(x.responsableId),destino,relacionada,aclarado,version:control(x.versionControl),versionRelacionada:relacionada?control(x.versionRelacionada):null,observacion:tipo==='ACLARACION'||tipo==='SEGUIMIENTO'?textoDocumento(x.observacion,'Observación',2000,1):opcional(x.observacion,'Observación',2000),referencia:opcional(x.referencia,'Referencia',255)};
}
export function validarSecuencia(tipo:TipoMovimiento,sentido:string,dia:string,fechaComunicacion:string,instante:Date,anteriores:Array<{tipo:string;fecha:Date|string}>){
  if((tipo==='RECEPCION'&&sentido!=='RECIBIDA')||(tipo==='ENVIO'&&sentido!=='EMITIDA')||dia<fechaComunicacion)throw new BadRequestException('Actuación incompatible con la comunicación.');
  if(anteriores.some(a=>new Date(a.fecha)>instante))throw new ConflictException('La actuación precede al último movimiento registrado.');
  if((tipo==='RECEPCION'||tipo==='ENVIO')&&anteriores.some(a=>a.tipo===tipo))throw new ConflictException('La actuación inicial ya está registrada.');
}
