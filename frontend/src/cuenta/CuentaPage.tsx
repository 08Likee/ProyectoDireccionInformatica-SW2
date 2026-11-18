import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import logo from '../assets/logo-informatica.jpg';
import fotoModulo from '../assets/modulo-236.webp';
import { cuentaApi, Perfil } from './api';
import { ContrasenaCampos, fortalezaContrasena } from './ContrasenaCampos';
import { NavegacionInstitucional } from '../navegacion/NavegacionInstitucional';
import './cuenta.css';

type Resultado = { mensaje: string; correo?: string };
const parametros = new URLSearchParams(window.location.search);
const rutaActual = window.location.pathname;
const tokenEnlace = new URLSearchParams(window.location.hash.slice(1)).get('token');

function Mensaje({ error, exito }: { error: string; exito: string }) {
  return <>
    {error && <div role="alert" className="cuenta-alerta-error">{error}</div>}
    {exito && <div role="status" className="cuenta-alerta-ok">{exito}</div>}
  </>;
}

function Caja({ titulo, detalle, children }: { titulo: string; detalle: string; children: ReactNode }) {
  return <section className="cuenta-formulario">
    <p className="cuenta-sobre">Acceso institucional</p>
    <h2>{titulo}</h2>
    <p className="cuenta-descripcion">{detalle}</p>
    {children}
  </section>;
}

function useOperacion() {
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ejecutar = async (accion: () => Promise<void>) => {
    setError(''); setExito(''); setOcupado(true);
    try { await accion(); } catch (e) { setError(e instanceof Error ? e.message : 'Ocurrió un error inesperado.'); }
    finally { setOcupado(false); }
  };
  return { error, exito, setError, setExito, ocupado, ejecutar };
}

function Registro() {
  const [identificadorPersonal, setIdentificador] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmarContrasena, setConfirmar] = useState('');
  const op = useOperacion();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!fortalezaContrasena(contrasena).valida || contrasena !== confirmarContrasena) {
      op.setError('Revisa la seguridad y la confirmación de tu contraseña.'); return;
    }
    void op.ejecutar(async () => {
      await cuentaApi<Resultado>('registro', 'POST', {
        identificadorPersonal, nombres, apellidos, correo, contrasena, confirmarContrasena,
      });
      window.location.assign(`/login?registro=1&correo=${encodeURIComponent(correo.trim().toLowerCase())}`);
    });
  };
  return <Caja titulo="Crear cuenta" detalle="Registra tus datos personales para acceder a los servicios disponibles para tu cuenta.">
    <Mensaje error={op.error} exito={op.exito} />
    <form className="cuenta-campos" onSubmit={enviar}>
      <label className="cuenta-label">Identificador personal
        <input className="cuenta-input" value={identificadorPersonal} onChange={e => setIdentificador(e.target.value)}
          maxLength={20} autoComplete="off" required />
      </label>
      <label className="cuenta-label">Correo electrónico
        <input className="cuenta-input" type="email" value={correo} onChange={e => setCorreo(e.target.value)}
          maxLength={150} autoComplete="email" required />
      </label>
      <div className="cuenta-dos-campos">
        <label className="cuenta-label">Nombres
          <input className="cuenta-input" value={nombres} onChange={e => setNombres(e.target.value)} maxLength={100} required autoComplete="given-name" />
        </label>
        <label className="cuenta-label">Apellidos
          <input className="cuenta-input" value={apellidos} onChange={e => setApellidos(e.target.value)} maxLength={100} required autoComplete="family-name" />
        </label>
      </div>
      <ContrasenaCampos clave={contrasena} confirmar={confirmarContrasena} setClave={setContrasena} setConfirmar={setConfirmar} />
      <button className="cuenta-primario" type="submit" disabled={op.ocupado}>{op.ocupado ? 'Registrando...' : 'Crear cuenta'}</button>
    </form>
    <p className="cuenta-pie">¿Ya tenés cuenta? <a href="/login">Iniciar sesión</a></p>
  </Caja>;
}

function Login() {
  const [correo, setCorreo] = useState(parametros.get('correo') ?? '');
  const [contrasena, setContrasena] = useState('');
  const [visible, setVisible] = useState(false);
  const op = useOperacion();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void op.ejecutar(async () => {
      await cuentaApi<{ perfil: Perfil }>('login', 'POST', { correo, contrasena });
      window.location.assign('/perfil');
    });
  };
  return <Caja titulo="Iniciar sesión" detalle="Accedé a tu cuenta con las credenciales que registraste.">
    {parametros.get('registro') === '1' && <div role="status" className="cuenta-alerta-ok">
      Tu cuenta fue registrada. Verificá el correo recibido antes de iniciar sesión. Tu correo ya está escrito en el formulario.
    </div>}
    <Mensaje error={op.error} exito={op.exito} />
    <form className="cuenta-campos" onSubmit={enviar}>
      <label className="cuenta-label">Correo electrónico
        <input className="cuenta-input" type="email" autoComplete="username" required maxLength={150} value={correo} onChange={e => setCorreo(e.target.value)} />
      </label>
      <div>
        <label className="cuenta-label" htmlFor="clave-login">Contraseña</label>
        <div className="cuenta-clave-control">
          <input id="clave-login" className="cuenta-input" type={visible ? 'text' : 'password'} autoComplete="current-password"
            required value={contrasena} onChange={e => setContrasena(e.target.value)} />
          <button className="cuenta-mostrar" type="button" onClick={() => setVisible(x => !x)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            {visible ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </div>
      <button className="cuenta-primario" type="submit" disabled={op.ocupado}>{op.ocupado ? 'Ingresando...' : 'Iniciar sesión'}</button>
    </form>
    <div className="cuenta-enlaces"><a href="/registro">Crear cuenta</a><a href="/recuperar">Olvidé mi contraseña</a><a href="/reenviar">Reenviar verificación</a></div>
  </Caja>;
}

function Verificar() {
  const op = useOperacion();
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    if (!tokenEnlace) { op.setError('El enlace no contiene un comprobante de verificación.'); return; }
    window.history.replaceState(null, '', '/verificar');
    void op.ejecutar(async () => {
      const r = await cuentaApi<Resultado>('verificar', 'POST', { token: tokenEnlace });
      op.setExito(r.mensaje);
    });
    // La verificación de un solo uso se inicia una sola vez, incluso con React StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Caja titulo="Verificar correo" detalle="Estamos comprobando el enlace asociado a tu cuenta.">
    <Mensaje error={op.error} exito={op.exito} />
    {op.ocupado && <p>Verificando cuenta...</p>}
    <p className="cuenta-pie"><a href="/login">Ir al inicio de sesión</a></p>
  </Caja>;
}

function Reenviar() {
  const [correo, setCorreo] = useState(parametros.get('correo') ?? '');
  const op = useOperacion();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void op.ejecutar(async () => {
      const r = await cuentaApi<Resultado>('verificacion/reenviar', 'POST', { correo });
      op.setExito(r.mensaje);
    });
  };
  return <Caja titulo="Reenviar verificación" detalle="Si tu cuenta está pendiente, enviaremos un nuevo enlace al correo registrado.">
    <Mensaje error={op.error} exito={op.exito} />
    <form className="cuenta-campos" onSubmit={enviar}>
      <label className="cuenta-label">Correo electrónico
        <input className="cuenta-input" type="email" required value={correo} onChange={e => setCorreo(e.target.value)} autoComplete="email" />
      </label>
      <button className="cuenta-primario" disabled={op.ocupado}>Enviar enlace</button>
    </form>
    <p className="cuenta-pie"><a href="/login">Volver al inicio de sesión</a></p>
  </Caja>;
}

function Recuperar() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const op = useOperacion();
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void op.ejecutar(async () => {
      const datos = tokenEnlace
        ? { token: tokenEnlace, nuevaContrasena: clave, confirmarContrasena: confirmar }
        : { correo };
      const r = await cuentaApi<Resultado>(tokenEnlace ? 'recuperacion/confirmar' : 'recuperacion/solicitar', 'POST', datos);
      if (tokenEnlace) window.history.replaceState(null, '', '/recuperar');
      op.setExito(r.mensaje);
    });
  };
  return <Caja titulo={tokenEnlace ? 'Establecer nueva contraseña' : 'Recuperar acceso'}
    detalle={tokenEnlace ? 'Elegí una nueva contraseña segura para tu cuenta.' : 'Si tu correo está registrado, recibirás un enlace para recuperar tu contraseña.'}>
    <Mensaje error={op.error} exito={op.exito} />
    <form className="cuenta-campos" onSubmit={enviar}>
      {tokenEnlace ? <ContrasenaCampos clave={clave} confirmar={confirmar} setClave={setClave} setConfirmar={setConfirmar} nombre="Nueva contraseña" />
        : <label className="cuenta-label">Correo electrónico
          <input className="cuenta-input" type="email" autoComplete="email" required value={correo} onChange={e => setCorreo(e.target.value)} />
        </label>}
      <button className="cuenta-primario" disabled={op.ocupado || Boolean(tokenEnlace && (!fortalezaContrasena(clave).valida || clave !== confirmar))}>
        {op.ocupado ? 'Procesando...' : tokenEnlace ? 'Guardar contraseña' : 'Enviar recuperación'}
      </button>
    </form>
    <p className="cuenta-pie"><a href="/login">Volver al inicio de sesión</a></p>
  </Caja>;
}

function PerfilCuenta() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [actual, setActual] = useState('');
  const [clave, setClave] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const op = useOperacion();
  useEffect(() => {
    let activo = true;
    void cuentaApi<{ perfil: Perfil }>('sesion').then(r => {
      if (!activo) return;
      setPerfil(r.perfil);
      setNombres(r.perfil.nombres);
      setApellidos(r.perfil.apellidos);
    }).catch(() => { if (activo) window.location.assign('/login'); });
    return () => { activo = false; };
  }, []);
  const guardar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void op.ejecutar(async () => {
      const r = await cuentaApi<{ perfil: Perfil }>('perfil', 'PUT', { nombres, apellidos });
      setPerfil(r.perfil);
      op.setExito('Los datos de tu perfil se guardaron correctamente.');
    });
  };
  const cambiar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void op.ejecutar(async () => {
      const r = await cuentaApi<Resultado>('contrasena', 'PUT', { contrasenaActual: actual, nuevaContrasena: clave, confirmarContrasena: confirmar });
      op.setExito(r.mensaje);
      window.location.assign('/login');
    });
  };
  const cerrar = () => void op.ejecutar(async () => {
    await cuentaApi('logout', 'POST', {});
    window.location.assign('/login');
  });
  return <Caja titulo="Mi cuenta institucional" detalle="Administrá tus datos personales y la seguridad de tu acceso.">
    {perfil ? <>
      <Mensaje error={op.error} exito={op.exito} />
      <div className="cuenta-resumen"><strong>{perfil.nombres} {perfil.apellidos}</strong><p>{perfil.correo}</p>
        <small>Cuenta verificada. El registro no concede permisos institucionales.</small></div>
      <form className="cuenta-campos" onSubmit={guardar}>
        <h3>Datos personales</h3>
        <label className="cuenta-label">Identificador personal<input className="cuenta-input" readOnly value={perfil.identificadorPersonal} /></label>
        <label className="cuenta-label">Nombres<input className="cuenta-input" required maxLength={100} value={nombres} onChange={e => setNombres(e.target.value)} /></label>
        <label className="cuenta-label">Apellidos<input className="cuenta-input" required maxLength={100} value={apellidos} onChange={e => setApellidos(e.target.value)} /></label>
        <button className="cuenta-primario" disabled={op.ocupado}>Guardar cambios</button>
      </form>
      <div className="cuenta-separador" />
      <form className="cuenta-campos" onSubmit={cambiar}>
        <h3>Cambiar contraseña</h3>
        <label className="cuenta-label">Contraseña actual
          <span className="cuenta-clave-control"><input className="cuenta-input" type={mostrar ? 'text' : 'password'} autoComplete="current-password" required value={actual} onChange={e => setActual(e.target.value)} />
            <button type="button" className="cuenta-mostrar" onClick={() => setMostrar(!mostrar)} aria-label={mostrar ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}>{mostrar ? 'Ocultar' : 'Mostrar'}</button>
          </span>
        </label>
        <ContrasenaCampos clave={clave} confirmar={confirmar} setClave={setClave} setConfirmar={setConfirmar} nombre="Nueva contraseña" />
        <button className="cuenta-primario" disabled={op.ocupado || !fortalezaContrasena(clave).valida || clave !== confirmar}>Cambiar contraseña</button>
      </form>
      <button type="button" className="cuenta-secundario" disabled={op.ocupado} onClick={cerrar}>Cerrar sesión</button>
    </> : <p>Consultando tu sesión...</p>}
  </Caja>;
}

export function CuentaPage() {
  let pagina: ReactNode;
  if (rutaActual === '/registro') pagina = <Registro />;
  else if (rutaActual === '/verificar') pagina = <Verificar />;
  else if (rutaActual === '/reenviar') pagina = <Reenviar />;
  else if (rutaActual === '/recuperar') pagina = <Recuperar />;
  else if (rutaActual === '/perfil') pagina = <PerfilCuenta />;
  else pagina = <Login />;
  return <div className="cuenta-pagina">
    <header className="cuenta-cabecera">
      <div className="cuenta-cabecera-interior">
        <a href="/" className="cuenta-identidad" aria-label="Dirección de Ingeniería Informática — volver al inicio">
          <img src={logo} alt="Escudo de Ingeniería Informática UAGRM" />
          <span><small>UAGRM · FICCT</small><strong>Dirección de Ingeniería Informática</strong></span>
        </a>
        {rutaActual === '/perfil' ? <NavegacionInstitucional />
          : <a href="/" className="cuenta-volver">Volver al inicio</a>}
      </div>
    </header>
    <main className="cuenta-contenedor">
      <aside className="cuenta-institucional">
        <div className="cuenta-decoracion" aria-hidden="true" />
        <p className="cuenta-sobre-clara">Portal institucional</p>
        <h1>Tu cuenta, un acceso seguro a la Dirección de Carrera.</h1>
        <p>Gestioná tus datos personales y accedé a los servicios autorizados desde un espacio diseñado para nuestra comunidad universitaria.</p>
        <figure className="cuenta-foto">
          <img src={fotoModulo} alt="Edificio del Módulo 236 de la facultad" loading="lazy" decoding="async" />
          <figcaption><span>Nuestra facultad</span><strong>Módulo 236 · FICCT</strong></figcaption>
        </figure>
        <div className="cuenta-aviso">El registro de una cuenta no concede permisos administrativos automáticamente.</div>
      </aside>
      {pagina}
    </main>
    <footer className="cuenta-footer">Ingeniería Informática · UAGRM · Dirección de Carrera</footer>
  </div>;
}
