import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { QueryFailedError, QueryRunner } from 'typeorm';
import { AutorizacionesRepository, DirectorContexto } from '../datos/autorizaciones.repository';
import { hashToken } from '../../infraestructura/seguridad/seguridad.util';

export const PERMISO_ADMIN = 'AUTORIZACIONES_ADMINISTRAR';

function datos(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new BadRequestException('Datos inválidos.');
  return valor as Record<string, unknown>;
}
function soloClaves(d: Record<string, unknown>, permitidas: string[]): void {
  if (Object.keys(d).some(k => !permitidas.includes(k))) throw new BadRequestException('Se enviaron campos no permitidos.');
}
function texto(valor: unknown, nombre: string, max: number): string {
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > max || Array.from(valor).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw new BadRequestException(`${nombre} no es válido.`);
  }
  return valor.trim();
}
function identificador(valor: unknown): string {
  const id = String(valor);
  if (!/^[1-9]\d{0,17}$/.test(id)) throw new BadRequestException('Identificador no válido.');
  return id;
}
function permisos(valor: unknown): string[] {
  if (!Array.isArray(valor) || valor.length > 50 || valor.some(x => typeof x !== 'string' || !/^[A-Z_]{3,60}$/.test(x))) {
    throw new BadRequestException('Lista de permisos inválida.');
  }
  return [...new Set(valor as string[])];
}
function fechaFin(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(valor)) {
    throw new BadRequestException('La vigencia debe indicarse en UTC (ISO 8601).');
  }
  const t = Date.parse(valor);
  if (!Number.isFinite(t) || t < Date.now() + 60_000) {
    throw new BadRequestException('La vigencia debe finalizar en una fecha futura.');
  }
  return new Date(t).toISOString();
}
function errorPersistencia(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const codigo = (error.driverError as { code?: string } | undefined)?.code;
    if (codigo === '23505' || codigo === '23P01') {
      throw new ConflictException('Ya existe un rol o una asignación incompatible con el periodo solicitado.');
    }
    if (codigo === '23514' || codigo === '23503') {
      throw new BadRequestException('Los datos no cumplen las restricciones institucionales.');
    }
  }
  throw error;
}

/** La autorización se comprueba con la sesión real y permisos vigentes, nunca con datos del navegador. */
@Injectable()
export class AutorizacionesService {
  constructor(private readonly repo: AutorizacionesRepository) {}

  private async director(token: string | null, q?: QueryRunner): Promise<DirectorContexto> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ForbiddenException('Acceso institucional no autorizado.');
    const actor = await this.repo.directorAutorizado(hashToken(token), q);
    if (!actor) throw new ForbiddenException('Necesitás autoridad institucional y permiso vigente para esta operación.');
    return actor;
  }

  /** Punto único reutilizable por futuros módulos: validar sesión y permiso efectivo en cada operación. */
  async exigirPermiso(token: string | null, codigo: string, idDireccion: string, q?:QueryRunner): Promise<void> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Iniciá sesión para continuar.');
    const usuarioId = await this.repo.usuarioDeSesion(hashToken(token),q);
    if (!usuarioId) throw new UnauthorizedException('La sesión ha expirado o fue invalidada.');
    const permitidos = await this.repo.permisosEfectivos(usuarioId, idDireccion,q);
    if (!permitidos.includes(codigo)) throw new ForbiddenException('No contás con autorización vigente para esta operación.');
  }

  async contexto(token: string | null) {
    const actor = await this.director(token);
    const facultades = await this.repo.permisosEfectivos(actor.id_usuario, actor.id_direccion);
    return { direccion: { id: actor.id_direccion, codigo: actor.codigo_direccion,
      nombre: actor.nombre_direccion }, permisos: facultades };
  }

  async catalogo(token: string | null) {
    const actor = await this.director(token);
    return { roles: await this.repo.roles(actor.id_direccion), permisos: await this.repo.permisosCatalogo() };
  }

  async buscarUsuarios(token: string | null, q: unknown) {
    await this.director(token);
    if (q !== undefined && (typeof q !== 'string' || q.length > 70)) {
      throw new BadRequestException('Criterio de búsqueda inválido.');
    }
    const textoBusqueda = typeof q === 'string' ? q.trim().replace(/[\\%_]/g, '\\$&') : '';
    return { usuarios: await this.repo.usuariosVerificados(`%${textoBusqueda}%`, 30) };
  }

  async consultarAsignaciones(token: string | null, id?: unknown) {
    const actor = await this.director(token);
    return { asignaciones: await this.repo.asignaciones(actor.id_direccion,
      id === undefined || id === '' ? undefined : identificador(id)) };
  }

  private async denegacion(token: string | null, accion: string): Promise<void> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    try { await this.repo.registrarRechazo(hashToken(token), accion); }
    catch { /* El fallo secundario de auditoría no debe ocultar la causa original del rechazo. */ }
  }

  private async auditar(q: QueryRunner, actor: DirectorContexto, accion: string, entidad: string,
    id: string, antes: unknown, despues: unknown): Promise<void> {
    await q.query(`INSERT INTO registro_auditoria (tipo_actor,accion,tipo_entidad,identificador_entidad,
      origen,datos_anteriores,datos_posteriores,resultado,identificador_correlacion,id_direccion,id_usuario)
      VALUES ('HUMANO',$1,$2,$3,'APLICACION',$4::jsonb,$5::jsonb,'EXITO',$6,$7,$8)`,
    [accion,entidad,id,antes === null ? null : JSON.stringify(antes),
      despues === null ? null : JSON.stringify(despues),randomUUID(),actor.id_direccion,actor.id_usuario]);
  }

  private async facultadParaDelegar(q: QueryRunner, actor: DirectorContexto, codigos: string[]): Promise<void> {
    const catalogo = await this.repo.permisosCatalogo();
    const existentes = new Set(catalogo.map(p => p.codigo));
    const propias = new Set(await this.repo.permisosEfectivos(actor.id_usuario, actor.id_direccion, q));
    // El permiso de administración solo procede de la provisión inicial del Director.
    if (codigos.includes(PERMISO_ADMIN) || codigos.some(c => !existentes.has(c) || !propias.has(c))) {
      throw new ForbiddenException('El permiso solicitado no puede delegarse desde tus atribuciones.');
    }
  }

  private async usuarioHabilitado(q: QueryRunner, id: string): Promise<void> {
    const f = (await q.query('SELECT id_usuario FROM usuario WHERE id_usuario=$1 AND estado_cuenta=\'ACTIVA\' FOR UPDATE',
      [id])) as Array<{ id_usuario: string }>;
    if (!f.length) throw new BadRequestException('La cuenta destinataria no existe o no está verificada y activa.');
  }

  async crearRol(token: string | null, entrada: unknown) {
    const d = datos(entrada);
    soloClaves(d,['nombre','descripcion','permisos']);
    const nombre = texto(d.nombre,'Nombre del rol',100);
    const descripcion = d.descripcion === undefined ? '' : (typeof d.descripcion === 'string' && d.descripcion.length <= 500 ? d.descripcion.trim() : (() => { throw new BadRequestException('Descripción inválida.'); })());
    const codigos = permisos(d.permisos);
    try {
      return await this.repo.enTransaccion(async q => {
        const actor = await this.director(token,q);
        await this.facultadParaDelegar(q,actor,codigos);
        const filas = (await q.query(`INSERT INTO rol(id_direccion,nombre,descripcion,creado_por,actualizado_por)
          VALUES ($1,$2,$3,$4,$4) RETURNING id_rol::text`,
        [actor.id_direccion,nombre,descripcion,actor.id_usuario])) as Array<{id_rol:string}>;
        const id = filas[0].id_rol;
        for (const codigo of codigos) {
          await q.query('INSERT INTO rol_permiso(id_rol,id_permiso) SELECT $1,id_permiso FROM permiso WHERE codigo=$2', [id,codigo]);
        }
        await this.auditar(q,actor,'ROL_CREAR','ROL',id,null,{nombre,codigos});
        return { id, mensaje:'Rol creado sin asignaciones automáticas.' };
      });
    } catch(e) { await this.denegacion(token,'ROL_CREAR'); errorPersistencia(e); }
  }

  async actualizarRol(token: string | null, idValor: unknown, entrada: unknown) {
    const id = identificador(idValor);
    const d = datos(entrada);
    soloClaves(d,['nombre','descripcion','permisos','versionControl']);
    const nombre = texto(d.nombre,'Nombre del rol',100);
    const descripcion = d.descripcion === undefined ? '' : (typeof d.descripcion === 'string' && d.descripcion.length<=500 ? d.descripcion.trim() : (() => { throw new BadRequestException('Descripción inválida.'); })());
    const codigos = permisos(d.permisos);
    if (!Number.isSafeInteger(d.versionControl) || Number(d.versionControl)<0) throw new BadRequestException('Versión de rol inválida.');
    try {
      return await this.repo.enTransaccion(async q => {
        const actor = await this.director(token,q);
        const roles = (await q.query(`SELECT id_rol,nombre,es_sistema,version_control FROM rol
          WHERE id_rol=$1 AND id_direccion=$2 FOR UPDATE`, [id,actor.id_direccion])) as Array<{
          id_rol:string;nombre:string;es_sistema:boolean;version_control:number
        }>;
        const rol = roles[0];
        if (!rol) throw new BadRequestException('El rol no pertenece a tu Dirección.');
        if (rol.es_sistema) throw new ForbiddenException('El rol de autoridad institucional no se modifica desde esta operación.');
        if (rol.version_control !== d.versionControl) throw new ConflictException('El rol fue modificado por otra persona. Actualizá la vista.');
        await this.facultadParaDelegar(q,actor,codigos);
        const actuales = (await q.query('SELECT p.codigo FROM rol_permiso rp JOIN permiso p USING(id_permiso) WHERE rp.id_rol=$1',
          [id])) as Array<{codigo:string}>;
        const anteriores = actuales.map(x=>x.codigo);
        const ampliacion = codigos.some(c => !anteriores.includes(c));
        if (ampliacion) {
          const afectados = (await q.query(`SELECT 1 FROM asignacion_rol WHERE id_rol=$1
            AND fecha_revocacion IS NULL AND fecha_inicio<=now()
            AND (fecha_fin IS NULL OR fecha_fin>now()) LIMIT 1`,[id])) as unknown[];
          if (afectados.length) throw new ConflictException('Para ampliar un rol asignado, primero revocá sus asignaciones y confirmá explícitamente los nuevos permisos.');
        }
        await q.query(`UPDATE rol SET nombre=$2,descripcion=$3,version_control=version_control+1,
          fecha_actualizacion=now(),actualizado_por=$4 WHERE id_rol=$1`, [id,nombre,descripcion,actor.id_usuario]);
        await q.query('DELETE FROM rol_permiso WHERE id_rol=$1', [id]);
        for (const codigo of codigos) {
          await q.query('INSERT INTO rol_permiso(id_rol,id_permiso) SELECT $1,id_permiso FROM permiso WHERE codigo=$2', [id,codigo]);
        }
        await this.auditar(q,actor,'ROL_ACTUALIZAR','ROL',id,{nombre:rol.nombre,permisos:anteriores}, {nombre,permisos:codigos});
        return {mensaje:'Rol actualizado.',versionControl:rol.version_control+1};
      });
    } catch(e) { await this.denegacion(token,'ROL_ACTUALIZAR'); errorPersistencia(e); }
  }

  async asignarRol(token: string | null, entrada: unknown) {
    const d=datos(entrada);soloClaves(d,['usuarioId','rolId','fechaFin']);
    const usuarioId=identificador(d.usuarioId), rolId=identificador(d.rolId), fin=fechaFin(d.fechaFin);
    try {
      return await this.repo.enTransaccion(async q=>{
        const actor=await this.director(token,q);
        await this.usuarioHabilitado(q,usuarioId);
        const filas=(await q.query(`SELECT id_rol,es_sistema FROM rol WHERE id_rol=$1 AND id_direccion=$2 AND estado='ACTIVO' FOR UPDATE`,
          [rolId,actor.id_direccion])) as Array<{id_rol:string;es_sistema:boolean}>;
        if (!filas.length || filas[0].es_sistema) throw new ForbiddenException('Este rol no está habilitado para asignaciones ordinarias.');
        const cps=(await q.query('SELECT p.codigo FROM rol_permiso rp JOIN permiso p USING(id_permiso) WHERE rp.id_rol=$1',
          [rolId])) as Array<{codigo:string}>;
        await this.facultadParaDelegar(q,actor,cps.map(x=>x.codigo));
        const creados=(await q.query(`INSERT INTO asignacion_rol(id_usuario,id_rol,asignado_por,fecha_fin)
          VALUES ($1,$2,$3,$4) RETURNING id_asignacion_rol::text`, [usuarioId,rolId,actor.id_usuario,fin])) as Array<{id_asignacion_rol:string}>;
        const id=creados[0].id_asignacion_rol;
        await this.auditar(q,actor,'ROL_ASIGNAR','ASIGNACION_ROL',id,null,{usuarioId,rolId,fechaFin:fin});
        return { id,mensaje:'Rol asignado directamente a la cuenta verificada.' };
      });
    } catch(e) { await this.denegacion(token,'ROL_ASIGNAR'); errorPersistencia(e); }
  }

  async asignarPermiso(token: string | null, entrada: unknown) {
    const d=datos(entrada);soloClaves(d,['usuarioId','codigoPermiso','fechaFin']);
    const usuarioId=identificador(d.usuarioId), codigo=texto(d.codigoPermiso,'Permiso',60), fin=fechaFin(d.fechaFin);
    try {
      return await this.repo.enTransaccion(async q=>{
        const actor=await this.director(token,q);
        await this.usuarioHabilitado(q,usuarioId);
        await this.facultadParaDelegar(q,actor,[codigo]);
        const creados=(await q.query(`INSERT INTO asignacion_permiso(id_usuario,id_permiso,id_direccion,asignado_por,fecha_fin)
          SELECT $1,id_permiso,$3,$4,$5 FROM permiso WHERE codigo=$2 RETURNING id_asignacion_permiso::text`,
          [usuarioId,codigo,actor.id_direccion,actor.id_usuario,fin])) as Array<{id_asignacion_permiso:string}>;
        if (!creados.length) throw new BadRequestException('Permiso inexistente.');
        const id=creados[0].id_asignacion_permiso;
        await this.auditar(q,actor,'PERMISO_ASIGNAR','ASIGNACION_PERMISO',id,null,{usuarioId,codigo,fechaFin:fin});
        return {id,mensaje:'Permiso asignado directamente a la cuenta verificada.'};
      });
    } catch(e) { await this.denegacion(token,'PERMISO_ASIGNAR'); errorPersistencia(e); }
  }

  private async asignacion(q:QueryRunner,actor:DirectorContexto,tipo:string,id:string) {
    if (tipo==='ROL') {
      const filas=(await q.query(`SELECT ar.id_asignacion_rol AS id,ar.id_usuario::text AS usuario_id,
        ar.fecha_inicio,ar.fecha_fin,ar.fecha_revocacion,ar.id_rol::text AS referencia
        FROM asignacion_rol ar JOIN rol r ON r.id_rol=ar.id_rol
        WHERE ar.id_asignacion_rol=$1 AND r.id_direccion=$2 FOR UPDATE OF ar`,
        [id,actor.id_direccion])) as Array<{id:string;usuario_id:string;fecha_inicio:Date;fecha_fin:Date|null;fecha_revocacion:Date|null;referencia:string}>;
      if (!filas.length) throw new ForbiddenException('Asignación fuera de tu Dirección o inexistente.');
      const rol=(await q.query('SELECT es_sistema FROM rol WHERE id_rol=$1',[filas[0].referencia])) as Array<{es_sistema:boolean}>;
      if (rol[0]?.es_sistema) throw new ForbiddenException('No se puede alterar la autoridad institucional mediante CU-02.');
      const cps=(await q.query('SELECT p.codigo FROM rol_permiso rp JOIN permiso p USING(id_permiso) WHERE rp.id_rol=$1',
        [filas[0].referencia])) as Array<{codigo:string}>;
      await this.facultadParaDelegar(q,actor,cps.map(x=>x.codigo));
      return filas[0];
    }
    if (tipo==='PERMISO') {
      const filas=(await q.query(`SELECT ap.id_asignacion_permiso AS id,ap.id_usuario::text AS usuario_id,
        ap.fecha_inicio,ap.fecha_fin,ap.fecha_revocacion,p.codigo AS referencia
        FROM asignacion_permiso ap JOIN permiso p ON p.id_permiso=ap.id_permiso
        WHERE ap.id_asignacion_permiso=$1 AND ap.id_direccion=$2 FOR UPDATE OF ap`,
        [id,actor.id_direccion])) as Array<{id:string;usuario_id:string;fecha_inicio:Date;fecha_fin:Date|null;fecha_revocacion:Date|null;referencia:string}>;
      if (!filas.length) throw new ForbiddenException('Asignación fuera de tu Dirección o inexistente.');
      await this.facultadParaDelegar(q,actor,[filas[0].referencia]);
      return filas[0];
    }
    throw new BadRequestException('Tipo de asignación inválido.');
  }

  async modificarVigencia(token:string|null,tipoValor:unknown,idValor:unknown,entrada:unknown) {
    const tipo=texto(tipoValor,'Tipo',20),id=identificador(idValor),d=datos(entrada);
    soloClaves(d,['fechaFin']);
    if (!Object.hasOwn(d,'fechaFin')) throw new BadRequestException('La nueva vigencia es obligatoria.');
    const fin=fechaFin(d.fechaFin);
    try {
      return await this.repo.enTransaccion(async q=>{
        const actor=await this.director(token,q);
        const anterior=await this.asignacion(q,actor,tipo,id);
        if (anterior.fecha_revocacion || (anterior.fecha_fin && new Date(anterior.fecha_fin)<=new Date())) {
          throw new ConflictException('Una asignación revocada o vencida no puede reactivarse.');
        }
        if (tipo==='ROL') {
          await q.query('UPDATE asignacion_rol SET fecha_fin=$2 WHERE id_asignacion_rol=$1',[id,fin]);
        } else {
          await q.query('UPDATE asignacion_permiso SET fecha_fin=$2 WHERE id_asignacion_permiso=$1',[id,fin]);
        }
        await this.auditar(q,actor,'ASIGNACION_VIGENCIA','ASIGNACION_'+tipo,id,
          {fechaFin:anterior.fecha_fin},{fechaFin:fin});
        return {mensaje:'Vigencia actualizada.'};
      });
    } catch(e) { await this.denegacion(token,'ASIGNACION_VIGENCIA'); errorPersistencia(e); }
  }

  async revocar(token:string|null,tipoValor:unknown,idValor:unknown,entrada:unknown) {
    const tipo=texto(tipoValor,'Tipo',20),id=identificador(idValor),d=datos(entrada);
    soloClaves(d,['motivo']);
    const motivo=texto(d.motivo,'Motivo',300);
    try {
      return await this.repo.enTransaccion(async q=>{
        const actor=await this.director(token,q);
        const anterior=await this.asignacion(q,actor,tipo,id);
        if (anterior.fecha_revocacion || (anterior.fecha_fin && new Date(anterior.fecha_fin)<=new Date())) {
          throw new ConflictException('La asignación ya está revocada o vencida.');
        }
        const tabla=tipo==='ROL'?'asignacion_rol':'asignacion_permiso';
        const col=tipo==='ROL'?'id_asignacion_rol':'id_asignacion_permiso';
        await q.query(`UPDATE ${tabla} SET fecha_revocacion=now(),revocado_por=$2,motivo_revocacion=$3 WHERE ${col}=$1`,
          [id,actor.id_usuario,motivo]);
        await this.auditar(q,actor,'ASIGNACION_REVOCAR','ASIGNACION_'+tipo,id,
          {usuarioId:anterior.usuario_id,referencia:anterior.referencia}, {motivo});
        return {mensaje:'Autorización revocada. Las nuevas operaciones protegidas comprobarán los permisos vigentes.'};
      });
    } catch(e) { await this.denegacion(token,'ASIGNACION_REVOCAR'); errorPersistencia(e); }
  }
}
