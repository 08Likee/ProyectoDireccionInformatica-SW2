import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import logo from '../assets/logo-informatica.jpg';
import { solicitudApi } from '../cuenta/api';
import { NavegacionInstitucional } from '../navegacion/NavegacionInstitucional';
import { AvisoOperacion } from '../administracion/AvisoOperacion';
import '../administracion/autorizaciones.css';
import './documentos.css';
import { solicitudArchivo } from './archivos-api';

type Direccion = {id:string;codigo:string;nombre:string};
type Documento = {id:string;direccionId:string;titulo:string;categoria:string;descripcion:string;
  versionActual:number;versionControl:number;nombreArchivo:string;tipoMime:string;tamano:string;fechaCreacion:string;restringido?:boolean};
type Version = {id:string;numeroVersion:number;nombreOriginal:string;tipoMime:string;tamanoBytes:string;fechaCreacion:string};
type Configuracion = {consulta:Direccion[];gestion:Direccion[];restricciones?:Direccion[];limiteBytes:number;formatos:string[]};
type Lista = {documentos:Documento[];pagina:number;haySiguiente:boolean};
const RUTA='/api/documentos';
const NUEVO={titulo:'',categoria:'',descripcion:''};

function bytes(valor:string):string {
  return `${(Number(valor)/1024).toFixed(1)} KB`;
}
function mensajeError(e:unknown):string {return e instanceof Error ? e.message : 'No se pudo completar la operación.';}

export function DocumentosPage() {
  const [configuracion,setConfiguracion]=useState<Configuracion|null>(null);
  const [direccionId,setDireccionId]=useState('');
  const [busqueda,setBusqueda]=useState('');
  const [filtro,setFiltro]=useState('');
  const [pagina,setPagina]=useState(0);
  const [recarga,setRecarga]=useState(0);
  const [documentos,setDocumentos]=useState<Documento[]>([]);
  const [haySiguiente,setHaySiguiente]=useState(false);
  const [datosNuevos,setDatosNuevos]=useState(NUEVO);
  const [archivoNuevo,setArchivoNuevo]=useState<File|null>(null);
  const [archivoVersion,setArchivoVersion]=useState<File|null>(null);
  const [seleccionado,setSeleccionado]=useState<Documento|null>(null);
  const [versiones,setVersiones]=useState<Version[]>([]);
  const [edicion,setEdicion]=useState(NUEVO);
  const [preview,setPreview]=useState<{url:string;tipo:string;nombre:string}|null>(null);
  const [error,setError]=useState('');
  const [mensaje,setMensaje]=useState('');
  const [cargando,setCargando]=useState(true);
  const [ocupado,setOcupado]=useState(false);
  const [buscando,setBuscando]=useState(false);
  const [consultasFinalizadas,setConsultasFinalizadas]=useState(0);
  const desplazarAlResultado=useRef(false);
  const resultadosRef=useRef<HTMLDivElement|null>(null);
  const solicitudVista=useRef(0);
  const maximoArchivo=configuracion?.limiteBytes ?? 50*1024*1024;
  const limiteMb=maximoArchivo/(1024*1024);

  useEffect(()=>{
    let vivo=true;
    void solicitudApi<Configuracion>(`${RUTA}/ambitos`)
      .then(r=>{if(vivo){setConfiguracion(r);setDireccionId(r.consulta[0]?.id ?? r.gestion[0]?.id ?? '');}})
      .catch(e=>{if(vivo)setError(mensajeError(e));})
      .finally(()=>{if(vivo)setCargando(false);});
    return()=>{vivo=false;};
  },[]);

  const puedeLeer=!!configuracion?.consulta.some(d=>d.id===direccionId);
  const puedeGestionar=!!configuracion?.gestion.some(d=>d.id===direccionId);
  const direcciones=Array.from(new Map([...(configuracion?.consulta??[]),...(configuracion?.gestion??[])]
    .map(d=>[d.id,d] as const)).values());

  useEffect(()=>{
    if (!direccionId || !puedeLeer) {setDocumentos([]);setBuscando(false);return;}
    let vivo=true;
    setBuscando(true);
    void solicitudApi<Lista>(`${RUTA}?${new URLSearchParams({direccionId,pagina:String(pagina),busqueda:filtro})}`)
      .then(r=>{if(vivo){setDocumentos(r.documentos);setHaySiguiente(r.haySiguiente);}})
      .catch(e=>{if(vivo){setError(mensajeError(e));setDocumentos([]);setHaySiguiente(false);}})
      .finally(()=>{if(vivo){setBuscando(false);setConsultasFinalizadas(n=>n+1);}});
    return()=>{vivo=false;};
  },[direccionId,puedeLeer,pagina,filtro,recarga]);

  // Desplazarse solo después de recibir la respuesta y pintar los resultados.
  useEffect(()=>{
    if (!consultasFinalizadas || !desplazarAlResultado.current) return;
    desplazarAlResultado.current=false;
    resultadosRef.current?.scrollIntoView?.({behavior:'smooth',block:'start'});
    resultadosRef.current?.focus({preventScroll:true});
  },[consultasFinalizadas]);

  useEffect(()=>{
    if (!seleccionado) {setVersiones([]);return;}
    let vivo=true;
    void solicitudApi<{documento:Documento;versiones:Version[]}>(
      `${RUTA}/${seleccionado.id}?direccionId=${encodeURIComponent(seleccionado.direccionId)}`)
      .then(r=>{if(vivo){setVersiones(r.versiones);setSeleccionado(r.documento);setEdicion({
        titulo:r.documento.titulo,categoria:r.documento.categoria,descripcion:r.documento.descripcion});}})
      .catch(e=>{if(vivo){setError(mensajeError(e));setSeleccionado(null);setVersiones([]);cerrarVista();}});
    return()=>{vivo=false;};
  },[seleccionado?.id,recarga]);

  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url);},[preview]);
  useEffect(()=>()=>{solicitudVista.current++;},[]);

  function limpiarMensajes(){setError('');setMensaje('');}
  function cerrarVista(){solicitudVista.current++;setPreview(null);}
  function cambiarDireccion(id:string){desplazarAlResultado.current=false;setDireccionId(id);setPagina(0);setSeleccionado(null);cerrarVista();}
  function buscar(e:FormEvent){e.preventDefault();limpiarMensajes();desplazarAlResultado.current=true;setPagina(0);setFiltro(busqueda.trim());setRecarga(n=>n+1);}
  function cambiarNuevo(e:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>){
    setDatosNuevos(prev=>({...prev,[e.target.name]:e.target.value}));
  }
  function cambiarEdicion(e:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>){
    setEdicion(prev=>({...prev,[e.target.name]:e.target.value}));
  }
  async function crear(e:FormEvent){
    e.preventDefault();limpiarMensajes();if(!archivoNuevo)return setError('Seleccioná un archivo.');
    if (archivoNuevo.size>maximoArchivo) return setError(`El archivo supera el límite de ${limiteMb} MB.`);
    if (!window.confirm(`¿Incorporar «${datosNuevos.titulo}» en esta Dirección?`)) return;
    const form=new FormData();form.append('direccionId',direccionId);
    Object.entries(datosNuevos).forEach(([k,v])=>form.append(k,v));form.append('archivo',archivoNuevo);
    setOcupado(true);
    try {await solicitudArchivo(RUTA,form);setMensaje('Documento incorporado correctamente.');
      setDatosNuevos(NUEVO);setArchivoNuevo(null);setRecarga(n=>n+1);
      const entrada=document.getElementById('doc-archivo') as HTMLInputElement|null;if(entrada)entrada.value='';}
    catch(e){setError(mensajeError(e));}finally{setOcupado(false);}
  }
  async function guardarMetadatos(e:FormEvent){
    e.preventDefault();if(!seleccionado)return;limpiarMensajes();
    if(!window.confirm('¿Confirmar la corrección de los metadatos?'))return;
    setOcupado(true);
    try {await solicitudApi(`${RUTA}/${seleccionado.id}?direccionId=${direccionId}`,'PATCH',
      {...edicion,versionControl:seleccionado.versionControl});setMensaje('Metadatos actualizados.');setRecarga(n=>n+1);}
    catch(e){setError(mensajeError(e));}finally{setOcupado(false);}
  }
  async function agregarVersion(e:FormEvent){
    e.preventDefault();if(!seleccionado||!archivoVersion)return;limpiarMensajes();
    if (archivoVersion.size>maximoArchivo) return setError(`El archivo supera el límite de ${limiteMb} MB.`);
    if(!window.confirm(`¿Incorporar una nueva versión de «${seleccionado.titulo}»? Se conservará la anterior.`))return;
    const form=new FormData();form.append('direccionId',direccionId);
    form.append('versionControl',String(seleccionado.versionControl));form.append('archivo',archivoVersion);
    setOcupado(true);
    try {await solicitudArchivo(`${RUTA}/${seleccionado.id}/versiones`,form);
      setMensaje('Nueva versión registrada.');setArchivoVersion(null);setRecarga(n=>n+1);
      const entrada=document.getElementById('doc-version') as HTMLInputElement|null;if(entrada)entrada.value='';}
    catch(e){setError(mensajeError(e));}finally{setOcupado(false);}
  }
  async function cambiarRestriccion(){
    if(!seleccionado)return;
    const restringido=!seleccionado.restringido;
    const motivo=window.prompt(restringido?'Motivo de la restricción:':'Motivo del levantamiento de la restricción:');
    if(!motivo?.trim())return;
    if(!window.confirm(restringido?'¿Restringir este documento y todas sus versiones?':'¿Levantar la restricción de este documento?'))return;
    limpiarMensajes();setOcupado(true);cerrarVista();
    try{await solicitudApi(`${RUTA}/${seleccionado.id}/restriccion?direccionId=${direccionId}`,'PATCH',{restringido,motivo,versionControl:seleccionado.versionControl});setMensaje('Restricción actualizada.');setRecarga(n=>n+1);}
    catch(e){setError(mensajeError(e));}finally{setOcupado(false);}
  }
  async function recuperar(version:Version,vista=false){
    if(!seleccionado)return;limpiarMensajes();setOcupado(true);
    const solicitud=++solicitudVista.current;
    if(vista)setPreview(null);
    try {
      const r=await fetch(`${RUTA}/${seleccionado.id}/versiones/${version.numeroVersion}/archivo?direccionId=${encodeURIComponent(direccionId)}`,
        {credentials:'same-origin',cache:'no-store'});
      if(!r.ok){const e=await r.json().catch(()=>({})) as {message?:string};throw new Error(e.message??'No se pudo recuperar el archivo.');}
      const blob=await r.blob();
      if(vista){
        if(solicitud!==solicitudVista.current)return;
        // Solo se incrustan formatos de vista previa autorizados por el servidor.
        // No convertir una respuesta HTML u otro contenido inesperado en un PDF.
        if(!['application/pdf','image/png','image/jpeg'].includes(version.tipoMime) || blob.type!==version.tipoMime){
          throw new Error('El tipo de archivo recibido no coincide con el documento. No se puede mostrar la vista previa.');
        }
        setPreview({url:URL.createObjectURL(blob),tipo:version.tipoMime,nombre:version.nombreOriginal});
      } else {
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download=version.nombreOriginal;
        document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
      }
    } catch(e){if(!vista||solicitud===solicitudVista.current)setError(mensajeError(e));}finally{setOcupado(false);}
  }

  return <div className="admin-pagina docs-pagina">
    <header className="admin-cabecera"><div className="admin-cabecera-interior">
      <a href="/" className="admin-identidad"><img src={logo} alt="Escudo de Ingeniería Informática UAGRM"/>
        <span><small>UAGRM · FICCT</small><strong>Dirección de Ingeniería Informática</strong></span></a>
      <NavegacionInstitucional/>
    </div></header>
    <main className="admin-contenedor">
      <div className="admin-introduccion"><p className="admin-sobre">Gestión documental</p>
        <h1>Documentos digitales</h1><p>Incorporá, consultá y mantené versiones de los archivos de tu Dirección.</p>
      </div>
      <AvisoOperacion error={error} exito={mensaje} cerrar={limpiarMensajes}/>
      {cargando && <p role="status">Comprobando permisos documentales...</p>}
      {!cargando && !configuracion && <section className="admin-panel"><h2>Acceso restringido</h2>
        <p>Necesitás una sesión vigente y permiso documental específico.</p></section>}
      {configuracion && <>
        <div className="admin-panel docs-ambito"><label>Dirección institucional
          <select value={direccionId} onChange={e=>cambiarDireccion(e.target.value)}>
            {direcciones.map(d=><option value={d.id} key={d.id}>{d.nombre}</option>)}
          </select></label><p className="admin-ayuda">El acceso se verifica en cada operación, incluso al descargar.</p></div>
        <div className="admin-paneles">
          {puedeGestionar && <section className="admin-panel"><h2>Incorporar documento</h2>
            <p className="admin-ayuda">El archivo se almacena en un repositorio privado y mantiene su historial de versiones.</p>
            <form onSubmit={crear} className="admin-form">
              <label>Título<input name="titulo" value={datosNuevos.titulo} maxLength={160} minLength={2} required onChange={cambiarNuevo}/></label>
              <label>Categoría<input name="categoria" value={datosNuevos.categoria} maxLength={80} minLength={2} required onChange={cambiarNuevo}/></label>
              <label>Descripción<textarea name="descripcion" value={datosNuevos.descripcion} maxLength={1000} onChange={cambiarNuevo}/></label>
              <label>Archivo<input id="doc-archivo" type="file" required accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png"
                onChange={e=>setArchivoNuevo(e.target.files?.[0]??null)}/></label>
              <p className="admin-ayuda">PDF, DOCX, XLSX, CSV, JPG o PNG. Tamaño máximo: {limiteMb} MB por archivo.</p>
              <button type="submit" disabled={ocupado||!archivoNuevo}>Guardar documento</button>
            </form>
          </section>}
          {puedeLeer && <section className="admin-panel"><h2>Buscar documentos</h2>
            <form onSubmit={buscar} className="admin-form docs-busqueda">
              <label>Título o categoría<input value={busqueda} maxLength={100} placeholder="Buscar por título o categoría"
                onChange={e=>setBusqueda(e.target.value)}/></label>
              <button type="submit">Buscar</button>
            </form>
            <div ref={resultadosRef} tabIndex={-1} className="docs-resultados" role="region" aria-label="Resultados de documentos">
              <p role="status" className="admin-ayuda">{buscando ? 'Buscando documentos...' : documentos.length
                ? `${documentos.length} ${documentos.length===1 ? 'documento encontrado' : 'documentos encontrados'} en esta página.` : 'No se encontraron documentos para esta búsqueda.'}</p>
              {!buscando && !!documentos.length && <ul className="docs-lista">{documentos.map(d=><li key={d.id}>
                <button type="button" className="admin-boton-claro docs-documento" onClick={()=>{if(seleccionado?.id!==d.id)setVersiones([]);setSeleccionado(d);cerrarVista();}}>
                  <strong>{d.titulo}</strong><small>{d.categoria} · Versión {d.versionActual} · {bytes(d.tamano)}</small>
                </button></li>)}</ul>}
              <div className="docs-paginas"><span>Página {pagina+1}</span><div>
                <button type="button" className="admin-boton-claro" disabled={buscando||pagina===0}
                  onClick={()=>{desplazarAlResultado.current=true;setPagina(p=>p-1);}}>Anterior</button>
                <button type="button" className="admin-boton-claro" disabled={buscando||!haySiguiente}
                  onClick={()=>{desplazarAlResultado.current=true;setPagina(p=>p+1);}}>Siguiente</button>
              </div></div>
            </div>
          </section>}
        </div>
        {seleccionado && puedeLeer && <section className="admin-panel docs-detalle" aria-label="Detalle documental">
          <div className="docs-detalle-cabecera"><div><p className="admin-sobre">Detalle documental</p>
            <h2>{seleccionado.titulo}</h2></div>
            <button type="button" className="admin-boton-claro" onClick={()=>{setSeleccionado(null);cerrarVista();}}>Cerrar detalle</button></div>
          <p className="admin-ayuda">Categoría: {seleccionado.categoria}. Versión actual: {seleccionado.versionActual}.</p>
          {seleccionado.restringido && <p className="admin-ayuda">Documento con acceso restringido.</p>}
          {puedeGestionar && configuracion.restricciones?.some(d=>d.id===direccionId) && <button type="button" className="admin-boton-claro" disabled={ocupado} onClick={()=>void cambiarRestriccion()}>{seleccionado.restringido?'Levantar restricción':'Restringir documento'}</button>}
          <h3>Versiones disponibles</h3>
          <ul className="docs-versiones">{versiones.map(v=><li key={v.id}>
            <div><strong>Versión {v.numeroVersion}</strong><small>{v.nombreOriginal} · {bytes(v.tamanoBytes)}</small></div>
            <div className="docs-acciones">
              {['application/pdf','image/jpeg','image/png'].includes(v.tipoMime) && <button type="button" className="admin-boton-claro"
                disabled={ocupado} onClick={()=>void recuperar(v,true)}>Vista previa</button>}
              <button type="button" disabled={ocupado} onClick={()=>void recuperar(v)}>Descargar</button>
            </div></li>)}</ul>
          {preview && <div className="docs-preview"><div className="docs-detalle-cabecera"><h3>Vista previa: {preview.nombre}</h3>
            <button className="admin-boton-claro" type="button" onClick={cerrarVista}>Cerrar vista previa</button></div>
            {preview.tipo==='application/pdf' ? <>
              <p className="admin-ayuda docs-preview-ayuda">Si el visor no muestra el PDF, <a href={preview.url}
                target="_blank" rel="noopener noreferrer">abrir PDF en otra pestaña</a> o utilizá la opción Descargar de la versión correspondiente.</p>
              {/* El visor PDF nativo no funciona en algunos navegadores con sandbox vacío.
                  Se usa exclusivamente el blob PDF obtenido y validado arriba. */}
              <iframe title={`Vista previa de ${preview.nombre}`} src={preview.url} referrerPolicy="no-referrer" />
            </> : <img src={preview.url} alt={`Vista previa de ${preview.nombre}`} />}</div>}
          {puedeGestionar && <div className="docs-edicion">
            <form onSubmit={guardarMetadatos} className="admin-form"><h3>Corregir metadatos</h3>
              <label>Título<input name="titulo" value={edicion.titulo} maxLength={160} minLength={2} required onChange={cambiarEdicion}/></label>
              <label>Categoría<input name="categoria" value={edicion.categoria} maxLength={80} minLength={2} required onChange={cambiarEdicion}/></label>
              <label>Descripción<textarea name="descripcion" value={edicion.descripcion} maxLength={1000} onChange={cambiarEdicion}/></label>
              <button type="submit" disabled={ocupado}>Actualizar metadatos</button>
            </form>
            <form onSubmit={agregarVersion} className="admin-form"><h3>Incorporar nueva versión</h3>
              <p className="admin-ayuda">El archivo anterior no se elimina ni se sobrescribe.</p>
              <label>Nuevo archivo<input id="doc-version" type="file" required accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png"
                onChange={e=>setArchivoVersion(e.target.files?.[0]??null)}/></label>
              <button type="submit" disabled={ocupado||!archivoVersion}>Guardar nueva versión</button>
            </form>
          </div>}
        </section>}
      </>}
    </main>
    <footer className="admin-footer">Dirección de Ingeniería Informática · UAGRM · Archivo institucional protegido</footer>
  </div>;
}
