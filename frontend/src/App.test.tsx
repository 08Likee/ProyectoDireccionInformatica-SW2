import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Landing institucional', () => {
  it('muestra identidad institucional y disponibilidad real', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'UP' }) }));

    render(<App />);

    expect(screen.getByRole('heading', { name: /Sistema de gestión administrativa/i })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Escudo de Ingeniería Informática UAGRM/i })).toBeTruthy();
    expect(screen.getByText(/FICCT · Universidad Autónoma Gabriel René Moreno/i)).toBeTruthy();
    expect(await screen.findByText(/Sistema disponible/i)).toBeTruthy();
  });

  it('no expone etiquetas internas del proyecto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'UP' }) }));
    const { container } = render(<App />);
    expect(container.textContent).not.toMatch(/prototipo|\bbeta\b|CU-01|PK0[1-8]|ciclos de desarrollo/i);
    expect(document.getElementById('inicio')?.classList.contains('hero-institucional')).toBe(true);
    await screen.findByText(/Sistema disponible/i);
  });

  it('presenta enlaces reales hacia la cuenta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'UP' }) }));

    render(<App />);

    expect(screen.getByRole('link', { name: /Iniciar sesión/i }).getAttribute('href')).toBe('/login');
    expect(screen.getByRole('link', { name: /Registrar cuenta/i }).getAttribute('href')).toBe('/registro');
    expect(screen.getByText(/no otorgará permisos institucionales automáticamente/i)).toBeTruthy();
  });

  it('muestra la galería institucional responsive con fotos locales y carga diferida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'UP' }) }));
    render(<App />);
    const campus = document.getElementById('campus');
    expect(campus).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Un espacio que nos identifica/i })).toBeTruthy();
    expect(campus!.querySelectorAll('img')).toHaveLength(3);
    expect([...campus!.querySelectorAll('img')].every(img => img.getAttribute('loading') === 'lazy')).toBe(true);
    expect(screen.getByRole('link', { name: 'Campus' }).getAttribute('href')).toBe('#campus');
    await screen.findByText(/Sistema disponible/i);
  });

  it('presenta dos secciones inmersivas con navegación accesible al campus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'UP' }) }));
    render(<App />);

    expect(document.getElementById('inicio')?.classList.contains('hero-institucional')).toBe(true);
    expect(document.getElementById('facultad')?.classList.contains('franja-fotografica')).toBe(true);
    expect(screen.getByRole('heading', { name: /Una carrera conectada con su comunidad/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Conocer nuestros espacios/i }).getAttribute('href')).toBe('#campus');
    expect(document.getElementById('novedades')?.classList.contains('novedades-inmersivas')).toBe(true);
    await screen.findByText(/Sistema disponible/i);
  });

  it('muestra el acceso a Administración en la cabecera cuando la sesión está autorizada', async () => {
    vi.stubGlobal('fetch', vi.fn(async (ruta: string) => ruta === '/api/cuenta/sesion'
      ? { ok: true, json: async () => ({ perfil: { permisosInstitucionales: ['AUTORIZACIONES_ADMINISTRAR'] } }) }
      : { ok: true, json: async () => ({ status: 'UP' }) }));
    render(<App />);
    const enlace = await screen.findByRole('link', { name: 'Administración' });
    expect(enlace.getAttribute('href')).toBe('/administracion/autorizaciones');
    expect(await screen.findByText(/Sistema disponible/i)).toBeTruthy();
  });

  it('informa el fallo y permite reintentar', async () => {
    const consultaSalud = vi.fn()
      .mockRejectedValueOnce(new Error('sin conexión'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'UP' }) });
    vi.stubGlobal('fetch', vi.fn((ruta: string) => ruta === '/api/health'
      ? consultaSalud()
      : Promise.resolve({ ok: false, json: async () => ({}) })));

    render(<App />);

    expect(await screen.findByText(/Sistema no disponible/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Comprobar conexión/i }));

    expect(await screen.findByText(/Sistema disponible/i)).toBeTruthy();
    expect(consultaSalud).toHaveBeenCalledTimes(2);
  });
});
