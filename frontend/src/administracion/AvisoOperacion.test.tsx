import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AvisoOperacion } from './AvisoOperacion';

afterEach(cleanup);

describe('Confirmaciones de operaciones institucionales',()=>{
  it('muestra el resultado de una modificación y permite cerrar la notificación',()=>{
    const cerrar=vi.fn();
    render(<AvisoOperacion error="" exito="Metadatos actualizados." cerrar={cerrar}/>);
    const aviso=screen.getByRole('status');
    expect(aviso.textContent).toContain('Metadatos actualizados.');
    expect(aviso.className).toContain('admin-aviso-fijo');
    fireEvent.click(screen.getByRole('button',{name:'Cerrar notificación'}));
    expect(cerrar).toHaveBeenCalledOnce();
  });
  it('identifica errores sin mostrar simultáneamente un éxito anterior',()=>{
    render(<AvisoOperacion error="No fue posible revocar el permiso." exito="Acción anterior completada." cerrar={()=>{}}/>);
    const aviso=screen.getByRole('alert');
    expect(aviso.textContent).toContain('No fue posible revocar el permiso.');
    expect(aviso.textContent).not.toContain('Acción anterior completada.');
  });
});
