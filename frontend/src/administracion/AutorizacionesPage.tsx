import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import logo from '../assets/logo-informatica.jpg';
import { solicitudApi } from '../cuenta/api';
import { NavegacionInstitucional } from '../navegacion/NavegacionInstitucional';
import './autorizaciones.css';

type Contexto = { direccion: { id: string; codigo: string; nombre: string }; permisos: string[] };
type Permiso = { id: string; codigo: string; modulo: string; operacion: string; descripcion: string };
type Rol = { id_rol: string; nombre: string; descripcion: string; es_sistema: boolean; version_control: number; estado: string; permisos: string[] };
type Usuario = { id: string; correo: string; nombres: string; apellidos: string; identificadorPersonal: string };
type Asignacion = { id: string; tipo: 'ROL' | 'PERMISO'; usuario_id: string; destinatario: string;
  referencia_id: string; referencia: string; fecha_inicio: string; fecha_fin: string | null; fecha_revocacion: string | null };
type Catalogo = { roles: Rol[]; permisos: Permiso[] };
type Asignaciones = { asignaciones: Asignacion[] };
const raiz = '/api/administracion';
const soloAdministrables = (permiso: Permiso) => permiso.codigo !== 'AUTORIZACIONES_ADMINISTRAR';

function fechaLegible(fecha: string | null) {
  return fecha ? new Date(fecha).toLocaleString('es-BO') : 'Sin vencimiento';
}
function finUTC(valor: string) { return valor ? new Date(valor).toISOString() : null; }
function vigente(a: Asignacion) {
  const ahora = Date.now();
  return !a.fecha_revocacion && new Date(a.fecha_inicio).getTime() <= ahora
    && (!a.fecha_fin || new Date(a.fecha_fin).getTime() > ahora);
}

export function AutorizacionesPage() {
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo>({ roles: [], permisos: [] });
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState('');
  const [rolElegido, setRolElegido] = useState('');
  const [permisoElegido, setPermisoElegido] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [nombreRol, setNombreRol] = useState('');
  const [descripcionRol, setDescripcionRol] = useState('');
  const [seleccionPermisos, setSeleccionPermisos] = useState<string[]>([]);
  const [rolEditado, setRolEditado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [vigenciaEditada, setVigenciaEditada] = useState<string | null>(null);
  const [finEditado, setFinEditado] = useState('');
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const recargar = useCallback(async () => {
    const [c, roles, a] = await Promise.all([
      solicitudApi<Contexto>(`${raiz}/contexto`),
      solicitudApi<Catalogo>(`${raiz}/catalogo`),
      solicitudApi<Asignaciones>(`${raiz}/asignaciones`),
    ]);
    setContexto(c);setCatalogo(roles);setAsignaciones(a.asignaciones);
  }, []);

  useEffect(() => {
    let activo = true;
    void Promise.all([
      solicitudApi<Contexto>(`${raiz}/contexto`),
      solicitudApi<Catalogo>(`${raiz}/catalogo`),
      solicitudApi<Asignaciones>(`${raiz}/asignaciones`),
    ]).then(([c, r, a]) => {
      if (!activo) return;
      setContexto(c);setCatalogo(r);setAsignaciones(a.asignaciones);
    }).catch(e => { if (activo) setError(e instanceof Error ? e.message : 'No se pudo acceder a la administración.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  async function ejecutar(accion: () => Promise<void>) {
    setError('');setExito('');setOcupado(true);
    try { await accion(); await recargar(); }
    catch(e) { setError(e instanceof Error ? e.message : 'No se completó la operación.'); }
    finally { setOcupado(false); }
  }
  const buscar = (event: FormEvent) => {
    event.preventDefault();
    if (busqueda.trim().length < 2) { setError('Escribí al menos dos caracteres para buscar una cuenta.');return; }
    void ejecutar(async () => {
      const r=await solicitudApi<{usuarios:Usuario[]}>(`${raiz}/usuarios?q=${encodeURIComponent(busqueda.trim())}`);
      setUsuarios(r.usuarios);
      setExito(`${r.usuarios.length} cuentas verificadas encontradas.`);
    });
  };

  function comenzarEdicionRol(rol: Rol) {
    if (rol.es_sistema) return;
    setRolEditado(rol.id_rol);setNombreRol(rol.nombre);setDescripcionRol(rol.descripcion);
    setSeleccionPermisos(rol.permisos);setError('');setExito('');
    document.getElementById('formulario-rol')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function limpiarRol() {
    setRolEditado('');setNombreRol('');setDescripcionRol('');setSeleccionPermisos([]);
  }
  function guardarRol(event: FormEvent) {
    event.preventDefault();
    const rol = catalogo.roles.find(x => x.id_rol === rolEditado);
    const resumen=seleccionPermisos.length ? seleccionPermisos.join(', ') : 'sin permisos';
    if (!window.confirm(`¿Confirmás ${rol ? 'la modificación' : 'la creación'} del rol «${nombreRol}» con: ${resumen}?`)) return;
    void ejecutar(async () => {
      const r=await solicitudApi<{mensaje:string}>(rol ? `${raiz}/roles/${rol.id_rol}` : `${raiz}/roles`,
        rol ? 'PUT' : 'POST', {nombre:nombreRol,descripcion:descripcionRol,
          permisos:seleccionPermisos,...(rol ? {versionControl:rol.version_control} : {})});
      setExito(r.mensaje);limpiarRol();
    });
  }

  function asignar(event: FormEvent, tipo: 'ROL' | 'PERMISO') {
    event.preventDefault();
    const usuario=usuarios.find(u=>u.id===seleccionado);
    if (!usuario) {setError('Seleccioná una cuenta verificada.');return;}
    const elegido=tipo==='ROL' ? catalogo.roles.find(r=>r.id_rol===rolElegido) :
      catalogo.permisos.find(p=>p.codigo===permisoElegido);
    if (!elegido) {setError('Seleccioná una autorización válida.');return;}
    const nombre=tipo==='ROL' ? (elegido as Rol).nombre : (elegido as Permiso).operacion;
    if (!window.confirm(`Vas a asignar «${nombre}» a ${usuario.nombres} ${usuario.apellidos} (${usuario.correo}), ${vencimiento ? `hasta ${fechaLegible(finUTC(vencimiento))}` : 'sin vencimiento'}. ¿Confirmás?`)) return;
    void ejecutar(async () => {
      const r=await solicitudApi<{mensaje:string}>(`${raiz}/asignaciones/${tipo==='ROL'?'roles':'permisos'}`,
        'POST',{usuarioId:usuario.id,...(tipo==='ROL'?{rolId:rolElegido}:{codigoPermiso:permisoElegido}),fechaFin:finUTC(vencimiento)});
      setExito(r.mensaje);setVencimiento('');
    });
  }
  function revocar(a:Asignacion) {
    if (motivo.trim().length<4) {setError('Indicá el motivo de revocación (mínimo cuatro caracteres).');return;}
    if (!window.confirm(`¿Confirmás revocar «${a.referencia}» de ${a.destinatario}? El acceso dejará de autorizar nuevas operaciones.`)) return;
    void ejecutar(async()=>{
      const r=await solicitudApi<{mensaje:string}>(`${raiz}/asignaciones/${a.tipo}/${a.id}/revocar`,'POST',{motivo:motivo.trim()});
      setExito(r.mensaje);setMotivo('');
    });
  }
  function actualizarVigencia(a:Asignacion) {
    if (!window.confirm(`¿Confirmás cambiar la vigencia de «${a.referencia}» para ${a.destinatario}?`)) return;
    void ejecutar(async()=>{
      const r=await solicitudApi<{mensaje:string}>(`${raiz}/asignaciones/${a.tipo}/${a.id}/vigencia`,
        'PATCH',{fechaFin:finUTC(finEditado)});
      setExito(r.mensaje);setVigenciaEditada(null);setFinEditado('');
    });
  }

  const esAutoridadProtegida = (a: Asignacion) => a.tipo === 'ROL' &&
    catalogo.roles.some(r => r.id_rol === a.referencia_id && r.es_sistema);
  const rolesAsignables=catalogo.roles.filter(r=>!r.es_sistema && r.estado==='ACTIVO');
  const permisosAsignables=catalogo.permisos.filter(soloAdministrables);
  return <div className="admin-pagina">
    <header className="admin-cabecera"><div className="admin-cabecera-interior">
      <a href="/" className="admin-identidad"><img src={logo} alt="Escudo de Ingeniería Informática UAGRM" />
        <span><small>UAGRM · FICCT</small><strong>Dirección de Ingeniería Informática</strong></span></a>
      <NavegacionInstitucional />
    </div></header>
    <main className="admin-contenedor">
      <div className="admin-introduccion"><p className="admin-sobre">Administración institucional</p>
        <h1>Roles y permisos</h1><p>Configurá autorizaciones para las cuentas verificadas de tu Dirección.</p>
        {contexto && <div className="admin-ambito"><strong>{contexto.direccion.nombre}</strong><span>Ámbito institucional autorizado</span></div>}
      </div>
      {error && <div className="admin-mensaje admin-error" role="alert">{error}</div>}
      {exito && <div className="admin-mensaje admin-exito" role="status">{exito}</div>}
      {cargando && <p role="status">Comprobando permisos institucionales...</p>}
      {!cargando && !contexto && <section className="admin-panel"><h2>Acceso restringido</h2>
        <p>Esta sección requiere una sesión y autoridad de Dirección vigentes. Ingresá con la cuenta autorizada.</p>
        <a href="/login">Ir al inicio de sesión</a></section>}
      {contexto && <div className="admin-paneles">
        <section id="formulario-rol" className="admin-panel"><h2>{rolEditado?'Modificar rol':'Crear rol institucional'}</h2>
          <p className="admin-ayuda">Crear un rol no concede permisos automáticamente. Los roles del sistema no se editan desde aquí.</p>
          <form onSubmit={guardarRol} className="admin-form">
            <label>Nombre del rol<input required maxLength={100} value={nombreRol} onChange={e=>setNombreRol(e.target.value)}/></label>
            <label>Descripción<textarea maxLength={500} rows={2} value={descripcionRol} onChange={e=>setDescripcionRol(e.target.value)}/></label>
            <fieldset><legend>Permisos del rol</legend>
              <div className="admin-permisos">{permisosAsignables.map(p=><label key={p.id}>
                <input type="checkbox" checked={seleccionPermisos.includes(p.codigo)} onChange={e=>setSeleccionPermisos(v=>e.target.checked?[...v,p.codigo]:v.filter(x=>x!==p.codigo))}/>
                <span><strong>{p.operacion}</strong><small>{p.modulo} · {p.descripcion}</small></span></label>)}</div>
            </fieldset>
            <div className="admin-acciones"><button disabled={ocupado} type="submit">{rolEditado?'Guardar modificación':'Crear rol'}</button>
              {rolEditado && <button className="admin-boton-claro" type="button" onClick={limpiarRol}>Cancelar edición</button>}</div>
          </form>
          <h3>Roles de la Dirección</h3>
          <div className="admin-roles">{catalogo.roles.map(r=><div key={r.id_rol} className="admin-rol">
            <div><strong>{r.nombre}</strong>{r.es_sistema && <small className="admin-etiqueta">Autoridad protegida</small>}
              <p>{r.permisos.length} permisos · {r.descripcion || 'Sin descripción'}</p></div>
            {!r.es_sistema && <button type="button" className="admin-boton-claro" onClick={()=>comenzarEdicionRol(r)}>Editar</button>}
          </div>)}</div>
        </section>
        <section className="admin-panel"><h2>Asignar a cuentas verificadas</h2>
          <form className="admin-form" onSubmit={buscar}>
            <label>Buscar por nombre, correo o identificador
              <input value={busqueda} maxLength={70} onChange={e=>setBusqueda(e.target.value)} placeholder="Escribí al menos 2 caracteres" /></label>
            <button type="submit" disabled={ocupado}>Buscar cuentas</button>
          </form>
          <label className="admin-select">Cuenta destinataria
            <select value={seleccionado} onChange={e=>setSeleccionado(e.target.value)}>
              <option value="">Seleccionar cuenta verificada</option>
              {usuarios.map(u=><option key={u.id} value={u.id}>{u.nombres} {u.apellidos} — {u.correo}</option>)}
            </select></label>
          <label className="admin-select">Fecha y hora de vencimiento (opcional)
            <input type="datetime-local" value={vencimiento} onChange={e=>setVencimiento(e.target.value)}/></label>
          <form className="admin-form" onSubmit={e=>asignar(e,'ROL')}>
            <label>Rol a asignar<select required value={rolElegido} onChange={e=>setRolElegido(e.target.value)}>
              <option value="">Seleccionar rol</option>{rolesAsignables.map(r=><option value={r.id_rol} key={r.id_rol}>{r.nombre}</option>)}
            </select></label>
            <button type="submit" disabled={ocupado||!seleccionado||!rolElegido}>Asignar rol directamente</button>
          </form>
          <form className="admin-form" onSubmit={e=>asignar(e,'PERMISO')}>
            <label>Permiso individual<select required value={permisoElegido} onChange={e=>setPermisoElegido(e.target.value)}>
              <option value="">Seleccionar permiso</option>{permisosAsignables.map(p=><option value={p.codigo} key={p.id}>{p.operacion} ({p.modulo})</option>)}
            </select></label>
            <button type="submit" disabled={ocupado||!seleccionado||!permisoElegido}>Asignar permiso directamente</button>
          </form>
          <p className="admin-ayuda">No se envían invitaciones. Las autorizaciones válidas se aplican al confirmarlas; la autoridad de Dirección no se transfiere aquí.</p>
        </section>
        <section className="admin-panel admin-panel-ancho"><h2>Autorizaciones registradas</h2>
          <p className="admin-ayuda">Las autorizaciones vencidas o revocadas no permiten nuevas operaciones, aunque exista una sesión abierta.</p>
          <label className="admin-select">Motivo para revocaciones
            <input value={motivo} maxLength={300} onChange={e=>setMotivo(e.target.value)} placeholder="Motivo institucional de revocación"/></label>
          <div className="admin-tabla-contenedor"><table className="admin-tabla"><thead><tr>
            <th>Cuenta</th><th>Autorización</th><th>Vigencia</th><th>Estado</th><th>Acciones</th>
          </tr></thead><tbody>{asignaciones.map(a=><tr key={`${a.tipo}-${a.id}`}>
            <td>{a.destinatario}</td><td><strong>{a.referencia}</strong><small>{a.tipo==='ROL'?'Rol':'Permiso directo'}</small></td>
            <td>{fechaLegible(a.fecha_fin)}</td><td>{a.fecha_revocacion?'Revocada':vigente(a)?'Vigente':'Vencida'}</td>
            <td>{esAutoridadProtegida(a) ?
              <span className="admin-accion-protegida">Autoridad protegida: gestión exclusiva mediante transferencia institucional.</span>
              : vigente(a) && <div className="admin-acciones-fila">
              <button type="button" className="admin-boton-claro" disabled={ocupado} onClick={()=>{setVigenciaEditada(`${a.tipo}-${a.id}`);setFinEditado('');}}>Cambiar vigencia</button>
              <button type="button" className="admin-boton-peligro" disabled={ocupado} onClick={()=>revocar(a)}>Revocar</button>
              {vigenciaEditada===`${a.tipo}-${a.id}` && <div className="admin-editar-vigencia">
                <label>Nueva fecha final (vacío = sin vencimiento)<input type="datetime-local" value={finEditado} onChange={e=>setFinEditado(e.target.value)}/></label>
                <button type="button" disabled={ocupado} onClick={()=>actualizarVigencia(a)}>Guardar vigencia</button>
                <button type="button" className="admin-boton-claro" onClick={()=>setVigenciaEditada(null)}>Cancelar</button>
              </div>}</div>}</td>
          </tr>)}</tbody></table></div>
          {!asignaciones.length && <p className="admin-ayuda">Todavía no existen asignaciones registradas.</p>}
        </section>
      </div>}
    </main>
    <footer className="admin-footer">Ingeniería Informática · UAGRM · Dirección de Carrera</footer>
  </div>;
}
