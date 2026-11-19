import { useEffect,useState,useRef } from 'react';
import logo from '../assets/logo-informatica.jpg';
import { solicitudApi } from '../cuenta/api';
import { NavegacionInstitucional } from '../navegacion/NavegacionInstitucional';
import { AvisoOperacion } from '../administracion/AvisoOperacion';
import '../administracion/autorizaciones.css';
import '../documentos/documentos.css';
import './consultas.css';

const RUTA='/api/consultas';
const FUENTES={CORRESPONDENCIA:'Correspondencia',DOCUMENTOS:'Documentos',EXPEDIENTES:'Expedientes',ACTUACIONES:'Actuaciones'};
type Fuente=keyof typeof FUENTES;
type Ambito={id:string;nombre:string;fuentes:Fuente[]};
type Opcion={value:string;label:string};
type Catalogos={tipos?:{id?:string;codigo:string;nombre:string}[];interlocutores?:{id:string;nombre:string;tipo:string}[];periodos?:{id:string;gestion:number;codigo:string}[]};
type Filtro={clave:string;etiqueta:string;tipo?:'date'|'number';opciones?:Opcion[];max?:number;placeholder?:string};
type Resultado={id:string;codigo:string;titulo:string;resumen:string;fecha:string};
type Lista={registros:Resultado[];total:number;pagina:number;tamanoPagina:number;haySiguiente:boolean};
type Valores=Record<string,string|number|boolean|null|undefined>;
type Detalle={correspondencia?:Valores;documento?:Valores;expediente?:Valores;movimiento?:Valores;correspondenciaId?:string;documentos?:Valores[];expedientes?:Valores[];vinculos?:Valores[];evidencias?:Valores[];versiones?:Valores[]};
const mensaje=(e:unknown)=>e instanceof Error?e.message:'No se pudo completar la consulta.';
const visual=(prefijo:string,id:unknown)=>`${prefijo}-${String(id).padStart(6,'0')}`;
const fechaVisible=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s:new Date(s).toLocaleString('es-BO',{timeZone:'America/La_Paz'});
const parametros=(d:string,f:Fuente)=>new URLSearchParams({direccionId:d,fuente:f});
function filtros(f:Fuente,c:Catalogos):Filtro[]{
  const periodos=(c.periodos??[]).map(p=>({value:p.id,label:`${p.gestion} — ${p.codigo}`}));
  const personas=(c.interlocutores??[]).map(p=>({value:p.id,label:`${p.nombre} (ID ${p.id})`}));
  const tipos=(c.tipos??[]).map(t=>({value:f==='ACTUACIONES'?t.codigo:t.id??'',label:t.nombre}));
  const cor:Filtro={clave:'identificador',etiqueta:'Identificador COR',placeholder:'COR-000001',max:23};
  const porPeriodo:Filtro={clave:'periodoId',etiqueta:'Periodo académico',opciones:periodos};
  const propios:Record<Fuente,Filtro[]>={
    CORRESPONDENCIA:[cor,{clave:'referenciaOficial',etiqueta:'Referencia oficial',max:50},{clave:'sentido',etiqueta:'Sentido',opciones:[{value:'RECIBIDA',label:'Recibida'},{value:'EMITIDA',label:'Emitida'}]},{clave:'tipoId',etiqueta:'Tipo de correspondencia',opciones:tipos},porPeriodo,{clave:'remitenteId',etiqueta:'Remitente',opciones:personas},{clave:'destinatarioId',etiqueta:'Destinatario',opciones:personas}],
    DOCUMENTOS:[{clave:'codigo',etiqueta:'Código documental (UUID)',max:36},{clave:'titulo',etiqueta:'Título exacto',max:160},{clave:'categoria',etiqueta:'Categoría exacta',max:80},{clave:'versionActual',etiqueta:'Versión vigente',tipo:'number',max:1000}],
    EXPEDIENTES:[{clave:'identificador',etiqueta:'Identificador EXP',placeholder:'EXP-000001',max:23},{clave:'codigo',etiqueta:'Código administrativo',max:50},{clave:'asunto',etiqueta:'Asunto exacto',max:250},porPeriodo],
    ACTUACIONES:[cor,{clave:'tipoMovimiento',etiqueta:'Tipo de actuación',opciones:tipos},{clave:'responsableId',etiqueta:'Responsable',opciones:personas},{clave:'destinoId',etiqueta:'Destino',opciones:personas}],
  };
  return [...propios[f],{clave:'desde',etiqueta:'Desde',tipo:'date'},{clave:'hasta',etiqueta:'Hasta',tipo:'date'}];
}
const etiquetas:Record<string,string>={sentido:'Sentido',tipoNombre:'Tipo',referenciaOficial:'Referencia oficial',remitente:'Remitente',destinatario:'Destinatario',fechaComunicacion:'Fecha de comunicación',periodoId:'ID de periodo',referencia:'Referencia',observaciones:'Observaciones',fechaRegistro:'Fecha de registro',titulo:'Título',codigo:'Código',categoria:'Categoría',descripcion:'Descripción',versionActual:'Versión vigente',fechaCreacion:'Fecha de creación',asunto:'Asunto',gestion:'Gestión',codigoPeriodo:'Periodo',orden:'Orden de registro',tipo:'Actuación',fecha:'Fecha de actuación',registro:'Fecha de registro',responsable:'Responsable',destino:'Destino',observacion:'Observación',relacionadaId:'ID de comunicación relacionada',relacionadaAsunto:'Asunto relacionado',aclaradoId:'ID de actuación aclarada'};
const camposDetalle:Record<Fuente,string[]>={CORRESPONDENCIA:['asunto','sentido','tipoNombre','referenciaOficial','remitente','destinatario','fechaComunicacion','fechaRegistro','periodoId','referencia','observaciones'],DOCUMENTOS:['codigo','titulo','categoria','descripcion','versionActual','fechaCreacion'],EXPEDIENTES:['codigo','asunto','descripcion','gestion','codigoPeriodo'],ACTUACIONES:['orden','tipo','fecha','registro','responsable','destino','referencia','observacion','relacionadaId','relacionadaAsunto','aclaradoId']};
function DetalleRegistro({f,d,detalle,cerrar}:{f:Fuente;d:string;detalle:Detalle;cerrar:()=>void}){
  const datos=(detalle.correspondencia??detalle.documento??detalle.expediente??detalle.movimiento)??{};
  const docs=detalle.documentos??detalle.vinculos??detalle.evidencias??[];
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{panel.current?.focus();},[]);
  const enlace=(id:unknown,n:unknown)=>`/api/documentos/${encodeURIComponent(String(id))}/versiones/${encodeURIComponent(String(n))}/archivo?direccionId=${encodeURIComponent(d)}`;
  return <section className="admin-panel docs-detalle" ref={panel} tabIndex={-1} aria-label="Detalle autorizado"><div className="docs-detalle-cabecera"><h2>Detalle autorizado</h2><button className="admin-boton-claro" onClick={cerrar}>Cerrar detalle</button></div>
    {detalle.correspondenciaId&&<p>Comunicación: {visual('COR',detalle.correspondenciaId)}</p>}
    <dl className="consultas-detalle">{camposDetalle[f].map(k=><div key={k}><dt>{etiquetas[k]}</dt><dd>{datos[k]===null||datos[k]===undefined||datos[k]===''?'—':k.startsWith('fecha')||k==='registro'?fechaVisible(String(datos[k])):String(datos[k])}</dd></div>)}</dl>
    {detalle.versiones&&<><h3>Versiones documentales</h3><ul className="docs-versiones">{detalle.versiones.map(v=><li key={String(v.id)}><span>Versión {v.numeroVersion} · {v.nombreOriginal}</span><a href={enlace(datos.id,v.numeroVersion)}>Descargar</a></li>)}</ul></>}
    {f!=='DOCUMENTOS'&&<><h3>Antecedentes documentales autorizados</h3>{docs.length?<ul className="docs-versiones">{docs.map(v=><li key={String(v.id)}><div><strong>{v.titulo}</strong><small>Versión {v.numeroVersion} · {v.nombreOriginal}</small>{v.fechaRetiro&&<small>Retirado: {v.motivoRetiro}</small>}</div><a href={enlace(v.documentoId,v.numeroVersion)}>Descargar</a></li>)}</ul>:<p>No hay antecedentes documentales accesibles.</p>}</>}
    {detalle.expedientes&&<><h3>Expedientes asociados autorizados</h3>{detalle.expedientes.length?<ul>{detalle.expedientes.map(e=><li key={String(e.id)}>{visual('EXP',e.expedienteId)} · {e.asunto}{e.fechaRetiro?` · Retirado: ${e.motivoRetiro}`:''}</li>)}</ul>:<p>No hay expedientes accesibles.</p>}</>}
  </section>;
}
function FuenteConsulta({d,f}:{d:string;f:Fuente}){
  const [catalogos,setCatalogos]=useState<Catalogos|null>(null),[borrador,setBorrador]=useState<Record<string,string>>({});
  const [consulta,setConsulta]=useState<{criterios:Record<string,string>;pagina:number}|null>(null),[lista,setLista]=useState<Lista|null>(null);
  const [detalle,setDetalle]=useState<Detalle|null>(null),[error,setError]=useState(''),[ocupado,setOcupado]=useState(false),[seleccion,setSeleccion]=useState<{id:string}|null>(null);
  useEffect(()=>{let vivo=true;solicitudApi<Catalogos>(`${RUTA}/catalogos?${parametros(d,f)}`).then(r=>{if(vivo)setCatalogos(r);}).catch(e=>{if(vivo)setError(mensaje(e));});return()=>{vivo=false;};},[d,f]);
  useEffect(()=>{if(!consulta)return;let vivo=true;const p=parametros(d,f);p.set('pagina',String(consulta.pagina));for(const [k,v] of Object.entries(consulta.criterios))if(v.trim())p.set(k,v);
    setLista(null);setDetalle(null);setSeleccion(null);setError('');setOcupado(true);
    solicitudApi<Lista>(`${RUTA}/registros?${p}`).then(r=>{if(vivo)setLista(r);}).catch(e=>{if(vivo)setError(mensaje(e));}).finally(()=>{if(vivo)setOcupado(false);});return()=>{vivo=false;};
  },[d,f,consulta]);
  useEffect(()=>{if(!seleccion)return;let vivo=true;setDetalle(null);setError('');setOcupado(true);
    solicitudApi<Detalle>(`${RUTA}/${f}/${encodeURIComponent(seleccion.id)}?direccionId=${encodeURIComponent(d)}`).then(r=>{if(vivo)setDetalle(r);}).catch(e=>{if(vivo){setError(mensaje(e));setLista(null);setOcupado(false);setSeleccion(null);}}).finally(()=>{if(vivo)setOcupado(false);});return()=>{vivo=false;};
  },[d,f,seleccion]);
  return <><AvisoOperacion error={error} exito="" cerrar={()=>setError('')}/><section className="admin-panel"><h2>Filtros — {FUENTES[f]}</h2><p className="admin-ayuda">Coincidencia exacta. Todos los criterios se combinan. Fechas inclusivas ({f==='CORRESPONDENCIA'?'fecha de comunicación':f==='ACTUACIONES'?'fecha de actuación':'fecha de creación'}, Bolivia).</p>
    {catalogos?<form className="admin-form consultas-form" onSubmit={e=>{e.preventDefault();setSeleccion(null);setDetalle(null);setConsulta({criterios:{...borrador},pagina:0});}}>{filtros(f,catalogos).map(x=><label key={x.clave}>{x.etiqueta}{x.opciones?<select value={borrador[x.clave]??''} onChange={e=>setBorrador({...borrador,[x.clave]:e.target.value})}><option value="">Todos</option>{x.opciones.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:<input type={x.tipo??'text'} placeholder={x.placeholder} maxLength={x.tipo?undefined:x.max} min={x.tipo==='number'?1:x.clave==='hasta'?borrador.desde||undefined:undefined} max={x.tipo==='number'?x.max:undefined} value={borrador[x.clave]??''} onChange={e=>setBorrador({...borrador,[x.clave]:e.target.value})}/>}</label>)}<button disabled={ocupado}>Consultar registros</button><button type="button" className="admin-boton-claro" disabled={ocupado} onClick={()=>{setBorrador({});setConsulta(null);setLista(null);setSeleccion(null);setDetalle(null);setError('');}}>Limpiar filtros</button></form>:<p role="status">{error?'No fue posible cargar los filtros.':'Cargando filtros autorizados…'}</p>}</section>
    {ocupado&&<p role="status">Consultando…</p>}{lista&&<section className="admin-panel"><h2>Resultados</h2><p role="status">{lista.total} coincidencias autorizadas. {lista.registros.length?'':'No se encontraron registros en esta página.'}</p><p className="admin-ayuda">Resultados de la última consulta ejecutada.</p><ul className="docs-lista">{lista.registros.map(r=><li key={r.id}><button className="admin-boton-claro docs-documento" disabled={ocupado} onClick={()=>{setSeleccion({id:r.id});}}><strong>{r.titulo}</strong><small>{r.codigo} · {fechaVisible(r.fecha)}</small><small>{r.resumen} · Ver detalle</small></button></li>)}</ul><div className="docs-paginas"><button className="admin-boton-claro" disabled={ocupado||lista.pagina===0} onClick={()=>setConsulta(c=>c&&{...c,pagina:c.pagina-1})}>Anterior</button><span>Página {lista.pagina+1}</span><button className="admin-boton-claro" disabled={ocupado||!lista.haySiguiente||lista.pagina>=100000} onClick={()=>setConsulta(c=>c&&{...c,pagina:c.pagina+1})}>Siguiente</button></div></section>}
    {detalle&&<DetalleRegistro f={f} d={d} detalle={detalle} cerrar={()=>{setDetalle(null);setSeleccion(null);}}/>}</>;
}
export function ConsultasPage(){
  const [ambitos,setAmbitos]=useState<Ambito[]|null>(null),[d,setD]=useState(''),[f,setF]=useState<Fuente>('CORRESPONDENCIA'),[error,setError]=useState('');
  useEffect(()=>{let vivo=true;solicitudApi<{ambitos:Ambito[]}>(`${RUTA}/ambitos`).then(r=>{if(vivo){setAmbitos(r.ambitos);setD(r.ambitos[0]?.id??'');setF(r.ambitos[0]?.fuentes[0]??'CORRESPONDENCIA');}}).catch(e=>{if(vivo){setError(mensaje(e));setAmbitos([]);}});return()=>{vivo=false;};},[]);
  const actual=ambitos?.find(a=>a.id===d);
  return <div className="admin-pagina docs-pagina"><header className="admin-cabecera"><div className="admin-cabecera-interior"><a href="/" className="admin-identidad"><img src={logo} alt="Escudo de Ingeniería Informática UAGRM"/><span><small>UAGRM · FICCT</small><strong>Dirección de Ingeniería Informática</strong></span></a><NavegacionInstitucional/></div></header><main className="admin-contenedor"><div className="admin-introduccion"><p className="admin-sobre">Búsqueda y procesamiento documental</p><h1>Consulta de registros institucionales</h1><p>Localizá registros mediante filtros administrativos exactos, sin modificar sus datos.</p></div><AvisoOperacion error={error} exito="" cerrar={()=>setError('')}/>{ambitos===null?<p role="status">Comprobando permisos…</p>:!actual?<section className="admin-panel"><h2>Sin fuentes autorizadas</h2><p>No disponés de ámbitos con permisos de consulta convencional y de fuente.</p></section>:<><section className="admin-panel admin-form consultas-form"><label>Dirección institucional<select value={d} onChange={e=>{setD(e.target.value);setF(ambitos.find(a=>a.id===e.target.value)!.fuentes[0]);}}>{ambitos.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label><label>Fuente de información<select value={f} onChange={e=>setF(e.target.value as Fuente)}>{actual.fuentes.map(x=><option key={x} value={x}>{FUENTES[x]}</option>)}</select></label></section><FuenteConsulta key={`${d}:${f}`} d={d} f={f}/></>}</main><footer className="admin-footer">Dirección de Ingeniería Informática · UAGRM</footer></div>;
}
