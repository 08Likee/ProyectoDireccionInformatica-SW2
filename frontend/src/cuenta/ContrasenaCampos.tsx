import { useState } from 'react';

export function fortalezaContrasena(clave: string): { nivel: 'Baja' | 'Media' | 'Alta'; valida: boolean; cantidad: number } {
  const reglas = [clave.length >= 15 && clave.length <= 128, /[A-Z]/.test(clave), /[a-z]/.test(clave), /\d/.test(clave), /[^A-Za-z0-9\s]/.test(clave)];
  const cantidad = reglas.filter(Boolean).length;
  return { nivel: cantidad === 5 ? 'Alta' : cantidad >= 3 ? 'Media' : 'Baja', valida: cantidad === 5, cantidad };
}

export function ContrasenaCampos({
  clave, confirmar, setClave, setConfirmar, nombre = 'Contraseña',
}: {
  clave: string;
  confirmar: string;
  setClave: (v: string) => void;
  setConfirmar: (v: string) => void;
  nombre?: string;
}) {
  const [mostrar, setMostrar] = useState(false);
  const fortaleza = fortalezaContrasena(clave);
  const color = fortaleza.nivel === 'Alta' ? 'verde' : fortaleza.nivel === 'Media' ? 'naranja' : 'rojo';
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="clave-principal" className="cuenta-label">{nombre}</label>
        <div className="cuenta-clave-control">
          <input id="clave-principal" name="contrasena" className="cuenta-input" type={mostrar ? 'text' : 'password'}
            autoComplete="new-password" minLength={15} maxLength={128} required value={clave}
            onChange={e => setClave(e.target.value)} />
          <button type="button" className="cuenta-mostrar" aria-label={mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setMostrar(x => !x)}>
            {mostrar ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </div>
      <div aria-live="polite" className="cuenta-fortaleza">
        <div className="cuenta-marcadores" aria-hidden="true">
          {[1, 2, 3].map(i => <span key={i} className={clave && i <= (fortaleza.nivel === 'Alta' ? 3 : fortaleza.nivel === 'Media' ? 2 : 1) ? `cuenta-barra-seguridad ${color}` : 'cuenta-barra-seguridad'} />)}
        </div>
        <p>Seguridad de la contraseña: <strong className={`cuenta-nivel ${color}`}>{clave ? fortaleza.nivel : 'Sin evaluar'}</strong></p>
        <p className="cuenta-ayuda">Mínimo 15 caracteres, con mayúsculas, minúsculas, números y símbolos.</p>
      </div>
      <div>
        <label htmlFor="clave-confirmacion" className="cuenta-label">Confirmar contraseña</label>
        <input id="clave-confirmacion" name="confirmarContrasena" className="cuenta-input" type={mostrar ? 'text' : 'password'}
          autoComplete="new-password" minLength={15} maxLength={128} required value={confirmar}
          onChange={e => setConfirmar(e.target.value)} />
        {confirmar && <p className={`cuenta-ayuda ${clave === confirmar ? 'cuenta-valida' : 'cuenta-invalida'}`} role="status">
          {clave === confirmar ? 'Las contraseñas coinciden.' : 'Las contraseñas no coinciden.'}
        </p>}
      </div>
    </div>
  );
}
