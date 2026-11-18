import { useEffect, useState } from 'react';
import { cuentaApi, type Perfil } from '../cuenta/api';
import './navegacion.css';

/** La navegación orienta al usuario; el backend sigue autorizando cada operación. */
export function EnlaceAdministracion({ className }: { className?: string }) {
  const [autorizado, setAutorizado] = useState(false);

  useEffect(() => {
    let activo = true;
    void cuentaApi<{ perfil: Perfil }>('sesion')
      .then(({ perfil }) => {
        if (activo) {
          setAutorizado(Array.isArray(perfil?.permisosInstitucionales)
            && perfil.permisosInstitucionales.includes('AUTORIZACIONES_ADMINISTRAR'));
        }
      })
      .catch(() => { if (activo) setAutorizado(false); });
    return () => { activo = false; };
  }, []);

  if (!autorizado) return null;
  return <a href="/administracion/autorizaciones" className={className}
    aria-current={window.location.pathname === '/administracion/autorizaciones' ? 'page' : undefined}>
    Administración
  </a>;
}

/** Menú compartido de las páginas privadas, sin enlaces a módulos aún no implementados. */
export function NavegacionInstitucional() {
  return <nav className="navegacion-institucional" aria-label="Navegación institucional">
    <a href="/">Inicio</a>
    <EnlaceAdministracion />
    <a href="/perfil" aria-current={window.location.pathname === '/perfil' ? 'page' : undefined}>Mi cuenta</a>
  </nav>;
}
