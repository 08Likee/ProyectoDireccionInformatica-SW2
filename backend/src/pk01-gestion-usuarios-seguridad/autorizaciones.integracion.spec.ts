/** Integración real CU-02: autorización, transacciones, vigencias, ámbito y auditoría. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../app.module';
import { AutorizacionesService } from './negocio/autorizaciones.service';
import { tokenAleatorio, hashToken } from '../infraestructura/seguridad/seguridad.util';

interface Id { id: string }

describe('CU-02 integración HTTP + PostgreSQL', () => {
  let app: INestApplication;
  let db: DataSource;
  const sufijo=randomBytes(6).toString('hex');
  let director=''; let receptor=''; let pendiente=''; let dir=''; let otraDir='';
  let rolSistema=''; let rolAjeno='';
  let sesionDirector=''; let sesionComun=''; let tokenComun='';
  const todosUsuarios:string[]=[];

  async function insertId(sql:string,parametros:unknown[]):Promise<string> {
    const filas=(await db.query(sql,parametros)) as Id[];
    return filas[0].id;
  }
  beforeAll(async()=>{
    const modulo=await Test.createTestingModule({imports:[AppModule]}).compile();
    app=modulo.createNestApplication();
    await app.init();db=app.get(DataSource);
    const crear=async(suf:string,estado:'ACTIVA'|'PENDIENTE') => {
      const id=await insertId(`INSERT INTO usuario(identificador_personal,nombres,apellidos,correo,contrasena_hash,
        estado_cuenta,fecha_verificacion) VALUES($1,'Cuenta','Prueba',$2,'HASH_INHABILITADO',$3::text,
        CASE WHEN $3::text='ACTIVA' THEN now() ELSE NULL END) RETURNING id_usuario::text AS id`,
      [`${suf.slice(0,7)}${sufijo}`,`${suf}${sufijo}@example.invalid`,estado]);
      todosUsuarios.push(id);return id;
    };
    director=await crear('director','ACTIVA');receptor=await crear('receptor','ACTIVA');
    pendiente=await crear('pendiente','PENDIENTE');
    dir=await insertId(`INSERT INTO direccion_institucional(codigo,nombre)
      VALUES($1,'Prueba aislada CU02') RETURNING id_direccion::text AS id`,[`TEST_${sufijo}`]);
    otraDir=await insertId(`INSERT INTO direccion_institucional(codigo,nombre)
      VALUES($1,'Dirección ajena aislada') RETURNING id_direccion::text AS id`,[`TEST_EXT_${sufijo}`]);
    rolSistema=await insertId(`INSERT INTO rol(id_direccion,nombre,es_sistema,creado_por,actualizado_por)
      VALUES($1,'Autoridad de prueba',true,$2,$2) RETURNING id_rol::text AS id`,[dir,director]);
    rolAjeno=await insertId(`INSERT INTO rol(id_direccion,nombre,creado_por,actualizado_por)
      VALUES($1,'Rol externo',$2,$2) RETURNING id_rol::text AS id`,[otraDir,director]);
    await db.query(`INSERT INTO rol_permiso(id_rol,id_permiso)
      SELECT $1,id_permiso FROM permiso WHERE codigo IN ('AUTORIZACIONES_ADMINISTRAR','AUDITORIA_CONSULTAR','DOCUMENTOS_CONSULTAR')`,[rolSistema]);
    await db.query(`INSERT INTO asignacion_rol(id_usuario,id_rol,asignado_por)
      VALUES($1,$2,$1)`,[director,rolSistema]);
    await db.query('INSERT INTO autoridad_direccion(id_direccion,id_usuario) VALUES($1,$2)',[dir,director]);
    const tokenD=tokenAleatorio(),tokenC=tokenAleatorio();
    await db.query(`INSERT INTO sesion(identificador_seguro,id_usuario,fecha_expiracion)
      VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')`,
    [hashToken(tokenD),director,hashToken(tokenC),receptor]);
    sesionDirector=`di_sesion=${tokenD}`;sesionComun=`di_sesion=${tokenC}`;tokenComun=tokenC;
  },60_000);

  afterAll(async()=>{
    if (db?.isInitialized && dir && otraDir) {
      await db.query('DELETE FROM registro_auditoria WHERE id_direccion=ANY($1::bigint[]) OR id_usuario=ANY($2::bigint[])',[[dir,otraDir],todosUsuarios]);
      await db.query('DELETE FROM asignacion_permiso WHERE id_direccion=ANY($1::bigint[])',[[dir,otraDir]]);
      await db.query(`DELETE FROM asignacion_rol WHERE id_usuario=ANY($1::bigint[]) OR id_rol IN
        (SELECT id_rol FROM rol WHERE id_direccion=ANY($2::bigint[]))`,[todosUsuarios,[dir,otraDir]]);
      await db.query('DELETE FROM autoridad_direccion WHERE id_direccion=ANY($1::bigint[])',[[dir,otraDir]]);
      await db.query(`DELETE FROM rol_permiso WHERE id_rol IN
        (SELECT id_rol FROM rol WHERE id_direccion=ANY($1::bigint[]))`,[[dir,otraDir]]);
      await db.query('DELETE FROM rol WHERE id_direccion=ANY($1::bigint[])',[[dir,otraDir]]);
      await db.query('DELETE FROM direccion_institucional WHERE id_direccion=ANY($1::bigint[])',[[dir,otraDir]]);
      await db.query('DELETE FROM sesion WHERE id_usuario=ANY($1::bigint[])',[todosUsuarios]);
      await db.query('DELETE FROM usuario WHERE id_usuario=ANY($1::bigint[])',[todosUsuarios]);
    }
    if (app) await app.close();
  },40_000);

  function cookiesRespuesta(valor: string | string[] | undefined): string[] {
    if (Array.isArray(valor)) return valor;
    return valor ? [valor] : [];
  }
  async function csrf():Promise<{cookie:string;token:string}> {
    const respuesta=await request(app.getHttpServer()).get('/api/cuenta/csrf').expect(200);
    const cookies=cookiesRespuesta(respuesta.headers['set-cookie']);
    return {cookie:cookies.find(c=>c.startsWith('di_csrf='))!.split(';')[0],token:respuesta.body.csrfToken as string};
  }
  async function post(ruta:string,cookieSesion:string,datos:Record<string, unknown>,metodo:'post'|'put'|'patch'='post') {
    const c=await csrf();
    return request(app.getHttpServer())[metodo](ruta)
      .set('Cookie',`${c.cookie}; ${cookieSesion}`).set('x-csrf-token',c.token).send(datos);
  }

  it('rechaza usuarios no autorizados, peticiones CSRF y roles de otra Dirección',async()=>{
    await request(app.getHttpServer()).get('/api/administracion/contexto')
      .set('Cookie',sesionComun).expect(403);
    await request(app.getHttpServer()).get('/api/administracion/contexto')
      .set('Cookie',sesionDirector).expect(200);
    await request(app.getHttpServer()).post('/api/administracion/roles')
      .set('Cookie',sesionDirector).send({nombre:'No autorizado',permisos:[]}).expect(403);
    const fuera=await post('/api/administracion/asignaciones/roles',sesionDirector,
      {usuarioId:receptor,rolId:rolAjeno});
    expect(fuera.status).toBe(403);
    const sinPermisos=await request(app.getHttpServer()).get('/api/cuenta/sesion')
      .set('Cookie',sesionComun).expect(200);
    expect(sinPermisos.body.perfil.permisosInstitucionales).toEqual([]);
  });

  it('crea rol sin privilegios iniciales, asigna y audita, revoca con efecto inmediato',async()=>{
    const nuevo=await post('/api/administracion/roles',sesionDirector,
      {nombre:'Consulta de auditoría',descripcion:'Consulta autorizada',permisos:['AUDITORIA_CONSULTAR']});
    expect(nuevo.status).toBe(201);
    const rolId=nuevo.body.id as string;
    const noVerificado=await post('/api/administracion/asignaciones/roles',sesionDirector,
      {usuarioId:pendiente,rolId});
    expect(noVerificado.status).toBe(400);
    const privilegio=await post('/api/administracion/asignaciones/permisos',sesionDirector,
      {usuarioId:receptor,codigoPermiso:'AUTORIZACIONES_ADMINISTRAR'});
    expect(privilegio.status).toBe(403);
    const asignacion=await post('/api/administracion/asignaciones/roles',sesionDirector,{usuarioId:receptor,rolId});
    expect(asignacion.status).toBe(201);
    const asignacionId=asignacion.body.id as string;
    const efectivos=await request(app.getHttpServer()).get('/api/cuenta/sesion')
      .set('Cookie',sesionComun).expect(200);
    expect(efectivos.body.perfil.permisosInstitucionales).toContain('AUDITORIA_CONSULTAR');
    await expect(app.get(AutorizacionesService).exigirPermiso(tokenComun,'AUDITORIA_CONSULTAR',dir)).resolves.toBeUndefined();
    const duplicado=await post('/api/administracion/asignaciones/roles',sesionDirector,{usuarioId:receptor,rolId});
    expect(duplicado.status).toBe(409);
    const ampliacion=await post(`/api/administracion/roles/${rolId}`,sesionDirector,
      {nombre:'Consulta de auditoría',descripcion:'Consulta',permisos:['AUDITORIA_CONSULTAR','DOCUMENTOS_CONSULTAR'],versionControl:0},'put');
    expect(ampliacion.status).toBe(409);
    const vigencia=await post(`/api/administracion/asignaciones/ROL/${asignacionId}/vigencia`,sesionDirector,
      {fechaFin:new Date(Date.now()+3600000).toISOString()},'patch');
    expect(vigencia.status).toBe(200);
    const revocacion=await post(`/api/administracion/asignaciones/ROL/${asignacionId}/revocar`,sesionDirector,
      {motivo:'Fin de funciones de prueba'});
    expect(revocacion.status).toBe(200);
    const posteriores=await request(app.getHttpServer()).get('/api/cuenta/sesion')
      .set('Cookie',sesionComun).expect(200);
    expect(posteriores.body.perfil.permisosInstitucionales).toEqual([]);
    await expect(app.get(AutorizacionesService).exigirPermiso(tokenComun,'AUDITORIA_CONSULTAR',dir)).rejects.toThrow();
    const doble=await post(`/api/administracion/asignaciones/ROL/${asignacionId}/revocar`,sesionDirector,
      {motivo:'Repetición de operación'});
    expect(doble.status).toBe(409);
    const auditorias=(await db.query(`SELECT accion FROM registro_auditoria
      WHERE id_direccion=$1 ORDER BY fecha_hora`,[dir])) as Array<{accion:string}>;
    expect(auditorias.map(x=>x.accion)).toEqual(expect.arrayContaining(['ROL_CREAR','ROL_ASIGNAR','ASIGNACION_VIGENCIA','ASIGNACION_REVOCAR']));
  },60_000);

  it('permisos directos vencidos no habilitan nuevas operaciones',async()=>{
    const nuevo=await post('/api/administracion/asignaciones/permisos',sesionDirector,
      {usuarioId:receptor,codigoPermiso:'DOCUMENTOS_CONSULTAR',fechaFin:new Date(Date.now()+3600000).toISOString()});
    expect(nuevo.status).toBe(201);
    const previo=await request(app.getHttpServer()).get('/api/cuenta/sesion')
      .set('Cookie',sesionComun).expect(200);
    expect(previo.body.perfil.permisosInstitucionales).toContain('DOCUMENTOS_CONSULTAR');
    await db.query('UPDATE asignacion_permiso SET fecha_inicio=now()-interval \'2 hours\',fecha_fin=now()-interval \'1 hour\' WHERE id_asignacion_permiso=$1',
      [nuevo.body.id]);
    const despues=await request(app.getHttpServer()).get('/api/cuenta/sesion')
      .set('Cookie',sesionComun).expect(200);
    expect(despues.body.perfil.permisosInstitucionales).not.toContain('DOCUMENTOS_CONSULTAR');
  });
});
