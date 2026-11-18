import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NavegacionInstitucional } from './NavegacionInstitucional';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Navegación institucional por permisos vigentes', () => {
  it('muestra Administración a un usuario con autorización', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ perfil: { permisosInstitucionales: ['AUTORIZACIONES_ADMINISTRAR'] } }),
    }));
    render(<NavegacionInstitucional />);
    const nav = screen.getByRole('navigation', { name: 'Navegación institucional' });
    expect(nav).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Inicio' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Mi cuenta' }).getAttribute('href')).toBe('/perfil');
    expect((await screen.findByRole('link', { name: 'Administración' })).getAttribute('href'))
      .toBe('/administracion/autorizaciones');
  });

  it('oculta Administración cuando la sesión no tiene permisos o no existe', async () => {
    const solicitud = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ perfil: { permisosInstitucionales: [] } }),
    });
    vi.stubGlobal('fetch', solicitud);
    render(<NavegacionInstitucional />);
    await waitFor(() => expect(solicitud).toHaveBeenCalledWith('/api/cuenta/sesion',
      expect.objectContaining({ credentials: 'same-origin' })));
    expect(screen.queryByRole('link', { name: 'Administración' })).toBeNull();
  });
});
