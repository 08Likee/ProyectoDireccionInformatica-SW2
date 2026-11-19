/** CU-07. Persistencia, contenido físico, permisos revocados y auditoría sobre PostgreSQL. */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { hashToken, tokenAleatorio } from '../infraestructura/seguridad/seguridad.util';
import { TAMANO_MAXIMO_ARCHIVO } from './negocio/validar-archivo';

const pdf=Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF');
const MIB=1024*1024;

/** PDF de una página, con un stream de espacios y referencias xref válidas.
 * Su tamaño exacto permite probar el transporte y la persistencia sin archivos externos. */
function pdfDeTamano(tamano:number):Buffer {
  let inicio='%PDF-1.4\n';
  const offsets:number[]=[];
  const objetos=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>',
  ];
  for(const [i,objeto] of objetos.entries()) {
    offsets.push(inicio.length);
    inicio+=`${i+1} 0 obj\n${objeto}\nendobj\n`;
  }
  offsets.push(inicio.length);
  const partes=(longitud:number)=>{
    const cabecera=`${inicio}4 0 obj\n<< /Length ${String(longitud).padStart(10,'0')} >>\nstream\n`;
    const finStream='\nendstream\nendobj\n';
    const xref=cabecera.length+longitud+finStream.length;
    const cola=`${finStream}xref\n0 5\n0000000000 65535 f \n${offsets.map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${String(xref).padStart(10,'0')}\n%%EOF\n`;
    return {cabecera,cola};
  };
  const vacio=partes(0);
  const longitud=tamano-vacio.cabecera.length-vacio.cola.length;
  if(longitud<0)throw new Error('Tamaño PDF de prueba insuficiente.');
  const {cabecera,cola}=partes(longitud);
  return Buffer.concat([Buffer.from(cabecera,'ascii'),Buffer.alloc(longitud,' '),Buffer.from(cola,'ascii')]);
}
function sha256(datos:Buffer):string {return createHash('sha256').update(datos).digest('hex');}

describe('CU-07 integración HTTP + PostgreSQL + archivos privados',()=>{
  let app:INestApplication;
  let db:DataSource;
  let usuario=''; let comun=''; let direccion='';let ajena='';let sesion='';let sesionComun='';
  let doc='';let asignacionLectura='';let asignacionGestion='';
  const sufijo=randomBytes(7).toString('hex');
  const raizOriginal=process.env.DOCUMENTOS_RAIZ;
  let raizPrueba='';
  async function id(sql:string,args:unknown[]):Promise<string>{
    const filas=await db.query(sql,args) as Array<{id:string}>;return filas[0].id;
  }
  beforeAll(async()=>{
    const raiz=raizOriginal??'/app/almacen-documentos';
    await mkdir(raiz,{recursive:true,mode:0o700});
    raizPrueba=await mkdtemp(join(raiz,'prueba-cu07-'));
    process.env.DOCUMENTOS_RAIZ=raizPrueba;
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
    if(raizOriginal===undefined)delete process.env.DOCUMENTOS_RAIZ;
    else process.env.DOCUMENTOS_RAIZ=raizOriginal;
    if(raizPrueba)await rm(raizPrueba,{recursive:true,force:true});
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
  it('persiste y recupera archivos mayores de 10 MiB y de 50 MiB exactos; rechaza el exceso sin inconsistencias',async()=>{
    // No declarar aprobada la capacidad de 50 MiB si se ejecuta con una configuración inferior.
    expect(TAMANO_MAXIMO_ARCHIVO).toBe(50*MIB);
    const c=await csrf();
    const cookie=`${sesion}; ${c.cookie}`;
    const primera=pdfDeTamano(10*MIB+1);
    const limite=pdfDeTamano(50*MIB);
    const exceso=pdfDeTamano(50*MIB+1);
    expect(primera.length).toBe(10*MIB+1);
    expect(limite.length).toBe(50*MIB);
    expect(exceso.length).toBe(50*MIB+1);
    const crear=(archivo:Buffer)=>request(app.getHttpServer()).post('/api/documentos')
      .set('Cookie',cookie).set('x-csrf-token',c.token)
      .field('direccionId',direccion).field('titulo','Prueba del límite documental')
      .field('categoria','Pruebas').attach('archivo',archivo,'limite.pdf');
    const entrega=await crear(primera).expect(201);
    const idLimite=entrega.body.id as string;
    const version=(archivo:Buffer,control:number)=>request(app.getHttpServer()).post(`/api/documentos/${idLimite}/versiones`)
      .set('Cookie',cookie).set('x-csrf-token',c.token)
      .field('direccionId',direccion).field('versionControl',String(control)).attach('archivo',archivo,'version-limite.pdf');
    await version(limite,0).expect(201);
    const filas=await db.query(`SELECT numero_version AS numero,tamano_bytes::text AS tamano,
      sha256,clave_archivo::text AS clave FROM version_documento WHERE id_documento=$1 ORDER BY numero_version`,
    [idLimite]) as Array<{numero:number;tamano:string;sha256:string;clave:string}>;
    expect(filas).toHaveLength(2);
    for(const [i,esperado] of [primera,limite].entries()) {
      const fila=filas[i];
      expect(fila.numero).toBe(i+1);
      expect(fila.tamano).toBe(String(esperado.length));
      const hash=sha256(esperado);
      expect(fila.sha256.trim()).toBe(hash);
      const almacenado=await readFile(join(raizPrueba,fila.clave));
      expect(almacenado.length).toBe(esperado.length);
      expect(sha256(almacenado)).toBe(hash);
      const descarga=await request(app.getHttpServer()).get(`/api/documentos/${idLimite}/versiones/${i+1}/archivo?direccionId=${direccion}`)
        .set('Cookie',sesion).expect(200);
      expect(descarga.headers['content-length']).toBe(String(esperado.length));
      expect(Buffer.isBuffer(descarga.body)).toBe(true);
      const recuperado=descarga.body as Buffer;
      expect(recuperado.length).toBe(esperado.length);
      expect(sha256(recuperado)).toBe(hash);
    }
    const estado=async()=>({
      documentos:await db.query('SELECT id_documento,version_actual,version_control FROM documento WHERE id_direccion=$1 ORDER BY id_documento',[direccion]),
      versiones:await db.query(`SELECT v.id_version,v.tamano_bytes,v.sha256,v.clave_archivo FROM version_documento v
        JOIN documento d ON d.id_documento=v.id_documento WHERE d.id_direccion=$1 ORDER BY v.id_version`,[direccion]),
      auditoria:await db.query('SELECT id_auditoria,accion FROM registro_auditoria WHERE id_direccion=$1 ORDER BY id_auditoria',[direccion]),
      archivos:(await readdir(raizPrueba)).sort(),
    });
    const antes=await estado();
    await crear(exceso).expect(413);
    await version(exceso,1).expect(413);
    // La restricción SQL permanece efectiva aunque se omita el controlador.
    await expect(db.query('UPDATE version_documento SET tamano_bytes=$2 WHERE id_documento=$1 AND numero_version=2',
      [idLimite,50*MIB+1])).rejects.toMatchObject({driverError:{code:'23514'}});
    expect(await estado()).toEqual(antes);
  },180_000);
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
