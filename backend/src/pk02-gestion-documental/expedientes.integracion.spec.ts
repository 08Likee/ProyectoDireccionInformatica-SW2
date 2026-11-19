import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { ExpedientesService } from './negocio/expedientes.service';
import { hashToken,tokenAleatorio } from '../infraestructura/seguridad/seguridad.util';
const pdf=Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF');
describe('CU-08 integración HTTP y PostgreSQL',()=>{
  let app:INestApplication,db:DataSource;
  let u='',lector='',d='',ajena='',s='',sl='',p='',pa='',doc='',exp='',vinculo='';
  const sufijo=randomBytes(7).toString('hex'),original=process.env.DOCUMENTOS_RAIZ;
  let raiz='';
  async function id(sql:string,params:unknown[]){const [r]=await db.query(sql,params) as Array<{id:string}>;return r.id;}
  async function grant(usuario:string,direccion:string,codigos:string[]){await db.query(`INSERT INTO asignacion_permiso(id_usuario,id_direccion,id_permiso,asignado_por) SELECT $1,$2,id_permiso,$1 FROM permiso WHERE codigo=ANY($3::text[])`,[usuario,direccion,codigos]);}
  async function sesion(usuario:string){const t=tokenAleatorio();await db.query(`INSERT INTO sesion(identificador_seguro,id_usuario,fecha_expiracion) VALUES($1,$2,now()+interval '1 hour')`,[hashToken(t),usuario]);return `di_sesion=${t}`;}
  beforeAll(async()=>{
    const base=original??'/app/almacen-documentos';await mkdir(base,{recursive:true});raiz=await mkdtemp(join(base,'prueba-cu08-'));process.env.DOCUMENTOS_RAIZ=raiz;
    const modulo=await Test.createTestingModule({imports:[AppModule]}).compile();app=modulo.createNestApplication();await app.init();db=app.get(DataSource);
    const usuario=(prefijo:string)=>id(`INSERT INTO usuario(identificador_personal,nombres,apellidos,correo,contrasena_hash,estado_cuenta,fecha_verificacion) VALUES($1,$2,'Prueba',$3,'HASH_INHABILITADO','ACTIVA',now()) RETURNING id_usuario::text AS id`,[prefijo+sufijo,prefijo,`${prefijo.toLowerCase()}${sufijo}@example.invalid`]);
    u=await usuario('Exp');lector=await usuario('Lec');
    d=await id(`INSERT INTO direccion_institucional(codigo,nombre) VALUES($1,'Prueba CU08') RETURNING id_direccion::text AS id`,['EXP_'+sufijo]);
    ajena=await id(`INSERT INTO direccion_institucional(codigo,nombre) VALUES($1,'Otra CU08') RETURNING id_direccion::text AS id`,['EXT_'+sufijo]);
    await grant(u,d,['EXPEDIENTES_GESTIONAR','EXPEDIENTES_CONSULTAR','DOCUMENTOS_GESTIONAR','DOCUMENTOS_CONSULTAR','PERIODOS_GESTIONAR','DOCUMENTOS_RESTRINGIDOS_CONSULTAR','DOCUMENTOS_RESTRICCIONES_GESTIONAR']);
    await grant(lector,d,['EXPEDIENTES_CONSULTAR','DOCUMENTOS_CONSULTAR']);s=await sesion(u);sl=await sesion(lector);
    pa=await id(`INSERT INTO periodo_academico(id_direccion,gestion,codigo_periodo,fecha_inicio,fecha_fin,creado_por) VALUES($1,2026,'PRUEBA','2026-01-01','2026-06-30',$2) RETURNING id_periodo::text AS id`,[ajena,u]);
  },60000);
  afterAll(async()=>{
    if(db?.isInitialized){
      const ds=[d,ajena].filter(Boolean),us=[u,lector].filter(Boolean);
      await db.query('DELETE FROM expediente_documento WHERE id_direccion=ANY($1::bigint[])',[ds]);
      await db.query('DELETE FROM expediente WHERE id_direccion=ANY($1::bigint[])',[ds]);
      await db.query('DELETE FROM periodo_academico WHERE id_direccion=ANY($1::bigint[])',[ds]);
      await db.query('DELETE FROM restriccion_documento WHERE id_documento IN (SELECT id_documento FROM documento WHERE id_direccion=ANY($1::bigint[]))',[ds]);
      await db.query('DELETE FROM version_documento WHERE id_documento IN (SELECT id_documento FROM documento WHERE id_direccion=ANY($1::bigint[]))',[ds]);
      await db.query('DELETE FROM documento WHERE id_direccion=ANY($1::bigint[])',[ds]);
      await db.query('DELETE FROM registro_auditoria WHERE id_direccion=ANY($1::bigint[])',[ds]);
      await db.query('DELETE FROM asignacion_permiso WHERE id_direccion=ANY($1::bigint[])',[ds]);
      await db.query('DELETE FROM sesion WHERE id_usuario=ANY($1::bigint[])',[us]);
      await db.query('DELETE FROM direccion_institucional WHERE id_direccion=ANY($1::bigint[])',[ds]);
      await db.query('DELETE FROM usuario WHERE id_usuario=ANY($1::bigint[])',[us]);
    }if(app)await app.close();if(original===undefined)delete process.env.DOCUMENTOS_RAIZ;else process.env.DOCUMENTOS_RAIZ=original;if(raiz)await rm(raiz,{recursive:true,force:true});
  },40000);
  async function csrf(){const r=await request(app.getHttpServer()).get('/api/cuenta/csrf').expect(200);return {cookie:(r.headers['set-cookie'] as unknown as string[])[0].split(';')[0],token:r.body.csrfToken as string};}
  const get=(ruta:string,cookie:string)=>request(app.getHttpServer()).get(ruta).set('Cookie',cookie);
  async function mutar(ruta:string,body:unknown,estado:number,metodo:'post'|'patch'='post',cookie=s){const c=await csrf();return request(app.getHttpServer())[metodo](ruta).set('Cookie',`${cookie}; ${c.cookie}`).set('x-csrf-token',c.token).send(body as object).expect(estado);}
  const ruta=()=>`/api/expedientes/${exp}`;
  const ambito=()=>`?direccionId=${d}`;
  it('registra periodos autorizados, valida fechas, crea expediente vacío y filtra',async()=>{
    const datos={direccionId:d,gestion:2026,codigo:'PRUEBA',fechaInicio:'2026-01-01',fechaFin:'2026-06-30'};
    await mutar('/api/periodos',datos,403,'post',sl);await mutar('/api/periodos',{...datos,fechaInicio:'2026-02-30'},400);
    p=(await mutar('/api/periodos',datos,201)).body.id;await mutar('/api/periodos',datos,409);
    const e={direccionId:d,periodoId:p,codigo:'CASO-1',asunto:'Expediente de prueba',descripcion:''};
    await mutar('/api/expedientes',{...e,periodoId:pa},400);await mutar('/api/expedientes',{...e,asunto:''},400);
    exp=(await mutar('/api/expedientes',e,201)).body.id;await mutar('/api/expedientes',{...e,codigo:'caso-1'},409);
    expect((await get(ruta()+ambito(),sl).expect(200)).body.vinculos).toEqual([]);
    expect((await get(`/api/expedientes${ambito()}&busqueda=CASO-1&periodoId=${p}`,sl).expect(200)).body.expedientes).toEqual([expect.objectContaining({id:exp})]);
    await get(`/api/expedientes?direccionId=${ajena}`,sl).expect(403);
    await mutar(ruta()+ambito(),{periodoId:p,codigo:'CASO-1',asunto:'Asunto actualizado',versionControl:0},200,'patch');
    await mutar(ruta()+ambito(),{periodoId:p,asunto:'Obsoleto',versionControl:0},409,'patch');
  });
  it('revierte cambios de expediente si falla su auditoría',async()=>{
    const servicio=app.get(ExpedientesService) as unknown as {auditar(...args:unknown[]):Promise<void>};
    const fallo=jest.spyOn(servicio,'auditar').mockRejectedValueOnce(new Error('Fallo de auditoría inducido para prueba'));
    try{
      await mutar(ruta()+ambito(),{periodoId:p,codigo:'CASO-1',asunto:'No debe persistir',versionControl:1},500,'patch');
      const detalle=(await get(ruta()+ambito(),s).expect(200)).body.expediente;
      expect(detalle).toMatchObject({asunto:'Asunto actualizado',versionControl:1});
    }finally{fallo.mockRestore();}
  });
  it('asocia versión sin duplicar archivo, controla concurrencia, preserva versión fijada y retira con motivo',async()=>{
    const c=await csrf();const r=await request(app.getHttpServer()).post('/api/documentos').set('Cookie',`${s}; ${c.cookie}`).set('x-csrf-token',c.token).field('direccionId',d).field('titulo','Antecedente CU08').field('categoria','Prueba').attach('archivo',pdf,'antecedente.pdf').expect(201);doc=r.body.id;
    const datos={documentoId:doc,versionDocumento:0,versionControl:1,versionFijada:1};
    const antes=await db.query('SELECT id_version FROM version_documento WHERE id_documento=$1',[doc]);
    vinculo=(await mutar(ruta()+'/documentos'+ambito(),datos,201)).body.dato.id;
    expect(await db.query('SELECT id_version FROM version_documento WHERE id_documento=$1',[doc])).toEqual(antes);
    await mutar(ruta()+'/documentos'+ambito(),{...datos,versionControl:2},409);
    const c2=await csrf();await request(app.getHttpServer()).post(`/api/documentos/${doc}/versiones`).set('Cookie',`${s}; ${c2.cookie}`).set('x-csrf-token',c2.token).field('direccionId',d).field('versionControl','0').attach('archivo',pdf,'segunda.pdf').expect(201);
    expect((await get(ruta()+ambito(),sl).expect(200)).body.vinculos[0].numeroVersion).toBe(1);
    await mutar(ruta()+`/documentos/${vinculo}/retirar`+ambito(),{versionControl:2,motivo:''},400,'patch');
    await mutar(ruta()+`/documentos/${vinculo}/retirar`+ambito(),{versionControl:2,motivo:'Prueba de retiro'},200,'patch');
    await mutar(ruta()+'/documentos'+ambito(),{...datos,versionControl:3,versionDocumento:0,versionFijada:null},409);
    const r2=await mutar(ruta()+'/documentos'+ambito(),{...datos,versionControl:3,versionDocumento:1,versionFijada:null,obligatorio:true},201);
    expect((await get(ruta()+ambito(),sl).expect(200)).body.vinculos).toEqual(expect.arrayContaining([expect.objectContaining({numeroVersion:2,versionFijada:null}),expect.objectContaining({numeroVersion:1,motivoRetiro:'Prueba de retiro'})]));
    await mutar(ruta()+`/documentos/${r2.body.dato.id}/retirar`+ambito(),{versionControl:4,motivo:'no permitido'},409,'patch');
    // Comprobar unicidad y cada FK de ámbito con casos que no se solapen.
    const insertarVinculo = 'INSERT INTO expediente_documento(id_expediente,id_direccion,id_documento,vinculado_por) VALUES($1,$2,$3,$4)';
    await expect(db.query(insertarVinculo,[exp,d,doc,u])).rejects.toMatchObject({code:'23505'});
    const expAjeno=await id(`INSERT INTO expediente(id_direccion,id_periodo,asunto,creado_por,actualizado_por) VALUES($1,$2,'Prueba de ámbito externo',$3,$3) RETURNING id_expediente::text AS id`,[ajena,pa,u]);
    // Documento de d, expediente de ajena: falla únicamente la FK del expediente.
    await expect(db.query(insertarVinculo,[expAjeno,d,doc,u])).rejects.toMatchObject({code:'23503'});
    // Expediente de ajena, documento de d: falla únicamente la FK del documento.
    await expect(db.query(insertarVinculo,[expAjeno,ajena,doc,u])).rejects.toMatchObject({code:'23503'});
    expect(await db.query('SELECT id_expediente_documento FROM expediente_documento WHERE id_expediente=$1',[expAjeno])).toEqual([]);
  });
  it('restricción transversal: lista, detalle, archivo, expediente, gestión y revocación',async()=>{
    await mutar(`/api/documentos/${doc}/restriccion${ambito()}`,{restringido:true,motivo:'Prueba de acceso',versionControl:1},200,'patch');
    expect((await get('/api/documentos'+ambito(),sl).expect(200)).body.documentos).toEqual([]);
    await get(`/api/documentos/${doc}${ambito()}`,sl).expect(403);
    await get(`/api/documentos/${doc}/versiones/1/archivo${ambito()}`,sl).expect(403);
    expect((await get(ruta()+ambito(),sl).expect(200)).body.vinculos).toEqual([]);
    expect((await get(ruta()+ambito(),s).expect(200)).body.vinculos).toHaveLength(2);
    await grant(lector,d,['DOCUMENTOS_GESTIONAR','EXPEDIENTES_GESTIONAR']);
    await mutar(`/api/documentos/${doc}${ambito()}`,{titulo:'No autorizado',categoria:'Prueba',versionControl:2},403,'patch',sl);
    await mutar(ruta()+'/documentos'+ambito(),{documentoId:doc,versionDocumento:2,versionControl:4,versionFijada:1},403,'post',sl);
    await mutar(`/api/documentos/${doc}/restriccion${ambito()}`,{restringido:false,motivo:'Fin de prueba',versionControl:2},200,'patch');
    await get(`/api/documentos/${doc}/versiones/1/archivo${ambito()}`,sl).expect(200);
    await db.query(`UPDATE asignacion_permiso SET fecha_revocacion=now(),revocado_por=$1 WHERE id_usuario=$2 AND id_direccion=$3 AND id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='EXPEDIENTES_CONSULTAR')`,[u,lector,d]);
    await get(ruta()+ambito(),sl).expect(403);
    const eventos=await db.query(`SELECT accion FROM registro_auditoria WHERE id_direccion=$1`,[d]);expect(eventos).toEqual(expect.arrayContaining([expect.objectContaining({accion:'EXPEDIENTE_CREAR'}),expect.objectContaining({accion:'EXPEDIENTE_DOCUMENTO_RETIRAR'}),expect.objectContaining({accion:'DOCUMENTO_RESTRINGIR'})]));
  });
});
