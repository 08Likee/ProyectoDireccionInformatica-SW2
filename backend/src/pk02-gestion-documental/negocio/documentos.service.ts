import { BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { QueryFailedError, QueryRunner } from 'typeorm';
import { hashToken } from '../../infraestructura/seguridad/seguridad.util';
import { AutorizacionesService } from '../../pk01-gestion-usuarios-seguridad/negocio/autorizaciones.service';
import { ArchivosPrivadosService } from '../datos/archivos-privados.service';
import { DocumentosRepository, DocumentoFila, VersionFila } from '../datos/documentos.repository';
import { ArchivoSubido, idDocumento, textoDocumento, validarArchivo, TAMANO_MAXIMO_ARCHIVO } from './validar-archivo';

import { AccesoDocumentalService, DOCUMENTOS_RESTRINGIDOS, RESTRICCIONES_GESTIONAR } from './acceso-documental.service';

const LECTURA = 'DOCUMENTOS_CONSULTAR';
const GESTION = 'DOCUMENTOS_GESTIONAR';
const MAX_VERSION = 1000;

function objeto(valor: unknown, permitidas: string[]): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new BadRequestException('Datos inválidos.');
  const x = valor as Record<string,unknown>;
  if (Object.keys(x).some(k=> !permitidas.includes(k))) throw new BadRequestException('Campos no permitidos.');
  return x;
}
function versionControl(valor: unknown): number {
  const numero = typeof valor === 'string' && /^\d{1,8}$/.test(valor) ? Number(valor) : valor;
  if (typeof numero !== 'number' || !Number.isSafeInteger(numero) || numero < 0) {
    throw new BadRequestException('Versión de control inválida.');
  }
  return numero;
}
function metadatos(entrada: unknown, conDireccion: boolean) {
  const x = objeto(entrada, conDireccion
    ? ['direccionId','titulo','categoria','descripcion'] : ['titulo','categoria','descripcion','versionControl']);
  return {
    direccionId: conDireccion ? idDocumento(x.direccionId) : undefined,
    titulo: textoDocumento(x.titulo,'Título',160),
    categoria: textoDocumento(x.categoria,'Categoría',80),
    descripcion: x.descripcion === undefined || x.descripcion === '' ? '' : textoDocumento(x.descripcion,'Descripción',1000,0),
    versionControl: conDireccion ? undefined : versionControl(x.versionControl),
  };
}
function confictoBD(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const codigo = (error.driverError as {code?:string}|undefined)?.code;
    if (codigo === '23505') throw new ConflictException('Ya existe un registro documental incompatible.');
    if (codigo === '23503' || codigo === '23514') throw new BadRequestException('Datos documentales inválidos.');
  }
  throw error;
}

@Injectable()
export class DocumentosService {
  constructor(private readonly repo: DocumentosRepository, private readonly archivos: ArchivosPrivadosService,
    private readonly autorizaciones: AutorizacionesService, private readonly acceso: AccesoDocumentalService) {}

  private async usuario(token: string | null,q?:QueryRunner): Promise<string> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Iniciá sesión para continuar.');
    const usuario = await this.repo.sesion(hashToken(token),q);
    if (!usuario) throw new UnauthorizedException('La sesión no está vigente.');
    return usuario;
  }
  private async permitir(token: string | null, codigo: string, direccionId: string): Promise<string> {
    const usuario = await this.usuario(token);
    await this.autorizaciones.exigirPermiso(token,codigo,direccionId);
    return usuario;
  }
  async ambitos(token: string | null) {
    const id = await this.usuario(token);
    const [consulta,gestion] = await Promise.all([this.repo.ambitos(id,LECTURA),this.repo.ambitos(id,GESTION)]);
    if (!consulta.length && !gestion.length) throw new ForbiddenException('No contás con permiso documental vigente.');
    const [administrables,especiales] = await Promise.all([this.repo.ambitos(id,RESTRICCIONES_GESTIONAR),this.repo.ambitos(id,DOCUMENTOS_RESTRINGIDOS)]);
    const restricciones = administrables.filter(d=>especiales.some(e=>e.id===d.id));
    return { consulta, gestion, restricciones, limiteBytes: TAMANO_MAXIMO_ARCHIVO, formatos: ['PDF','DOCX','XLSX','CSV','JPG','PNG'] };
  }
  async listar(token: string | null, filtros: unknown) {
    const f = objeto(filtros,['direccionId','pagina','busqueda']);
    const direccionId = idDocumento(f.direccionId);
    await this.permitir(token,LECTURA,direccionId);
    const pagina = f.pagina === undefined ? 0 : Number(f.pagina);
    if (f.pagina !== undefined && (typeof f.pagina !== 'string' || !/^\d{1,3}$/.test(f.pagina))) throw new BadRequestException('Página inválida.');
    if (!Number.isInteger(pagina) || pagina < 0 || pagina > 100) throw new BadRequestException('Página fuera del rango.');
    const busqueda = f.busqueda === undefined || f.busqueda === '' ? '' : textoDocumento(f.busqueda,'Búsqueda',100,1);
    const filas = await this.repo.listar(direccionId,busqueda,pagina,await this.acceso.tiene(token,DOCUMENTOS_RESTRINGIDOS,direccionId));
    return { documentos: filas.slice(0,20),pagina,haySiguiente:filas.length>20 };
  }
  async detalle(token: string | null, idRaw: unknown, direccionRaw: unknown) {
    const id = idDocumento(idRaw), direccionId = idDocumento(direccionRaw);
    await this.permitir(token,LECTURA,direccionId);
    const doc = await this.repo.documento(id,direccionId);
    if (!doc) throw new NotFoundException('Documento no disponible en la Dirección autorizada.');
    await this.acceso.exigir(token,direccionId,id,LECTURA);
    const versiones = await this.repo.versiones(id);
    return { documento:doc, versiones: versiones.map(v=>({
      id:v.id,numeroVersion:v.numeroVersion,nombreOriginal:v.nombreOriginal,
      tipoMime:v.tipoMime,tamanoBytes:v.tamanoBytes,fechaCreacion:v.fechaCreacion,
    })) };
  }
  private async auditar(q: QueryRunner, usuario: string, direccion: string, accion: string,
    id: string, antes: unknown, despues: unknown) {
    await q.query(`INSERT INTO registro_auditoria(tipo_actor,accion,tipo_entidad,identificador_entidad,
      origen,datos_anteriores,datos_posteriores,resultado,identificador_correlacion,id_direccion,id_usuario)
      VALUES('HUMANO',$1,'DOCUMENTO',$2,'APLICACION',$3::jsonb,$4::jsonb,'EXITO',$5,$6,$7)`,
    [accion,id,antes === null ? null : JSON.stringify(antes),despues === null ? null : JSON.stringify(despues),
      randomUUID(),direccion,usuario]);
  }
  private async confirmarPermiso(token: string | null, direccion: string, codigo = GESTION,q?:QueryRunner) {
    await this.autorizaciones.exigirPermiso(token,codigo,direccion,q);
  }
  async crear(token: string | null, entrada: unknown, archivo: ArchivoSubido | undefined) {
    const m = metadatos(entrada,true);
    const direccion = m.direccionId!;
    const usuario = await this.permitir(token,GESTION,direccion);
    const f = validarArchivo(archivo);
    const guardado = await this.archivos.guardar(f.buffer);
    try {
      return await this.repo.transaccion(async q => {
        await this.confirmarPermiso(token,direccion,GESTION,q);
        const datos = await q.query(`INSERT INTO documento (id_direccion,codigo,titulo,categoria,descripcion,creado_por,actualizado_por)
          VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id_documento::text AS id`,
        [direccion,randomUUID(),m.titulo,m.categoria,m.descripcion,usuario]) as Array<{id:string}>;
        const id = datos[0].id;
        await q.query(`INSERT INTO version_documento(id_documento,numero_version,clave_archivo,nombre_original,
          tipo_mime,tamano_bytes,sha256,cargado_por) VALUES($1,1,$2,$3,$4,$5,$6,$7)`,
        [id,guardado.clave,f.nombre,f.tipoMime,f.tamano,guardado.sha256,usuario]);
        await this.auditar(q,usuario,direccion,'DOCUMENTO_CREAR',id,null,
          {version:1});
        return { id, mensaje:'Documento incorporado y verificado.', versionActual:1, versionControl:0 };
      });
    } catch (e) {
      // Ante resultado ambiguo de COMMIT, conservar el archivo si PostgreSQL ya lo referencia.
      try { if (!await this.repo.archivoRegistrado(guardado.clave)) await this.archivos.descartar(guardado.clave); }
      catch { /* Priorizar un archivo huérfano a metadatos que apunten a bytes eliminados. */ }
      confictoBD(e);
    }
  }
  async actualizar(token: string | null, rawId: unknown, rawDireccion: unknown, entrada: unknown) {
    const id = idDocumento(rawId), direccion = idDocumento(rawDireccion), m = metadatos(entrada,false);
    await this.permitir(token,GESTION,direccion);
    try {
      return await this.repo.transaccion(async q => {
        await this.confirmarPermiso(token,direccion,GESTION,q);
        const anterior = await this.repo.documento(id,direccion,q,true);
        if (!anterior) throw new NotFoundException('Documento no disponible.');
        await this.acceso.exigir(token,direccion,id,GESTION,q);
        if (m.versionControl !== anterior.versionControl) throw new ConflictException('Otro usuario modificó el documento. Actualizá la vista.');
        await q.query(`UPDATE documento SET titulo=$2,categoria=$3,descripcion=$4,version_control=version_control+1,
          fecha_actualizacion=now(),actualizado_por=$5 WHERE id_documento=$1`,
        [id,m.titulo,m.categoria,m.descripcion,await this.usuario(token,q)]);
        await this.auditar(q,await this.usuario(token,q),direccion,'DOCUMENTO_ACTUALIZAR',id,
          {version:anterior.versionControl}, {version:anterior.versionControl+1,
          cambios:['titulo','categoria','descripcion'].filter(c => c === 'titulo' ? anterior.titulo !== m.titulo
            : c === 'categoria' ? anterior.categoria !== m.categoria : anterior.descripcion !== m.descripcion)});
        return { mensaje:'Metadatos actualizados.',versionControl:anterior.versionControl+1 };
      });
    } catch(e) { confictoBD(e); }
  }
  async nuevaVersion(token: string | null, rawId: unknown, entrada: unknown, archivo: ArchivoSubido | undefined) {
    const id = idDocumento(rawId);
    const x = objeto(entrada,['direccionId','versionControl']);
    const direccion = idDocumento(x.direccionId), control = versionControl(x.versionControl);
    const usuario = await this.permitir(token,GESTION,direccion);
    const f = validarArchivo(archivo);
    const guardado = await this.archivos.guardar(f.buffer);
    try {
      return await this.repo.transaccion(async q => {
        await this.confirmarPermiso(token,direccion,GESTION,q);
        const actual = await this.repo.documento(id,direccion,q,true);
        if (!actual) throw new NotFoundException('Documento no disponible.');
        await this.acceso.exigir(token,direccion,id,GESTION,q);
        if (actual.versionControl !== control) throw new ConflictException('El documento cambió. Actualizá la vista.');
        if (actual.versionActual >= MAX_VERSION) throw new ConflictException('Se alcanzó el límite de versiones.');
        const siguiente = actual.versionActual + 1;
        await q.query(`INSERT INTO version_documento(id_documento,numero_version,clave_archivo,nombre_original,
          tipo_mime,tamano_bytes,sha256,cargado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id,siguiente,guardado.clave,f.nombre,f.tipoMime,f.tamano,guardado.sha256,usuario]);
        await q.query(`UPDATE documento SET version_actual=$2,version_control=version_control+1,
          fecha_actualizacion=now(),actualizado_por=$3 WHERE id_documento=$1`, [id,siguiente,usuario]);
        await this.auditar(q,usuario,direccion,'DOCUMENTO_NUEVA_VERSION',id,
          {version:actual.versionActual}, {version:siguiente});
        return { mensaje:'Nueva versión incorporada.',versionActual:siguiente,versionControl:control+1 };
      });
    } catch (e) {
      // Ante resultado ambiguo de COMMIT, conservar el archivo si PostgreSQL ya lo referencia.
      try { if (!await this.repo.archivoRegistrado(guardado.clave)) await this.archivos.descartar(guardado.clave); }
      catch { /* Priorizar un archivo huérfano a metadatos que apunten a bytes eliminados. */ }
      confictoBD(e);
    }
  }
  async modificarRestriccion(token:string|null,rawId:unknown,rawDireccion:unknown,entrada:unknown) {
    const id=idDocumento(rawId), direccion=idDocumento(rawDireccion);
    const x=objeto(entrada,['restringido','motivo','versionControl']);
    if(typeof x.restringido!=='boolean')throw new BadRequestException('Indique la operación de restricción.');
    const motivo=textoDocumento(x.motivo,'Motivo',1000,1), control=versionControl(x.versionControl);
    const usuario=await this.permitir(token,RESTRICCIONES_GESTIONAR,direccion);
    return this.repo.transaccion(async q=>{
      const doc=await this.repo.documento(id,direccion,q,true);
      if(!doc)throw new NotFoundException('Documento no disponible.');
      await this.acceso.exigir(token,direccion,id,LECTURA,q);
      await this.acceso.exigir(token,direccion,id,GESTION,q);
      await this.autorizaciones.exigirPermiso(token,RESTRICCIONES_GESTIONAR,direccion,q);
      await this.autorizaciones.exigirPermiso(token,DOCUMENTOS_RESTRINGIDOS,direccion,q);
      if(doc.versionControl!==control || doc.restringido===x.restringido)throw new ConflictException('El documento cambió o ya tiene esa condición.');
      if(x.restringido)await q.query('INSERT INTO restriccion_documento(id_documento,registrado_por,motivo) VALUES($1,$2,$3)',[id,usuario,motivo]);
      else await q.query('UPDATE restriccion_documento SET fecha_revocacion=now(),revocado_por=$2,motivo_revocacion=$3 WHERE id_documento=$1 AND fecha_revocacion IS NULL',[id,usuario,motivo]);
      await q.query('UPDATE documento SET version_control=version_control+1,fecha_actualizacion=now(),actualizado_por=$2 WHERE id_documento=$1',[id,usuario]);
      await this.auditar(q,usuario,direccion,x.restringido?'DOCUMENTO_RESTRINGIR':'DOCUMENTO_LEVANTAR_RESTRICCION',id,{version:control},{version:control+1});
      return {mensaje:'Restricción actualizada.',versionControl:control+1};
    });
  }
  async descargar(token: string | null, rawId: unknown, rawDireccion: unknown, rawNumero: unknown): Promise<{datos:Buffer;archivo:VersionFila}> {
    const id=idDocumento(rawId), direccion=idDocumento(rawDireccion);
    const numero=Number(rawNumero);
    if (typeof rawNumero !== 'string' || !/^\d{1,4}$/.test(rawNumero) || !Number.isInteger(numero) || numero<1) {
      throw new BadRequestException('Versión inválida.');
    }
    await this.permitir(token,LECTURA,direccion);
    const doc: DocumentoFila|null=await this.repo.documento(id,direccion);
    if (!doc) throw new NotFoundException('Documento no disponible.');
    await this.acceso.exigir(token,direccion,id,LECTURA);
    const archivo=await this.repo.version(id,numero);
    if (!archivo) throw new NotFoundException('La versión solicitada no existe.');
    // Comprobar autorización de nuevo antes de entregar los bytes; no existe URL pública al volumen.
    await this.confirmarPermiso(token,direccion,LECTURA);
    const datos=await this.archivos.leer(archivo.claveArchivo,archivo.sha256);
    await this.acceso.exigir(token,direccion,id,LECTURA);
    return {datos,archivo};
  }
}
