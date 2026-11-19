type Propiedades = {
  error: string;
  exito: string;
  cerrar: () => void;
};

/** Respuesta visible incluso cuando la acción está lejos del encabezado. */
export function AvisoOperacion({error, exito, cerrar}: Propiedades) {
  const texto = error || exito;
  if (!texto) return null;
  return <div role={error ? 'alert' : 'status'} aria-atomic="true"
    className={`admin-mensaje ${error ? 'admin-error' : 'admin-exito'} admin-aviso-fijo`}>
    <span>{texto}</span>
    <button type="button" onClick={cerrar} aria-label="Cerrar notificación">Cerrar</button>
  </div>;
}
