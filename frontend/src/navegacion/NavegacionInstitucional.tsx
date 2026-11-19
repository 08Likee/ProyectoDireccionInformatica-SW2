import { useEffect, useState } from 'react';
import { cuentaApi, type Perfil } from '../cuenta/api';
import './navegacion.css';

/** La navegación orienta al usuario; el backend sigue autorizando cada operación. */
function EnlacePermiso({ className, permiso, url, etiqueta }: { className?: string; permiso: string; url: string; etiqueta: string }) {
  const [autorizado, setAutorizado] = useState(false);

  useEffect(() => {
    let activo = true;
    void cuentaApi<{ perfil: Perfil }>('sesion')
      .then(({ perfil }) => {
        if (activo) {
          setAutorizado(Array.isArray(perfil?.permisosInstitucionales)
            && perfil.permisosInstitucionales.includes(permiso));
        }
      })
      .catch(() => { if (activo) setAutorizado(false); });
    return () => { activo = false; };
  }, [permiso]);

  if (!autorizado) return null;
  return <a href={url} className={className}
    aria-current={window.location.pathname === url ? 'page' : undefined}>{etiqueta}</a>;
}

export function EnlaceAdministracion({ className }: { className?: string }) {
  return <EnlacePermiso className={className} permiso="AUTORIZACIONES_ADMINISTRAR"
    url="/administracion/autorizaciones" etiqueta="Administración" />;
}

export function EnlaceAuditoria({ className }: { className?: string }) {
  return <EnlacePermiso className={className} permiso="AUDITORIA_CONSULTAR"
    url="/administracion/auditoria" etiqueta="Auditoría" />;
}

/** Menú compartido de las páginas privadas, sin enlaces a módulos aún no implementados. */
/** Una sola opción si tiene consulta; si solo posee gestión también debe ver el módulo. */
export function EnlaceModuloDocumentos({ className }: { className?: string } = {}) {
  const [permisos, setPermisos] = useState<string[]>([]);
  useEffect(() => {let vivo=true;
    void cuentaApi<{perfil:Perfil}>('sesion').then(r=>{
      if(vivo)setPermisos(r.perfil.permisosInstitucionales??[]);
    }).catch(()=>{if(vivo)setPermisos([]);});
    return()=>{vivo=false;};
  },[]);
  if (!permisos.includes('DOCUMENTOS_CONSULTAR') && !permisos.includes('DOCUMENTOS_GESTIONAR')) return null;
  return <a className={className} href="/documentos" aria-current={window.location.pathname==='/documentos'?'page':undefined}>Documentos</a>;
}

export function EnlaceModuloExpedientes({className}:{className?:string}={}) {
  const [permisos,setPermisos]=useState<string[]>([]);
  useEffect(()=>{let vivo=true;void cuentaApi<{perfil:Perfil}>('sesion').then(r=>{if(vivo)setPermisos(r.perfil?.permisosInstitucionales??[]);}).catch(()=>{if(vivo)setPermisos([]);});return()=>{vivo=false;};},[]);
  if(!permisos.some(p=>['EXPEDIENTES_CONSULTAR','EXPEDIENTES_GESTIONAR','PERIODOS_GESTIONAR'].includes(p)))return null;
  return <a className={className} href="/expedientes" aria-current={window.location.pathname==='/expedientes'?'page':undefined}>Expedientes</a>;
}

export function NavegacionInstitucional() {
  return <nav className="navegacion-institucional" aria-label="Navegación institucional">
    <a href="/">Inicio</a>
    <EnlaceAdministracion />
    <EnlaceAuditoria />
    <EnlaceModuloDocumentos />
    <EnlaceModuloExpedientes />
    <a href="/perfil" aria-current={window.location.pathname === '/perfil' ? 'page' : undefined}>Mi cuenta</a>
  </nav>;
}
