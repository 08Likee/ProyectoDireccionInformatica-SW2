import { BadRequestException } from '@nestjs/common';
import { idDocumento,textoDocumento } from './validar-archivo';
export function campos(entrada:unknown,claves:string[]):Record<string,unknown>{
  if(!entrada||typeof entrada!=='object'||Array.isArray(entrada)||Object.keys(entrada).some(k=>!claves.includes(k)))throw new BadRequestException('Campos inválidos.');
  return entrada as Record<string,unknown>;
}
export function control(valor:unknown):number{
  if(typeof valor!=='number'||!Number.isInteger(valor)||valor<0||valor>2147483646)throw new BadRequestException('Versión de control inválida.');
  return valor;
}
export function opcional(valor:unknown,nombre:string,max:number):string{
  return valor===undefined||valor===null||valor===''?'':textoDocumento(valor,nombre,max,0);
}
export function fecha(valor:unknown):string{
  if(typeof valor!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(valor)||valor.startsWith('0000'))throw new BadRequestException('Fecha inválida.');
  const d=new Date(valor+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==valor)throw new BadRequestException('Fecha inválida.');
  return valor;
}
export function validarPeriodo(entrada:unknown){
  const x=campos(entrada,['direccionId','gestion','codigo','fechaInicio','fechaFin']);
  if(typeof x.gestion!=='number'||!Number.isInteger(x.gestion)||x.gestion<1||x.gestion>9999)throw new BadRequestException('Gestión inválida.');
  const inicio=fecha(x.fechaInicio),fin=fecha(x.fechaFin);
  if(fin<inicio)throw new BadRequestException('La fecha final no puede preceder a la inicial.');
  return {direccion:idDocumento(x.direccionId),gestion:x.gestion,codigo:textoDocumento(x.codigo,'Código del periodo',20,1),inicio,fin};
}
export function validarExpediente(entrada:unknown,crear:boolean){
  const x=campos(entrada,['periodoId','codigo','asunto','descripcion',crear?'direccionId':'versionControl']);
  return {direccion:crear?idDocumento(x.direccionId):undefined,periodo:idDocumento(x.periodoId),codigo:opcional(x.codigo,'Código',50)||null,
    asunto:textoDocumento(x.asunto,'Asunto',250,1),descripcion:opcional(x.descripcion,'Descripción',2000),version:crear?undefined:control(x.versionControl)};
}
