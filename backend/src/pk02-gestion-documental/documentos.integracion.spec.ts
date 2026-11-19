/** CU-07. Persistencia, contenido físico, permisos revocados y auditoría sobre PostgreSQL. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { hashToken, tokenAleatorio } from '../infraestructura/seguridad/seguridad.util';

const pdf=Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF');

describe('CU-07 integración HTTP + PostgreSQL + archivos privados',()=>{
  let app:INestApplication;
  let db:DataSource;
  let usuario=''; let comun=''; let direccion='';let ajena='';let sesion='';let sesionComun='';
  let doc='';let asignacionLectura='';let asignacionGestion='';
  const sufijo=randomBytes(7).toString('hex');
  async function id(sql:string,args:unknown[]):Promise<string>{
    const filas=await db.query(sql,args) as Array<{id:string}>;return filas[0].id;
  }
  beforeAll(async()=>{
    const modulo=await Test.createTestingModule({imports:[AppModule]}).compile();
    app=modulo.createNestApplication();await app.init();db=app.get(DataSource);
    const crear=(nombre:string)=>id(`INSERT INTO usuario(identificador_personal,nombres,apellidos,correo,
      contrasena_hash,estado_cuenta,fecha_verificacion) VALUES($1,$2,'Prueba',$3,'HASH_INHABILITADO','ACTIVA',now())
      RETURNING id_usuario::text AS id`,[`${nombre.slice(0,3)}${sufijo}`,nombre,`${nombre.toLowerCase()}${sufijo}@example.invalid`]);
    usuario=await crear('Documental');comun=await crear('Comun');
    direccion=await id(`INSERT INTO direccion_institucional(codigo,nombre)
      VALUES($1,'Dirección de prueba documental') RETURNING id_direccion::text AS id`,[`DOC_${sufijo}`]);
    ajena=await id(`INSERT INTO direccion_institucional(codigo,nombre)
      VALUES($1,'Dirección ajena documental') RETURNING id_direccion::text AS id`,[`AJ_DOC_${sufijo}`]);
    asignacionLectura=await id(`INSERT INTO asignacion_permiso(id_usuario,id_direccion,id_permiso,asignado_por)
      SELECT $1,$2,id_permiso,$1 FROM permiso WHERE codigo='DOCUMENTOS_CONSULTAR'
      RETURNING id_asignacion_permiso::text AS id`,[usuario,direccion]);
    asignacionGestion=await id(`INSERT INTO asignacion_permiso(id_usuario,id_direccion,id_permiso,asignado_por)
      SELECT $1,$2,id_permiso,$1 FROM permiso WHERE codigo='DOCUMENTOS_GESTIONAR'
      RETURNING id_asignacion_permiso::text AS id`,[usuario,direccion]);
    const t1=tokenAleatorio(),t2=tokenAleatorio();
    await db.query(`INSERT INTO sesion(identificador_seguro,id_usuario,fecha_expiracion)
      VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')`,
    [hashToken(t1),usuario,hashToken(t2),comun]);
    sesion=`di_sesion=${t1}`;sesionComun=`di_sesion=${t2}`;
  },60_000);
  afterAll(async()=>{
    if(db?.isInitialized){
      if(direccion){
        const claves=await db.query(`SELECT v.clave_archivo::text AS clave FROM version_documento v
          JOIN documento d ON d.id_documento=v.id_documento WHERE d.id_direccion=$1`,[direccion]) as Array<{clave:string}>;
        await db.query(`DELETE FROM version_documento WHERE id_documento IN
          (SELECT id_documento FROM documento WHERE id_direccion=$1)`,[direccion]);
        await db.query('DELETE FROM documento WHERE id_direccion=$1',[direccion]);
        for(const {clave} of claves)await unlink(join(process.env.DOCUMENTOS_RAIZ??'/app/almacen-documentos',clave)).catch(()=>{});
        await db.query('DELETE FROM registro_auditoria WHERE id_direccion=$1',[direccion]);
      }
      if(asignacionLectura&&asignacionGestion)await db.query(`DELETE FROM asignacion_permiso
        WHERE id_asignacion_permiso=ANY($1::bigint[])`,[[asignacionLectura,asignacionGestion]]);
      if(usuario&&comun)await db.query('DELETE FROM sesion WHERE id_usuario=ANY($1::bigint[])',[[usuario,comun]]);
      if(direccion&&ajena)await db.query('DELETE FROM direccion_institucional WHERE id_direccion=ANY($1::bigint[])',[[direccion,ajena]]);
      if(usuario&&comun)await db.query('DELETE FROM usuario WHERE id_usuario=ANY($1::bigint[])',[[usuario,comun]]);
    }
    if(app)await app.close();
  },40_000);
  async function csrf(){
    const r=await request(app.getHttpServer()).get('/api/cuenta/csrf').expect(200);
    const cookie=(r.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0];
    return {cookie,token:r.body.csrfToken as string};
  }
  it('requiere sesión y permisos, sin exponer el almacenamiento físico',async()=>{
    await request(app.getHttpServer()).get('/api/documentos/ambitos').expect(401);
    await request(app.getHttpServer()).get('/api/documentos/ambitos').set('Cookie',sesionComun).expect(403);
    const r=await request(app.getHttpServer()).get('/api/documentos/ambitos').set('Cookie',sesion).expect(200);
    expect(r.body.consulta).toEqual([expect.objectContaining({id:direccion})]);
    await request(app.getHttpServer()).get(`/api/documentos?direccionId=${ajena}`).set('Cookie',sesion).expect(403);
  });
  it('crea documento y versión real, audita, consulta, descarga y controla concurrencia',async()=>{
    const c=await csrf();
    await request(app.getHttpServer()).post('/api/documentos')
      .set('Cookie',`${sesion}; ${c.cookie}`).field('direccionId',direccion)
      .field('titulo','Resolución de prueba').field('categoria','Resoluciones')
      .attach('archivo',Buffer.from('archivo falso'),'prueba.pdf')
      .set('x-csrf-token',c.token).expect(400);
    await request(app.getHttpServer()).post('/api/documentos')
      .set('Cookie',sesion).field('direccionId',direccion)
      .field('titulo','Sin autorización CSRF').field('categoria','Resoluciones')
      .attach('archivo',pdf,'prueba.pdf').expect(403);
    const crear=await request(app.getHttpServer()).post('/api/documentos')
      .set('Cookie',`${sesion}; ${c.cookie}`).set('x-csrf-token',c.token)
      .field('direccionId',direccion).field('titulo','Resolución de prueba').field('categoria','Resoluciones')
      .field('descripcion','Evidencia de prueba').attach('archivo',pdf,'prueba.pdf').expect(201);
    doc=crear.body.id as string;
    expect(doc).toMatch(/^\d+$/);
    const listar=await request(app.getHttpServer()).get(`/api/documentos?direccionId=${direccion}`)
      .set('Cookie',sesion).expect(200);
    expect(listar.body.documentos).toEqual([expect.objectContaining({id:doc,versionActual:1})]);
    const detalle=await request(app.getHttpServer()).get(`/api/documentos/${doc}?direccionId=${direccion}`)
      .set('Cookie',sesion).expect(200);
    expect(detalle.body.versiones).toHaveLength(1);
    expect(JSON.stringify(detalle.body)).not.toContain('claveArchivo');
    expect(JSON.stringify(detalle.body)).not.toContain('sha256');
    const descarga=await request(app.getHttpServer()).get(`/api/documentos/${doc}/versiones/1/archivo?direccionId=${direccion}`)
      .set('Cookie',sesion).expect(200);
    expect(Buffer.from(descarga.body as Buffer)).toEqual(pdf);
    expect(descarga.headers['content-disposition']).toContain('attachment');
    await request(app.getHttpServer()).patch(`/api/documentos/${doc}?direccionId=${direccion}`)
      .set('Cookie',`${sesion}; ${c.cookie}`).set('x-csrf-token',c.token)
      .send({titulo:'Resolución corregida',categoria:'Resoluciones',descripcion:'Corrección',versionControl:0}).expect(200);
    await request(app.getHttpServer()).patch(`/api/documentos/${doc}?direccionId=${direccion}`)
      .set('Cookie',`${sesion}; ${c.cookie}`).set('x-csrf-token',c.token)
      .send({titulo:'Otra edición',categoria:'Resoluciones',versionControl:0}).expect(409);
    await request(app.getHttpServer()).post(`/api/documentos/${doc}/versiones`)
      .set('Cookie',`${sesion}; ${c.cookie}`).set('x-csrf-token',c.token)
      .field('direccionId',direccion).field('versionControl','1').attach('archivo',pdf,'actualizado.pdf').expect(201);
    const nuevo=await request(app.getHttpServer()).get(`/api/documentos/${doc}?direccionId=${direccion}`)
      .set('Cookie',sesion).expect(200);
    expect(nuevo.body.versiones.map((v:{numeroVersion:number})=>v.numeroVersion)).toEqual([2,1]);
    const auditoria=await db.query(`SELECT accion FROM registro_auditoria WHERE id_direccion=$1
      AND identificador_entidad=$2 ORDER BY id_auditoria`,[direccion,doc]) as Array<{accion:string}>;
    expect(auditoria.map(x=>x.accion)).toEqual(['DOCUMENTO_CREAR','DOCUMENTO_ACTUALIZAR','DOCUMENTO_NUEVA_VERSION']);
  });
  it('revocar permisos bloquea descargas nuevas incluso con sesión abierta',async()=>{
    await request(app.getHttpServer()).get(`/api/documentos/${doc}/versiones/1/archivo?direccionId=${ajena}`)
      .set('Cookie',sesion).expect(403);
    await request(app.getHttpServer()).get(`/api/documentos/${doc}/versiones/1/archivo?direccionId=${direccion}`)
      .set('Cookie',sesionComun).expect(403);
    await db.query(`UPDATE asignacion_permiso SET fecha_revocacion=now(),revocado_por=$2
      WHERE id_asignacion_permiso=$1`,[asignacionLectura,usuario]);
    await request(app.getHttpServer()).get(`/api/documentos/${doc}/versiones/1/archivo?direccionId=${direccion}`)
      .set('Cookie',sesion).expect(403);
  });
});
