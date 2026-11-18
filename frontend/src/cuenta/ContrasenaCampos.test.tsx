import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ContrasenaCampos, fortalezaContrasena } from './ContrasenaCampos';

afterEach(cleanup);

describe('Contraseña institucional', () => {
  it('clasifica la fortaleza correctamente', () => {
    expect(fortalezaContrasena('a').nivel).toBe('Baja');
    expect(fortalezaContrasena('Abcdefghijklmno').nivel).toBe('Media');
    expect(fortalezaContrasena('ClaveInstitucional_2026!').nivel).toBe('Alta');
    expect(fortalezaContrasena('LpM12345!').valida).toBe(false);
  });

  it('permite mostrar/ocultar contraseña y confirma coincidencia', () => {
    function Prueba() {
      const [clave, setClave] = useState('');
      const [confirmar, setConfirmar] = useState('');
      return <ContrasenaCampos clave={clave} confirmar={confirmar} setClave={setClave} setConfirmar={setConfirmar} />;
    }
    render(<Prueba />);
    const principal = screen.getByLabelText('Contraseña') as HTMLInputElement;
    const confirmacion = screen.getByLabelText('Confirmar contraseña') as HTMLInputElement;
    expect(principal.type).toBe('password');
    fireEvent.change(principal, { target: { value: 'ClaveInstitucional_2026!' } });
    fireEvent.change(confirmacion, { target: { value: 'ClaveInstitucional_2026!' } });
    expect(screen.getByText('Las contraseñas coinciden.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Mostrar contraseña$/ }));
    expect(principal.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: /^Ocultar contraseña$/ }));
    expect(principal.type).toBe('password');
  });
});
