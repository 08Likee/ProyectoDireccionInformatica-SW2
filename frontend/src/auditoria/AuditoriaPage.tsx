import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import logo from '../assets/logo-informatica.jpg';
import { solicitudApi } from '../cuenta/api';
import { NavegacionInstitucional } from '../navegacion/NavegacionInstitucional';
import '../administracion/autorizaciones.css';
import './auditoria.css';

type Direccion = { id: string; codigo: string; nombre: string };
type Evento = { id: string; fechaHora: string; accion: string; entidad: string;
  identificadorEntidad: string | null; actor: string; tipoActor: string; resultado: string; origen: string };
type Detalle = Evento & { identificadorCorrelacion: string; datosAnteriores: Record<string, unknown> | null;
  datosPosteriores: Record<string, unknown> | null };
type Filtros = { desde: string; hasta: string; accion: string; actor: string; entidad: string; resultado: string };
type RespuestaEventos = { eventos: Evento[]; pagina: number; tamanoPagina: number; haySiguiente: boolean; direccion: Direccion };
const filtrosVacios: Filtros = { desde:'', hasta:'', accion:'', actor:'', entidad:'', resultado:'' };
const ruta = '/api/auditoria';

function fechaVisible(fecha: string): string {
  const fechaParseada = new Date(fecha);
  return Number.isNaN(fechaParseada.getTime()) ? 'Fecha no disponible' : fechaParseada.toLocaleString('es-BO');
}
function parametros(direccionId: string, pagina: number, filtros: Filtros): string {
  const q = new URLSearchParams({ direccionId, pagina: String(pagina) });
  Object.entries(filtros).forEach(([clave, valor]) => { if (valor.trim()) q.set(clave, valor.trim()); });
  return q.toString();
}
function valoresDetalle(valor: Record<string, unknown> | null): string {
  return valor ? JSON.stringify(valor, null, 2) : 'Sin campos disponibles para consulta.';
}

/** Consulta de auditoría: todos los datos vienen de lecturas autorizadas del backend. */
export function AuditoriaPage() {
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [direccionId, setDireccionId] = useState('');
  const [filtros, setFiltros] = useState<Filtros>(filtrosVacios);
  const [aplicados, setAplicados] = useState<Filtros>(filtrosVacios);
  const [pagina, setPagina] = useState(0);
  const [recarga, setRecarga] = useState(0);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [haySiguiente, setHaySiguiente] = useState(false);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [errorDetalle, setErrorDetalle] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  useEffect(() => {
    let activo = true;
    void solicitudApi<{ direcciones: Direccion[] }>(`${ruta}/direcciones`)
      .then(r => { if (activo) { setDirecciones(r.direcciones);setDireccionId(r.direcciones[0]?.id ?? ''); } })
      .catch(e => { if (activo) setError(e instanceof Error ? e.message : 'No se pudo verificar el permiso de consulta.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    if (!direccionId) return;
    let activo = true;
    setBuscando(true);setError('');setSeleccionado(null);setDetalle(null);
    void solicitudApi<RespuestaEventos>(`${ruta}/eventos?${parametros(direccionId,pagina,aplicados)}`)
      .then(r => { if (activo) { setEventos(r.eventos);setHaySiguiente(r.haySiguiente); } })
      .catch(e => { if (activo) { setEventos([]);setHaySiguiente(false);
        setError(e instanceof Error ? e.message : 'No se pudo consultar la bitácora.'); } })
      .finally(() => { if (activo) setBuscando(false); });
    return () => { activo = false; };
  }, [direccionId, pagina, aplicados, recarga]);

  useEffect(() => {
    if (!direccionId || !seleccionado) return;
    let activo = true;
    setDetalle(null);setErrorDetalle('');setCargandoDetalle(true);
    void solicitudApi<{ evento: Detalle }>(`${ruta}/eventos/${seleccionado}?direccionId=${encodeURIComponent(direccionId)}`)
      .then(r => { if (activo) setDetalle(r.evento); })
      .catch(e => { if (activo) setErrorDetalle(e instanceof Error ? e.message : 'No se pudo consultar el detalle.'); })
      .finally(() => { if (activo) setCargandoDetalle(false); });
    return () => { activo = false; };
  }, [direccionId, seleccionado]);

  function cambiarFiltro(campo: keyof Filtros, valor: string) {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  }
  function buscar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filtros.desde && filtros.hasta && filtros.hasta < filtros.desde) {
      setError('La fecha hasta debe ser igual o posterior a la fecha desde.');return;
    }
    setPagina(0);setAplicados({ ...filtros });setRecarga(n => n+1);
  }
  function limpiar() {
    setFiltros(filtrosVacios);setAplicados(filtrosVacios);setPagina(0);setRecarga(n=>n+1);
  }
  const ambito = direcciones.find(d => d.id === direccionId);

  return <div className="admin-pagina audit-pagina">
    <header className="admin-cabecera"><div className="admin-cabecera-interior">
      <a href="/" className="admin-identidad"><img src={logo} alt="Escudo de Ingeniería Informática UAGRM" />
        <span><small>UAGRM · FICCT</small><strong>Dirección de Ingeniería Informática</strong></span></a>
      <NavegacionInstitucional />
    </div></header>
    <main className="admin-contenedor">
      <div className="admin-introduccion"><p className="admin-sobre">Consulta institucional</p>
        <h1>Bitácora de auditoría</h1><p>Consultá evidencias de operaciones autorizadas. Este historial es de solo lectura.</p>
        {ambito && <div className="admin-ambito"><strong>{ambito.nombre}</strong><span>Dirección autorizada</span></div>}
      </div>
      {error && <div className="admin-mensaje admin-error" role="alert">{error}</div>}
      {cargando && <p role="status">Verificando acceso a la bitácora...</p>}
      {!cargando && !direcciones.length && <section className="admin-panel"><h2>Acceso restringido</h2>
        <p>Se requiere una sesión vigente con permiso específico de consulta de auditoría.</p>
        <a href="/login">Iniciar sesión</a>
      </section>}
      {!cargando && direcciones.length > 0 && <>
        <section className="admin-panel audit-filtros" aria-label="Filtros de auditoría">
          <h2>Buscar eventos</h2>
          <p className="admin-ayuda">Los resultados solo incluyen registros de la Dirección seleccionada. Los datos restringidos no se muestran.</p>
          <form onSubmit={buscar} className="audit-form">
            <label>Dirección
              <select value={direccionId} onChange={e => { setDireccionId(e.target.value);setPagina(0); }}>
                {direcciones.map(d => <option value={d.id} key={d.id}>{d.nombre}</option>)}
              </select>
            </label>
            <label>Desde <input type="date" value={filtros.desde} onChange={e => cambiarFiltro('desde',e.target.value)}/></label>
            <label>Hasta <input type="date" value={filtros.hasta} onChange={e => cambiarFiltro('hasta',e.target.value)}/></label>
            <label>Operación <input value={filtros.accion} maxLength={80} placeholder="Ej. ROL_ASIGNAR"
              onChange={e => cambiarFiltro('accion',e.target.value)}/></label>
            <label>Responsable <input value={filtros.actor} maxLength={80} placeholder="Nombre del responsable"
              onChange={e => cambiarFiltro('actor',e.target.value)}/></label>
            <label>Entidad <input value={filtros.entidad} maxLength={80} placeholder="Ej. ROL"
              onChange={e => cambiarFiltro('entidad',e.target.value)}/></label>
            <label>Resultado
              <select value={filtros.resultado} onChange={e=>cambiarFiltro('resultado',e.target.value)}>
                <option value="">Todos</option><option value="EXITO">Completada</option><option value="DENEGADO">Rechazada</option>
              </select>
            </label>
            <div className="audit-acciones"><button type="submit">Aplicar filtros</button>
              <button className="admin-boton-claro" type="button" onClick={limpiar}>Limpiar</button></div>
          </form>
        </section>
        <section className="admin-panel audit-resultados" aria-label="Resultados de auditoría">
          <div className="audit-titulo"><h2>Eventos registrados</h2><span>20 registros por página</span></div>
          {buscando && <p role="status">Consultando registros...</p>}
          {!buscando && !error && eventos.length === 0 && <p role="status" className="audit-vacio">No se encontraron eventos para los filtros seleccionados.</p>}
          {!buscando && eventos.length > 0 && <div className="admin-tabla-contenedor">
            <table className="admin-tabla audit-tabla"><thead><tr>
              <th>Fecha y hora</th><th>Operación</th><th>Responsable</th><th>Entidad</th><th>Resultado</th><th>Detalle</th>
            </tr></thead><tbody>{eventos.map(e => <tr key={e.id}>
              <td>{fechaVisible(e.fechaHora)}</td><td><strong>{e.accion}</strong></td><td>{e.actor}</td>
              <td>{e.entidad}{e.identificadorEntidad ? <small>Registro {e.identificadorEntidad}</small> : null}</td>
              <td><span className={e.resultado === 'EXITO' ? 'audit-estado-exito' : 'audit-estado-denegado'}>{e.resultado === 'EXITO' ? 'Completada' : 'Rechazada'}</span></td>
              <td><button type="button" className="admin-boton-claro" onClick={()=>setSeleccionado(e.id)} aria-label={`Ver detalle del evento ${e.id}`}>Ver detalle</button></td>
            </tr>)}</tbody></table>
          </div>}
          <div className="audit-paginacion">
            <span>Página {pagina+1}</span>
            <div><button type="button" className="admin-boton-claro" disabled={buscando || pagina===0} onClick={()=>setPagina(n=>n-1)}>Anterior</button>
              <button type="button" className="admin-boton-claro" disabled={buscando || !haySiguiente} onClick={()=>setPagina(n=>n+1)}>Siguiente</button></div>
          </div>
        </section>
        {seleccionado && <section className="admin-panel audit-detalle" aria-label="Detalle de evento">
          <div className="audit-titulo"><h2>Detalle de evento</h2><button className="admin-boton-claro" type="button" onClick={()=>setSeleccionado(null)}>Cerrar detalle</button></div>
          {cargandoDetalle && <p role="status">Consultando detalle autorizado...</p>}
          {errorDetalle && <p role="alert" className="admin-mensaje admin-error">{errorDetalle}</p>}
          {detalle && <>
            <dl className="audit-resumen"><div><dt>Fecha</dt><dd>{fechaVisible(detalle.fechaHora)}</dd></div>
              <div><dt>Operación</dt><dd>{detalle.accion}</dd></div><div><dt>Responsable</dt><dd>{detalle.actor}</dd></div>
              <div><dt>Entidad</dt><dd>{detalle.entidad}</dd></div><div><dt>Resultado</dt><dd>{detalle.resultado}</dd></div>
              <div><dt>Identificador de correlación</dt><dd className="audit-codigo">{detalle.identificadorCorrelacion}</dd></div></dl>
            <div className="audit-comparacion"><div><h3>Información anterior permitida</h3><pre>{valoresDetalle(detalle.datosAnteriores)}</pre></div>
              <div><h3>Información posterior permitida</h3><pre>{valoresDetalle(detalle.datosPosteriores)}</pre></div></div>
            <p className="admin-ayuda">Los campos protegidos, las credenciales y los datos no autorizados están excluidos de esta vista.</p>
          </>}
        </section>}
      </>}
    </main>
    <footer className="admin-footer">Dirección de Ingeniería Informática · UAGRM · Consulta institucional protegida</footer>
  </div>;
}
