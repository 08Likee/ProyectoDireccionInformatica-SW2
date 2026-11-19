import { BadRequestException } from '@nestjs/common';
import { basename } from 'node:path';

// Límite operativo propuesto: configurable de 1 a 50 MB, sujeto a validación institucional.
const maximoMb = Number(process.env.DOCUMENTOS_MAX_MB ?? '50');
if (!Number.isInteger(maximoMb) || maximoMb < 1 || maximoMb > 50) {
  throw new Error('DOCUMENTOS_MAX_MB debe ser un entero entre 1 y 50.');
}
export const TAMANO_MAXIMO_ARCHIVO = maximoMb * 1024 * 1024;
export type ArchivoSubido = { originalname: string; buffer: Buffer; size: number; mimetype?: string };
export type ArchivoVerificado = { nombre: string; tipoMime: string; tamano: number; buffer: Buffer };

function entradasZip(buffer: Buffer): Set<string> {
  // Leer exclusivamente las cabeceras del directorio central; nunca extraer contenido ZIP.
  const entradas = new Set<string>();
  let posicion = 0;
  while (posicion + 46 <= buffer.length) {
    const indice = buffer.indexOf('PK\x01\x02', posicion, 'binary');
    if (indice < 0) break;
    if (indice + 46 > buffer.length) break;
    const flags = buffer.readUInt16LE(indice + 8);
    const nombreLen = buffer.readUInt16LE(indice + 28);
    const extraLen = buffer.readUInt16LE(indice + 30);
    const comentarioLen = buffer.readUInt16LE(indice + 32);
    const fin = indice + 46 + nombreLen + extraLen + comentarioLen;
    if (fin > buffer.length || flags & 1) return new Set(); // Rechazar ZIP cifrados.
    entradas.add(buffer.subarray(indice + 46, indice + 46 + nombreLen).toString('utf8'));
    if (entradas.size > 2500) return new Set();
    posicion = fin;
  }
  return entradas;
}

/** Rechazar controles ASCII en nombres y metadatos; DEL también es inválido. */
function contieneControles(texto: string): boolean {
  for (const caracter of texto) {
    const codigo = caracter.charCodeAt(0);
    if (codigo <= 31 || codigo === 127) return true;
  }
  return false;
}

/** En CSV se permiten tabulaciones, saltos de línea y retornos de carro. */
function contieneControlesCsv(texto: string): boolean {
  for (const caracter of texto) {
    const codigo = caracter.charCodeAt(0);
    if ((codigo >= 1 && codigo <= 8) || codigo === 11 || (codigo >= 14 && codigo <= 31)) return true;
  }
  return false;
}

/** Detección por extensión y firma: no confiar en Content-Type del navegador. */
export function validarArchivo(valor: ArchivoSubido | undefined, maximo = TAMANO_MAXIMO_ARCHIVO): ArchivoVerificado {
  if (!valor || !Buffer.isBuffer(valor.buffer) || !Number.isSafeInteger(valor.size) || valor.size === 0
    || valor.buffer.length !== valor.size || valor.size > maximo) {
    throw new BadRequestException('El archivo está vacío, incompleto o supera el límite permitido.');
  }
  const nombre = basename(valor.originalname.replaceAll('\\','/'));
  if (!nombre || nombre.length > 200 || contieneControles(nombre) || nombre === '.' || nombre === '..') {
    throw new BadRequestException('Nombre de archivo inválido.');
  }
  const ext = nombre.split('.').pop()?.toLowerCase();
  const b = valor.buffer;
  let tipoMime: string | undefined;
  if (ext === 'pdf' && b.subarray(0,5).toString('ascii') === '%PDF-'
    && b.subarray(-2048).includes(Buffer.from('%%EOF'))) tipoMime = 'application/pdf';
  if ((ext === 'jpg' || ext === 'jpeg') && b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b.subarray(-2).equals(Buffer.from([0xff,0xd9]))) tipoMime = 'image/jpeg';
  if (ext === 'png' && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    && b.subarray(-12).equals(Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130]))) tipoMime = 'image/png';
  if (ext === 'csv' && b.length <= maximo) {
    try {
      const texto = new TextDecoder('utf-8', {fatal:true}).decode(b);
      if (!texto.includes('\0') && !contieneControlesCsv(texto)) tipoMime = 'text/csv';
    } catch { /* archivo no codificado en UTF-8 */ }
  }
  if ((ext === 'docx' || ext === 'xlsx') && b.subarray(0,4).toString('binary') === 'PK\x03\x04') {
    const entradas = entradasZip(b);
    if (entradas.has('[Content_Types].xml')) {
      if (ext === 'docx' && entradas.has('word/document.xml')) {
        tipoMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
      if (ext === 'xlsx' && entradas.has('xl/workbook.xml')) {
        tipoMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }
    }
  }
  if (!tipoMime) throw new BadRequestException('Formato no admitido o contenido incompatible con su extensión.');
  return { nombre, tipoMime, tamano: valor.size, buffer: b };
}

export function textoDocumento(valor: unknown, campo: string, limite: number, minimo = 2): string {
  if (typeof valor !== 'string' || valor.trim().length < minimo || valor.trim().length > limite
    || contieneControles(valor)) throw new BadRequestException(`${campo} no es válido.`);
  return valor.trim();
}
export function idDocumento(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[1-9]\d{0,18}$/.test(valor) || BigInt(valor) > 9223372036854775807n) {
    throw new BadRequestException('Identificador documental no válido.');
  }
  return valor;
}
