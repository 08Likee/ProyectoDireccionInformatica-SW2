export interface Perfil {
  id: string;
  identificadorPersonal: string;
  nombres: string;
  apellidos: string;
  correo: string;
  verificado: boolean;
  permisosInstitucionales: string[];
}

/** Solicitudes al mismo origen, con token CSRF actualizado antes de cada mutación. */
export async function solicitudApi<T>(ruta: string, metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' = 'GET', datos?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (metodo !== 'GET') {
    const csrf = await fetch('/api/cuenta/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!csrf.ok) throw new Error('No se pudo iniciar una solicitud segura. Actualiza la página.');
    const valor = (await csrf.json()) as { csrfToken: string };
    headers['x-csrf-token'] = valor.csrfToken;
    headers['content-type'] = 'application/json';
  }
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(datos !== undefined ? { body: JSON.stringify(datos) } : {}),
  });
  const cuerpo = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!respuesta.ok) {
    const mensaje = Array.isArray(cuerpo.message) ? cuerpo.message.join('. ') : cuerpo.message;
    throw new Error(typeof mensaje === 'string' ? mensaje : 'No se pudo completar la operación.');
  }
  return cuerpo as T;
}

export function cuentaApi<T>(ruta: string, metodo: 'GET' | 'POST' | 'PUT' = 'GET', datos?: unknown): Promise<T> {
  return solicitudApi<T>(`/api/cuenta/${ruta}`, metodo, datos);
}
