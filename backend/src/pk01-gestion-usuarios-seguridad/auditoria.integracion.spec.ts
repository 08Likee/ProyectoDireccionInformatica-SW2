/** CU-03: consulta HTTP real y aislamiento entre Direcciones sobre PostgreSQL. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { hashToken, tokenAleatorio } from '../infraestructura/seguridad/seguridad.util';

describe('CU-03 integración HTTP + PostgreSQL', () => {
  let app: INestApplication;
  let db: DataSource;
  const sufijo = randomBytes(6).toString('hex');
  let auditor = '';
  let comun = '';
  let direccion = '';
  let ajena = '';
  let eventoVisible = '';
  let eventoAjeno = '';
  let asignacion = '';
  let sesionAuditor = '';
  let sesionComun = '';

  async function id(sql: string, args: unknown[]): Promise<string> {
    const filas = (await db.query(sql,args)) as Array<{ id: string }>;
    return filas[0].id;
  }
  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports:[AppModule] }).compile();
    app = modulo.createNestApplication();
    await app.init();db = app.get(DataSource);
    const crear = async (nombre: string): Promise<string> => id(`INSERT INTO usuario(
      identificador_personal,nombres,apellidos,correo,contrasena_hash,estado_cuenta,fecha_verificacion)
      VALUES($1,$2,'Prueba',$3,'HASH_INHABILITADO','ACTIVA',now()) RETURNING id_usuario::text AS id`,
    [`${nombre.slice(0,3)}${sufijo}`,nombre,`${nombre.toLowerCase()}${sufijo}@example.invalid`]);
    auditor = await crear('Auditor');
    comun = await crear('Comun');
    direccion = await id(`INSERT INTO direccion_institucional(codigo,nombre)
      VALUES($1,'Dirección prueba auditoría') RETURNING id_direccion::text AS id`, [`AUD_${sufijo}`]);
    ajena = await id(`INSERT INTO direccion_institucional(codigo,nombre)
      VALUES($1,'Dirección fuera de ámbito') RETURNING id_direccion::text AS id`, [`EXT_AUD_${sufijo}`]);
    asignacion = await id(`INSERT INTO asignacion_permiso(id_usuario,id_direccion,id_permiso,asignado_por)
      SELECT $1,$2,id_permiso,$1 FROM permiso WHERE codigo='AUDITORIA_CONSULTAR'
      RETURNING id_asignacion_permiso::text AS id`, [auditor,direccion]);
    const sesionA = tokenAleatorio();
    const sesionC = tokenAleatorio();
    await db.query(`INSERT INTO sesion(identificador_seguro,id_usuario,fecha_expiracion)
      VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')`,
    [hashToken(sesionA),auditor,hashToken(sesionC),comun]);
    sesionAuditor = `di_sesion=${sesionA}`;
    sesionComun = `di_sesion=${sesionC}`;
    const crearEvento = (d: string, accion: string, datos: unknown) => id(`INSERT INTO registro_auditoria(
      tipo_actor,accion,tipo_entidad,identificador_entidad,origen,datos_posteriores,resultado,
      identificador_correlacion,id_direccion,id_usuario)
      VALUES('HUMANO',$1,'ROL','123','APLICACION',$2::jsonb,'EXITO',$3,$4,$5)
      RETURNING id_auditoria::text AS id`, [accion,JSON.stringify(datos),randomUUID(),d,auditor]);
    eventoVisible = await crearEvento(direccion,'ROL_ASIGNAR',{nombre:'Coordinación',token:'SECRETO_INTERNO',
      contrasena:'SECRETO_CLAVE',permisos:['AUDITORIA_CONSULTAR']});
    eventoAjeno = await crearEvento(ajena,'ROL_EXTERNO',{nombre:'No accesible'});
  },60_000);

  afterAll(async () => {
    if (db?.isInitialized) {
      if (direccion && ajena) await db.query('DELETE FROM registro_auditoria WHERE id_direccion=ANY($1::bigint[])',[[direccion,ajena]]);
      if (asignacion) await db.query('DELETE FROM asignacion_permiso WHERE id_asignacion_permiso=$1',[asignacion]);
      if (auditor && comun) await db.query('DELETE FROM sesion WHERE id_usuario=ANY($1::bigint[])',[[auditor,comun]]);
      if (direccion && ajena) await db.query('DELETE FROM direccion_institucional WHERE id_direccion=ANY($1::bigint[])',[[direccion,ajena]]);
      if (auditor && comun) await db.query('DELETE FROM usuario WHERE id_usuario=ANY($1::bigint[])',[[auditor,comun]]);
    }
    if (app) await app.close();
  },40_000);

  it('rechaza sesiones ausentes, cuentas sin permiso y ámbitos ajenos', async () => {
    await request(app.getHttpServer()).get('/api/auditoria/direcciones').expect(401);
    await request(app.getHttpServer()).get('/api/auditoria/direcciones').set('Cookie',sesionComun).expect(403);
    const direcciones = await request(app.getHttpServer()).get('/api/auditoria/direcciones')
      .set('Cookie',sesionAuditor).expect(200);
    expect(direcciones.body.direcciones).toEqual([expect.objectContaining({id:direccion})]);
    await request(app.getHttpServer()).get(`/api/auditoria/eventos?direccionId=${ajena}`)
      .set('Cookie',sesionAuditor).expect(403);
  });

  it('filtra sin exponer registros de otra Dirección y muestra detalles depurados', async () => {
    const inicial = (await db.query('SELECT COUNT(*)::int AS total FROM registro_auditoria WHERE id_direccion=$1',[direccion])) as Array<{total:number}>;
    const listado = await request(app.getHttpServer()).get(`/api/auditoria/eventos?direccionId=${direccion}&accion=ROL_ASIGNAR&pagina=0`)
      .set('Cookie',sesionAuditor).expect(200);
    expect(listado.body.eventos).toEqual([expect.objectContaining({id:eventoVisible,accion:'ROL_ASIGNAR'})]);
    expect(JSON.stringify(listado.body)).not.toContain('SECRETO_INTERNO');
    const detalle = await request(app.getHttpServer()).get(`/api/auditoria/eventos/${eventoVisible}?direccionId=${direccion}`)
      .set('Cookie',sesionAuditor).expect(200);
    expect(detalle.body.evento.datosPosteriores).toEqual({nombre:'Coordinación',permisos:['AUDITORIA_CONSULTAR']});
    expect(JSON.stringify(detalle.body)).not.toContain('SECRETO_INTERNO');
    expect(JSON.stringify(detalle.body)).not.toContain('SECRETO_CLAVE');
    await request(app.getHttpServer()).get(`/api/auditoria/eventos/${eventoAjeno}?direccionId=${direccion}`)
      .set('Cookie',sesionAuditor).expect(404);
    await request(app.getHttpServer()).get(`/api/auditoria/eventos?direccionId=${direccion}&desde=2026-02-30`)
      .set('Cookie',sesionAuditor).expect(400);
    const final = (await db.query('SELECT COUNT(*)::int AS total FROM registro_auditoria WHERE id_direccion=$1',[direccion])) as Array<{total:number}>;
    expect(final[0].total).toBe(inicial[0].total);
  });

  it('la revocación impide nuevas consultas con la misma sesión', async () => {
    await db.query(`UPDATE asignacion_permiso SET fecha_revocacion=now(),revocado_por=$2,motivo_revocacion='Fin de prueba'
      WHERE id_asignacion_permiso=$1`, [asignacion,auditor]);
    await request(app.getHttpServer()).get('/api/auditoria/direcciones')
      .set('Cookie',sesionAuditor).expect(403);
  });
});
