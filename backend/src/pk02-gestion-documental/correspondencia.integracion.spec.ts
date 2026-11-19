import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { SeguimientoService } from './negocio/seguimiento.service';
import { CorrespondenciaService } from './negocio/correspondencia.service';
import { hashToken,tokenAleatorio } from '../infraestructura/seguridad/seguridad.util';
const pdf=Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF');
describe('CU-05 integración HTTP y PostgreSQL',()=>{
  let app:INestApplication,db:DataSource;
  let u='',lector='',lectorFiltros='',lectorDocumentos='',d='',ajena='',s='',sl='',sf='',sd='',p='',pa='',tipo='',remitente='',otro='',propio='',doc='',exp='';
  const sufijo=randomBytes(7).toString('hex'),original=process.env.DOCUMENTOS_RAIZ;
  let raiz='';
  async function id(sql:string,params:unknown[]){const [r]=await db.query(sql,params) as Array<{id:string}>;return r.id;}
  async function grant(usuario:string,direccion:string,codigos:string[]){await db.query(`INSERT INTO asignacion_permiso(id_usuario,id_direccion,id_permiso,asignado_por) SELECT $1,$2,id_permiso,$1 FROM permiso WHERE codigo=ANY($3::text[])`,[usuario,direccion,codigos]);}
  async function sesion(usuario:string){const t=tokenAleatorio();await db.query(`INSERT INTO sesion(identificador_seguro,id_usuario,fecha_expiracion) VALUES($1,$2,now()+interval '1 hour')`,[hashToken(t),usuario]);return `di_sesion=${t}`;}
  beforeAll(async()=>{
    const base=original??'/app/almacen-documentos';await mkdir(base,{recursive:true});raiz=await mkdtemp(join(base,'prueba-cu05-'));process.env.DOCUMENTOS_RAIZ=raiz;
    const modulo=await Test.createTestingModule({imports:[AppModule]}).compile();app=modulo.createNestApplication();await app.init();db=app.get(DataSource);
    const usuario=(prefijo:string)=>id(`INSERT INTO usuario(identificador_personal,nombres,apellidos,correo,contrasena_hash,estado_cuenta,fecha_verificacion) VALUES($1,$2,'Prueba',$3,'HASH_INHABILITADO','ACTIVA',now()) RETURNING id_usuario::text AS id`,[prefijo+sufijo,prefijo,`${prefijo.toLowerCase()}${sufijo}@example.invalid`]);
    u=await usuario('Exp');lector=await usuario('Lec');lectorFiltros=await usuario('Fil');lectorDocumentos=await usuario('Doc');
    d=await id(`INSERT INTO direccion_institucional(codigo,nombre) VALUES($1,'Prueba CU05') RETURNING id_direccion::text AS id`,['EXP_'+sufijo]);
    ajena=await id(`INSERT INTO direccion_institucional(codigo,nombre) VALUES($1,'Otra CU05') RETURNING id_direccion::text AS id`,['EXT_'+sufijo]);
    await grant(u,d,['FILTROS_CONSULTAR','CORRESPONDENCIA_GESTIONAR','CORRESPONDENCIA_CONSULTAR','CORRESPONDENCIA_CATALOGOS_GESTIONAR','SEGUIMIENTO_CONSULTAR','SEGUIMIENTO_GESTIONAR','EXPEDIENTES_GESTIONAR','EXPEDIENTES_CONSULTAR','DOCUMENTOS_GESTIONAR','DOCUMENTOS_CONSULTAR','PERIODOS_GESTIONAR','DOCUMENTOS_RESTRINGIDOS_CONSULTAR','DOCUMENTOS_RESTRICCIONES_GESTIONAR']);
    await grant(lector,d,['CORRESPONDENCIA_CONSULTAR','DOCUMENTOS_CONSULTAR','SEGUIMIENTO_CONSULTAR']);s=await sesion(u);sl=await sesion(lector);
    // Cada escenario CU-33 que modifica permisos dispone de un lector auxiliar independiente.
    await grant(lectorFiltros,d,['CORRESPONDENCIA_CONSULTAR','DOCUMENTOS_CONSULTAR','SEGUIMIENTO_CONSULTAR']);sf=await sesion(lectorFiltros);
    await grant(lectorDocumentos,d,['DOCUMENTOS_CONSULTAR','FILTROS_CONSULTAR']);sd=await sesion(lectorDocumentos);
    p=await id(`INSERT INTO periodo_academico(id_direccion,gestion,codigo_periodo,fecha_inicio,fecha_fin,creado_por) VALUES($1,2026,'PRUEBA','2026-01-01','2026-06-30',$2) RETURNING id_periodo::text AS id`,[d,u]);
    pa=await id(`INSERT INTO periodo_academico(id_direccion,gestion,codigo_periodo,fecha_inicio,fecha_fin,creado_por) VALUES($1,2026,'PRUEBA','2026-01-01','2026-06-30',$2) RETURNING id_periodo::text AS id`,[ajena,u]);
    tipo=(await mutar('/api/correspondencia/tipos',{direccionId:d,codigo:'OF',nombre:'Oficio'},201)).body.id;
    propio=(await mutar('/api/correspondencia/interlocutores',{direccionId:d,tipo:'PROPIA_DIRECCION',nombre:''},201)).body.id;
    remitente=(await mutar('/api/correspondencia/interlocutores',{direccionId:d,tipo:'UNIDAD_EXTERNA',nombre:'Unidad A'},201)).body.id;
    otro=(await mutar('/api/correspondencia/interlocutores',{direccionId:d,tipo:'UNIDAD_EXTERNA',nombre:'Unidad B'},201)).body.id;
    exp=await id(`INSERT INTO expediente(id_direccion,id_periodo,asunto,creado_por,actualizado_por) VALUES($1,$2,'Expediente de prueba',$3,$3) RETURNING id_expediente::text AS id`,[d,p,u]);
    const c=await csrf();doc=(await request(app.getHttpServer()).post('/api/documentos').set('Cookie',`${s}; ${c.cookie}`).set('x-csrf-token',c.token).field('direccionId',d).field('titulo','Antecedente CU05').field('categoria','Prueba').attach('archivo',pdf,'antecedente.pdf').expect(201)).body.id;
  },60000);
  afterAll(async()=>{
    if(db?.isInitialized){
      const ds=[d,ajena].filter(Boolean),us=[u,lector,lectorFiltros,lectorDocumentos].filter(Boolean);
      await db.transaction(async manager=>{
        for(const tabla of ['movimiento_documento','relacion_correspondencia','movimiento_correspondencia','correspondencia_documento','correspondencia_expediente','correspondencia_correccion','participacion_correspondencia','correspondencia','tipo_correspondencia','interlocutor'])await manager.query(`DELETE FROM ${tabla} WHERE id_direccion=ANY($1::bigint[])`,[ds]);
      });
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
  const ruta=(c:string)=>`/api/correspondencia/${c}`;
  const ambito=()=>`?direccionId=${d}`;
  const datos=(ref:string|null='OF-1')=>({direccionId:d,tipoId:tipo,remitenteId:remitente,destinatarioId:propio,sentido:'RECIBIDA',referenciaOficial:ref,asunto:'Correspondencia de prueba',fechaComunicacion:'2026-11-18'});
  async function alta(ref:string){return (await mutar('/api/correspondencia',datos(ref),201)).body.id as string;}
  it('registra recibidas y emitidas, valida catálogos, ámbitos y duplicados',async()=>{
    await mutar('/api/correspondencia/tipos',{direccionId:d,codigo:'X',nombre:'No autorizado'},403,'post',sl);
    await mutar('/api/correspondencia/tipos',{direccionId:d,codigo:'of',nombre:'Duplicado'},409);
    await mutar('/api/correspondencia',{...datos(),periodoId:pa},400);
    const a=await alta('OF-1');await mutar('/api/correspondencia',datos('of-1'),409);
    await mutar('/api/correspondencia',{...datos('OF-1'),remitenteId:otro},201);
    await mutar('/api/correspondencia',{...datos('OF-1'),sentido:'EMITIDA',remitenteId:propio,destinatarioId:remitente},201);
    await mutar('/api/correspondencia',{...datos('of-1'),sentido:'EMITIDA',remitenteId:propio,destinatarioId:otro},409);
    await mutar('/api/correspondencia',datos(null),201);await mutar('/api/correspondencia',datos(null),409);await mutar('/api/correspondencia',{...datos(null),confirmarDuplicado:true},201);
    const detalle=(await get(ruta(a)+ambito(),sl).expect(200)).body;expect(detalle.correspondencia).toMatchObject({id:a,periodoId:null,remitente:'Unidad A',versionControl:0});expect(detalle.documentos).toEqual([]);
    expect((await get('/api/correspondencia'+ambito()+'&sentido=RECIBIDA&busqueda=OF-1&interlocutorId='+remitente,sl).expect(200)).body.correspondencias).toEqual([expect.objectContaining({id:a})]);
    await get('/api/correspondencia?direccionId='+ajena,sl).expect(403);
    const otroTipo=await id(`INSERT INTO tipo_correspondencia(id_direccion,codigo,nombre) VALUES($1,'X','Tipo ajeno') RETURNING id_tipo_correspondencia::text AS id`,[ajena]);
    await mutar('/api/correspondencia',{...datos('OF-2'),tipoId:otroTipo},400);
    await expect(db.query(`INSERT INTO correspondencia(id_direccion,id_tipo_correspondencia,id_remitente,id_destinatario,sentido,asunto,fecha_comunicacion,registrado_por,actualizado_por) VALUES($1,$2,$3,$4,'RECIBIDA','Sin participantes registrados','2026-11-18',$5,$5)`,[d,tipo,remitente,propio,u])).rejects.toMatchObject({code:'23503'});
  });
  it('rectifica con justificación, conserva instantáneas y revierte ante fallo de auditoría',async()=>{
    const a=await alta('RECT-1'),{direccionId,...original}=datos('RECT-1');expect(direccionId).toBe(d);
    const cambio={...original,asunto:'Asunto corregido',remitenteId:otro,versionControl:0,motivo:'Error de captura'};
    await mutar(ruta(a)+ambito(),{...cambio,motivo:''},400,'patch');await mutar(ruta(a)+ambito(),cambio,200,'patch');await mutar(ruta(a)+ambito(),cambio,409,'patch');
    const h=(await get(ruta(a)+'/correcciones'+ambito(),sl).expect(200)).body.correcciones;expect(h).toEqual([expect.objectContaining({versionAnterior:0,versionPosterior:1,motivo:'Error de captura',antes:expect.objectContaining({remitente:'Unidad A'}),despues:expect.objectContaining({remitente:'Unidad B',asunto:'Asunto corregido'})})]);
    const servicio=app.get(CorrespondenciaService) as unknown as {auditar(...args:unknown[]):Promise<void>};const fallo=jest.spyOn(servicio,'auditar').mockRejectedValueOnce(new Error('Fallo de auditoría inducido para prueba'));
    try{await mutar(ruta(a)+ambito(),{...cambio,versionControl:1,asunto:'No persistir'},500,'patch');}finally{fallo.mockRestore();}
    expect((await get(ruta(a)+ambito(),sl).expect(200)).body.correspondencia).toMatchObject({asunto:'Asunto corregido',versionControl:1});expect((await get(ruta(a)+'/correcciones'+ambito(),sl).expect(200)).body.correcciones).toHaveLength(1);
  });
  it('asocia antecedentes con versión fijada, conserva historial y comprueba FKs sin duplicidad',async()=>{
    const a=await alta('VINC-1'),antes=await db.query('SELECT id_version FROM version_documento WHERE id_documento=$1',[doc]);
    const v=(await mutar(ruta(a)+'/documentos'+ambito(),{documentoId:doc,versionDocumento:0,versionControl:0,versionFijada:1},201)).body.dato.id;
    expect(await db.query('SELECT id_version FROM version_documento WHERE id_documento=$1',[doc])).toEqual(antes);
    await mutar(ruta(a)+'/documentos'+ambito(),{documentoId:doc,versionDocumento:0,versionControl:1,versionFijada:1},409);
    const ve=(await mutar(ruta(a)+'/expedientes'+ambito(),{expedienteId:exp,versionExpediente:0,versionControl:1},201)).body.dato.id;
    const c=await csrf();await request(app.getHttpServer()).post(`/api/documentos/${doc}/versiones`).set('Cookie',`${s}; ${c.cookie}`).set('x-csrf-token',c.token).field('direccionId',d).field('versionControl','0').attach('archivo',pdf,'segunda.pdf').expect(201);
    expect((await get(ruta(a)+ambito(),s).expect(200)).body.documentos[0].numeroVersion).toBe(1);
    expect((await get(ruta(a)+ambito(),sl).expect(200)).body.expedientes).toEqual([]);
    await mutar(ruta(a)+`/documentos/${v}/retirar`+ambito(),{versionControl:2,motivo:'Retiro'},200,'patch');
    await mutar(ruta(a)+`/expedientes/${ve}/retirar`+ambito(),{versionControl:3,motivo:'Retiro'},200,'patch');
    const dinamico=(await mutar(ruta(a)+'/documentos'+ambito(),{documentoId:doc,versionDocumento:1,versionControl:4,versionFijada:null},201)).body.dato.id;
    expect((await get(ruta(a)+ambito(),s).expect(200)).body.documentos).toEqual(expect.arrayContaining([expect.objectContaining({numeroVersion:2,versionFijada:null}),expect.objectContaining({numeroVersion:1,motivoRetiro:'Retiro'})]));
    await mutar(ruta(a)+`/documentos/${dinamico}/retirar`+ambito(),{versionControl:5,motivo:'Retiro dinámico'},200,'patch');
    const c3=await csrf();await request(app.getHttpServer()).post(`/api/documentos/${doc}/versiones`).set('Cookie',`${s}; ${c3.cookie}`).set('x-csrf-token',c3.token).field('direccionId',d).field('versionControl','1').attach('archivo',pdf,'tercera.pdf').expect(201);
    expect((await get(ruta(a)+ambito(),s).expect(200)).body.documentos).toEqual(expect.arrayContaining([expect.objectContaining({numeroVersion:2,motivoRetiro:'Retiro dinámico'})]));
    const b=await alta('FK-1');await expect(db.query('INSERT INTO correspondencia_documento(id_correspondencia,id_direccion,id_documento,vinculado_por) VALUES($1,$2,$3,$4)',[b,ajena,doc,u])).rejects.toMatchObject({code:'23503'});
    expect(await db.query('SELECT id_correspondencia_documento FROM correspondencia_documento WHERE id_correspondencia=$1',[b])).toEqual([]);
  });
  const seguimiento=(c:string)=>ruta(c)+'/seguimiento';
  const datosSeg=(ref:string)=>({...datos(ref),fechaComunicacion:'2020-01-01'});
  const altaSeg=async(ref:string)=>(await mutar('/api/correspondencia',datosSeg(ref),201)).body.id as string;
  const actuacion=(tipo:string,versionControl:number,extra:Record<string,unknown>={})=>({tipo,versionControl,fechaActuacion:'2020-01-02T09:00',responsableId:propio,...extra});
  const consulta=(fuente:string,filtros:Record<string,string>={})=>'/api/consultas/registros?'+new URLSearchParams({direccionId:d,fuente,...filtros}).toString();
  const detalleConsulta=(fuente:string,x:string)=>`/api/consultas/${fuente}/${x}${ambito()}`;
  it('CU-33: intersecta permisos de fuente y Dirección y revalida el detalle',async()=>{
    const a=await alta('CU33-PERM');
    expect((await get('/api/consultas/ambitos',s).expect(200)).body.ambitos).toEqual([expect.objectContaining({id:d,fuentes:['CORRESPONDENCIA','DOCUMENTOS','EXPEDIENTES','ACTUACIONES']})]);
    expect((await get('/api/consultas/ambitos',sf).expect(200)).body.ambitos).toEqual([]);
    await get(consulta('CORRESPONDENCIA'),sf).expect(403);
    await get('/api/consultas/ambitos','').expect(401);
    await grant(lectorFiltros,ajena,['FILTROS_CONSULTAR']);
    expect((await get('/api/consultas/ambitos',sf).expect(200)).body.ambitos).toEqual([]);
    await grant(lectorFiltros,d,['FILTROS_CONSULTAR']);
    expect((await get('/api/consultas/ambitos',sf).expect(200)).body.ambitos).toEqual([expect.objectContaining({id:d,fuentes:['CORRESPONDENCIA','DOCUMENTOS','ACTUACIONES']})]);
    await get(consulta('EXPEDIENTES'),sf).expect(403);
    await get(consulta('CORRESPONDENCIA',{direccionId:ajena}),sf).expect(403);
    await get('/api/consultas/catalogos?direccionId='+d+'&fuente=EXPEDIENTES',sf).expect(403);
    expect((await get(consulta('CORRESPONDENCIA',{referenciaOficial:'CU33-PERM'}),sf).expect(200)).body.total).toBe(1);
    await get(detalleConsulta('CORRESPONDENCIA',a),sf).expect(200);
    await db.query(`UPDATE asignacion_permiso SET fecha_revocacion=now(),revocado_por=$1 WHERE id_usuario=$2 AND id_direccion=$3 AND fecha_revocacion IS NULL AND id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='CORRESPONDENCIA_CONSULTAR')`,[u,lectorFiltros,d]);
    await get(detalleConsulta('CORRESPONDENCIA',a),sf).expect(403);
    const historicas=await db.query(`SELECT id_asignacion_permiso,fecha_revocacion FROM asignacion_permiso WHERE id_usuario=$1 AND id_direccion=$2 AND fecha_revocacion IS NOT NULL AND id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='CORRESPONDENCIA_CONSULTAR') ORDER BY id_asignacion_permiso`,[lectorFiltros,d]);
    expect(historicas).toHaveLength(1);
    await grant(lectorFiltros,d,['CORRESPONDENCIA_CONSULTAR']);
    await get(detalleConsulta('CORRESPONDENCIA',a),sf).expect(200);
    // Revocar solo la nueva asignación, preservando la vigencia histórica.
    await db.query(`UPDATE asignacion_permiso SET fecha_revocacion=now(),revocado_por=$1 WHERE id_usuario=$2 AND id_direccion=$3 AND fecha_revocacion IS NULL AND id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='CORRESPONDENCIA_CONSULTAR')`,[u,lectorFiltros,d]);
    await get(detalleConsulta('CORRESPONDENCIA',a),sf).expect(403);
    expect(await db.query('SELECT id_asignacion_permiso,fecha_revocacion FROM asignacion_permiso WHERE id_asignacion_permiso=$1',[(historicas as Array<{id_asignacion_permiso:string}>)[0].id_asignacion_permiso])).toEqual(historicas);
    await grant(lectorFiltros,d,['CORRESPONDENCIA_CONSULTAR']);
    await get(detalleConsulta('CORRESPONDENCIA',a),sf).expect(200);
    await db.query(`UPDATE asignacion_permiso SET fecha_revocacion=now(),revocado_por=$1 WHERE id_usuario=$2 AND id_direccion=$3 AND fecha_revocacion IS NULL AND id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='FILTROS_CONSULTAR')`,[u,lectorFiltros,d]);
    await get(detalleConsulta('CORRESPONDENCIA',a),sf).expect(403);
  });
  it('CU-33: combina filtros exactos de correspondencia, pagina y conserva datos sin modificar',async()=>{
    const ids:string[]=[];
    for(let i=0;i<22;i++)ids.push((await mutar('/api/correspondencia',{...datos('CU33-PAG-'+i),periodoId:p,fechaComunicacion:'2026-11-17'},201)).body.id as string);
    await mutar('/api/correspondencia',{...datos('CU33-AJENA-FILTRO'),periodoId:p,remitenteId:otro,fechaComunicacion:'2026-11-17'},201);
    const filtros={sentido:'RECIBIDA',tipoId:tipo,periodoId:p,remitenteId:remitente,destinatarioId:propio,desde:'2026-11-17',hasta:'2026-11-17'};
    const versiones=await db.query('SELECT id_correspondencia,version_control FROM correspondencia WHERE id_direccion=$1 ORDER BY id_correspondencia',[d]);
    const antes=await db.query('SELECT count(*) FROM registro_auditoria WHERE id_direccion=$1',[d]);
    const r=(await get(consulta('CORRESPONDENCIA',filtros),s).expect(200)).body;
    expect(r).toMatchObject({total:22,pagina:0,tamanoPagina:20,haySiguiente:true});expect(r.registros.map((x:{id:string})=>x.id)).toEqual(ids.slice().reverse().slice(0,20));
    const pag=(await get(consulta('CORRESPONDENCIA',{...filtros,pagina:'1'}),s).expect(200)).body;
    expect(pag).toMatchObject({total:22,haySiguiente:false});expect(pag.registros.map((x:{id:string})=>x.id)).toEqual(ids.slice().reverse().slice(20));
    expect((await get(consulta('CORRESPONDENCIA',{...filtros,pagina:'2'}),s).expect(200)).body).toMatchObject({total:22,registros:[]});
    expect((await get(consulta('CORRESPONDENCIA',{...filtros,identificador:'COR-'+ids[0].padStart(6,'0'),referenciaOficial:' cu33-pag-0 '}),s).expect(200)).body).toMatchObject({total:1,registros:[expect.objectContaining({id:ids[0]})]});
    expect((await get(consulta('CORRESPONDENCIA',{referenciaOficial:'CU33-PAG'}),s).expect(200)).body).toMatchObject({total:0,registros:[]});
    expect((await get(consulta('CORRESPONDENCIA',{referenciaOficial:"%' OR 1=1 --"}),s).expect(200)).body.total).toBe(0);
    await get(consulta('CORRESPONDENCIA',{titulo:'Incompatible'}),s).expect(400);
    await get(consulta('CORRESPONDENCIA',{desde:'2026-11-18',hasta:'2026-11-17'}),s).expect(400);
    expect(await db.query('SELECT id_correspondencia,version_control FROM correspondencia WHERE id_direccion=$1 ORDER BY id_correspondencia',[d])).toEqual(versiones);
    expect(await db.query('SELECT count(*) FROM registro_auditoria WHERE id_direccion=$1',[d])).toEqual(antes);
  },30000);
  it('CU-33: excluye documentos restringidos del conteo y del detalle, incluso tras cambiar restricciones',async()=>{
    const antes=(await get(`/api/documentos/${doc}${ambito()}`,s).expect(200)).body.documento;
    const f={codigo:antes.codigo,titulo:' antecedente cu05 ',categoria:'PRUEBA',versionActual:String(antes.versionActual)};
    expect((await get(consulta('DOCUMENTOS',f),sd).expect(200)).body).toMatchObject({total:1,registros:[expect.objectContaining({id:doc})]});
    expect((await get(consulta('DOCUMENTOS',{titulo:'Antecedente'}),sd).expect(200)).body.total).toBe(0);
    await mutar(`/api/documentos/${doc}/restriccion${ambito()}`,{restringido:true,motivo:'Prueba CU33',versionControl:antes.versionControl},200,'patch');
    try{
      expect((await get(consulta('DOCUMENTOS',f),sd).expect(200)).body).toMatchObject({total:0,registros:[]});
      await get(detalleConsulta('DOCUMENTOS',doc),sd).expect(403);
      expect((await get(consulta('DOCUMENTOS',f),s).expect(200)).body.total).toBe(1);
      expect((await get(detalleConsulta('DOCUMENTOS',doc),s).expect(200)).body.versiones[0]).not.toHaveProperty('claveArchivo');
    }finally{await mutar(`/api/documentos/${doc}/restriccion${ambito()}`,{restringido:false,motivo:'Fin prueba CU33',versionControl:antes.versionControl+1},200,'patch');}
  });
  it('CU-33: consulta expedientes y actuaciones mediante identificadores y fechas de Bolivia',async()=>{
    expect((await get(consulta('EXPEDIENTES',{identificador:'EXP-'+exp.padStart(6,'0'),asunto:' expediente de prueba ',periodoId:p}),s).expect(200)).body).toMatchObject({total:1,registros:[expect.objectContaining({id:exp})]});
    expect((await get(detalleConsulta('EXPEDIENTES',exp),s).expect(200)).body.expediente.id).toBe(exp);
    expect((await get('/api/consultas/catalogos?direccionId='+d+'&fuente=ACTUACIONES',s).expect(200)).body.tipos).toHaveLength(7);
    const a=await altaSeg('CU33-ACT');const m=(await mutar(seguimiento(a)+ambito(),actuacion('DERIVACION',0,{destinoId:otro,fechaActuacion:'2020-01-02T23:59'}),201)).body.dato.id as string;
    const f={identificador:'COR-'+a.padStart(6,'0'),tipoMovimiento:'DERIVACION',responsableId:propio,destinoId:otro,desde:'2020-01-02',hasta:'2020-01-02'};
    expect((await get(consulta('ACTUACIONES',f),s).expect(200)).body).toMatchObject({total:1,registros:[expect.objectContaining({id:m})]});
    expect((await get(consulta('ACTUACIONES',{...f,desde:'2020-01-03',hasta:'2020-01-03'}),s).expect(200)).body.total).toBe(0);
    expect((await get(detalleConsulta('ACTUACIONES',m),s).expect(200)).body).toMatchObject({correspondenciaId:a,movimiento:{id:m,tipo:'DERIVACION'}});
    await get(detalleConsulta('ACTUACIONES',m)+'&fuente=DOCUMENTOS',s).expect(400);
  });
  it('CU-06: registra, ordena, aclara y protege el historial sin simular estados',async()=>{
    const a=await altaSeg('SEG-CU06-1'),url=seguimiento(a)+ambito();
    expect((await get(url,sl).expect(200)).body).toMatchObject({situacion:'SIN_SEGUIMIENTO',movimientos:[],gestionar:false});
    await mutar(url,actuacion('RECEPCION',0),403,'post',sl);await mutar(url,actuacion('ENVIO',0),400);
    const m=(await mutar(url,actuacion('RECEPCION',0),201)).body.dato.id;
    await mutar(url,actuacion('RECEPCION',1),409);
    await mutar(url,actuacion('DERIVACION',1),400);
    await mutar(url,actuacion('DERIVACION',1,{destinoId:otro,fechaActuacion:'2020-01-02T08:00'}),409);
    await mutar(url,actuacion('DERIVACION',1,{destinoId:otro}),201);
    await mutar(url,actuacion('ACLARACION',2,{aclaradoId:m,observacion:'Aclaración documentada'}),201);
    await mutar(url,actuacion('ACLARACION',3,{aclaradoId:m,observacion:'Aclaración documentada'}),409);
    const h=(await get(url,sl).expect(200)).body;expect(h).toMatchObject({versionControl:3,situacion:'DERIVACION',ultimoDestino:'Unidad B'});expect(h.movimientos.map((x:{tipo:string})=>x.tipo)).toEqual(['RECEPCION','DERIVACION','ACLARACION']);
    const {direccionId,...original}=datosSeg('SEG-CU06-1');expect(direccionId).toBe(d);
    await mutar(ruta(a)+ambito(),{...original,remitenteId:otro,versionControl:3,motivo:'Cambio prohibido'},409,'patch');
    await mutar(ruta(a)+ambito(),{...original,asunto:'Asunto rectificado',versionControl:3,motivo:'Corrección descriptiva'},200,'patch');
    await mutar(url,actuacion('SEGUIMIENTO',3,{observacion:'Desactualizado'}),409);
  });
  it('CU-06: relaciona ambas comunicaciones con versiones y rechaza ciclos',async()=>{
    const a=await altaSeg('REL-CU06-1'),b=(await mutar('/api/correspondencia',{...datosSeg('REL-CU06-2'),sentido:'EMITIDA',remitenteId:propio,destinatarioId:remitente},201)).body.id as string;
    const c=await altaSeg('REL-CU06-3');
    await mutar(seguimiento(a)+ambito(),actuacion('RESPUESTA',0,{relacionadaId:a,versionRelacionada:0}),400);
    await mutar(seguimiento(a)+ambito(),actuacion('RESPUESTA',0,{relacionadaId:c,versionRelacionada:0}),400);
    await mutar(seguimiento(a)+ambito(),actuacion('RESPUESTA',0,{relacionadaId:b,versionRelacionada:1}),409);
    await mutar(seguimiento(a)+ambito(),actuacion('RESPUESTA',0,{relacionadaId:b,versionRelacionada:0}),201);
    expect((await get(seguimiento(b)+ambito(),sl).expect(200)).body).toMatchObject({versionControl:1,situacion:'SIN_SEGUIMIENTO',movimientos:[],relaciones:[expect.objectContaining({origen:a,relacionada:b,tipo:'RESPUESTA'})]});
    await mutar(seguimiento(b)+ambito(),actuacion('RESPUESTA',1,{relacionadaId:a,versionRelacionada:1}),409);
    expect((await get(seguimiento(b)+ambito(),sl).expect(200)).body).toMatchObject({versionControl:1,movimientos:[],relaciones:[expect.objectContaining({origen:a,relacionada:b,tipo:'RESPUESTA'})]});
    expect((await get(seguimiento(a)+ambito(),sl).expect(200)).body.versionControl).toBe(1);
    const {direccionId,...original}=datosSeg('REL-CU06-2');expect(direccionId).toBe(d);
    await mutar(ruta(b)+ambito(),{...original,sentido:'EMITIDA',remitenteId:propio,destinatarioId:otro,versionControl:1,motivo:'Cambio prohibido'},409,'patch');
    // A -> B -> C; C -> A cerraría un ciclo indirecto, sin relación directa previa entre C y A.
    await mutar(seguimiento(b)+ambito(),actuacion('RESPUESTA',1,{relacionadaId:c,versionRelacionada:0}),201);
    await mutar(seguimiento(c)+ambito(),actuacion('REITERACION',1,{relacionadaId:a,versionRelacionada:1}),409);
    expect((await get(seguimiento(c)+ambito(),sl).expect(200)).body).toMatchObject({versionControl:1,movimientos:[],relaciones:[expect.objectContaining({origen:b,relacionada:c,tipo:'RESPUESTA'})]});
    // A -> C es un vínculo acíclico válido aun cuando ya existe un camino A -> B -> C.
    await mutar(seguimiento(a)+ambito(),actuacion('REITERACION',1,{relacionadaId:c,versionRelacionada:1}),201);
    const envio=(await mutar(seguimiento(b)+ambito(),actuacion('ENVIO',2),201)).body.dato.id;
    await grant(u,ajena,['CORRESPONDENCIA_GESTIONAR','CORRESPONDENCIA_CATALOGOS_GESTIONAR']);
    const tipoAjeno=(await mutar('/api/correspondencia/tipos',{direccionId:ajena,codigo:'REL',nombre:'Tipo ajeno'},201)).body.id;
    const personaAjena=(await mutar('/api/correspondencia/interlocutores',{direccionId:ajena,tipo:'PROPIA_DIRECCION',nombre:''},201)).body.id;
    const fuera=(await mutar('/api/correspondencia',{...datosSeg('REL-FUERA'),direccionId:ajena,tipoId:tipoAjeno,remitenteId:personaAjena,destinatarioId:personaAjena},201)).body.id;
    await mutar(seguimiento(b)+ambito(),actuacion('RESPUESTA',3,{relacionadaId:fuera,versionRelacionada:0}),404);
    await expect(db.query('INSERT INTO relacion_correspondencia(id_direccion,id_correspondencia_origen,id_correspondencia_relacionada,id_movimiento,tipo_relacion,registrado_por) VALUES($1,$2,$3,$4,\'RESPUESTA\',$5)',[d,b,fuera,envio,u])).rejects.toMatchObject({code:'23503'});
    await get(seguimiento(a)+'?direccionId='+ajena,sl).expect(403);
  });
  it('CU-06: conserva evidencia fija, retira y revierte fallos de auditoría',async()=>{
    const a=await altaSeg('DOC-CU06-1'),url=seguimiento(a)+ambito();
    const servicio=app.get(SeguimientoService) as unknown as {auditar(...args:unknown[]):Promise<void>};const fallo=jest.spyOn(servicio,'auditar').mockRejectedValueOnce(new Error('Fallo de auditoría inducido para prueba'));
    try{await mutar(url,actuacion('RECEPCION',0),500);}finally{fallo.mockRestore();}
    expect((await get(url,s).expect(200)).body).toMatchObject({versionControl:0,movimientos:[]});
    const m=(await mutar(url,actuacion('RECEPCION',0),201)).body.dato.id,actual=(await get(`/api/documentos/${doc}${ambito()}`,s).expect(200)).body.documento.versionControl;
    const vinculo=seguimiento(a)+`/${m}/documentos`,v={documentoId:doc,versionDocumento:actual,versionControl:1,versionFijada:1};
    await mutar(vinculo+ambito(),{...v,versionFijada:null},400);
    await expect(db.query('INSERT INTO movimiento_documento(id_movimiento,id_direccion,id_documento,numero_version_fijada,vinculado_por) VALUES($1,$2,$3,1,$4)',[m,ajena,doc,u])).rejects.toMatchObject({code:'23503'});
    expect(await db.query('SELECT id_movimiento_documento FROM movimiento_documento WHERE id_movimiento=$1',[m])).toEqual([]);
    const enlace=(await mutar(vinculo+ambito(),v,201)).body.dato.id;
    const cs=await csrf();await request(app.getHttpServer()).post(`/api/documentos/${doc}/versiones`).set('Cookie',`${s}; ${cs.cookie}`).set('x-csrf-token',cs.token).field('direccionId',d).field('versionControl',String(actual)).attach('archivo',pdf,'evidencia-nueva.pdf').expect(201);
    expect((await get(url,sl).expect(200)).body.evidencias).toEqual([expect.objectContaining({numeroVersion:1,id:enlace})]);
    await mutar(vinculo+`/${enlace}/retirar`+ambito(),{versionControl:2,motivo:'Vínculo incorrecto'},200,'patch');
    expect((await get(url,s).expect(200)).body.evidencias).toEqual([expect.objectContaining({numeroVersion:1,motivoRetiro:'Vínculo incorrecto'})]);
    const ac=(await get(`/api/documentos/${doc}${ambito()}`,s).expect(200)).body.documento.versionControl;
    await mutar(`/api/documentos/${doc}/restriccion${ambito()}`,{restringido:true,motivo:'Prueba seguimiento',versionControl:ac},200,'patch');
    expect((await get(url,sl).expect(200)).body.evidencias).toEqual([]);
    await mutar(`/api/documentos/${doc}/restriccion${ambito()}`,{restringido:false,motivo:'Fin de prueba',versionControl:ac+1},200,'patch');
    await db.query(`UPDATE asignacion_permiso SET fecha_revocacion=now(),revocado_por=$1 WHERE id_usuario=$2 AND id_direccion=$3 AND fecha_revocacion IS NULL AND id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='SEGUIMIENTO_CONSULTAR')`,[u,lector,d]);await get(url,sl).expect(403);
  });
  it('oculta documentos restringidos y revalida permisos vigentes',async()=>{
    const a=await alta('SEG-1');const actual=(await get(`/api/documentos/${doc}${ambito()}`,s).expect(200)).body.documento.versionControl;
    await mutar(ruta(a)+'/documentos'+ambito(),{documentoId:doc,versionDocumento:actual,versionControl:0,versionFijada:1},201);
    await mutar(`/api/documentos/${doc}/restriccion${ambito()}`,{restringido:true,motivo:'Prueba',versionControl:actual},200,'patch');
    expect((await get(ruta(a)+ambito(),sl).expect(200)).body.documentos).toEqual([]);expect((await get(ruta(a)+ambito(),s).expect(200)).body.documentos).toHaveLength(1);
    await get(`/api/documentos/${doc}/versiones/1/archivo${ambito()}`,sl).expect(403);
    await grant(lector,d,['CORRESPONDENCIA_GESTIONAR']);
    await mutar(ruta(a)+'/documentos'+ambito(),{documentoId:doc,versionDocumento:actual+1,versionControl:1,versionFijada:1},403,'post',sl);
    await db.query(`UPDATE asignacion_permiso SET fecha_revocacion=now(),revocado_por=$1 WHERE id_usuario=$2 AND id_direccion=$3 AND fecha_revocacion IS NULL AND id_permiso IN (SELECT id_permiso FROM permiso WHERE codigo='CORRESPONDENCIA_CONSULTAR')`,[u,lector,d]);await get(ruta(a)+ambito(),sl).expect(403);
  });
});
