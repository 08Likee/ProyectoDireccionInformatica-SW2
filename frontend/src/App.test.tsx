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

  it('no simula autenticación antes del CU-01', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'UP' }) }));

    render(<App />);

    expect((screen.getByRole('button', { name: /Iniciar sesión/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Registrar cuenta/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/no otorgará permisos institucionales automáticamente/i)).toBeTruthy();
  });

  it('informa el fallo y permite reintentar', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('sin conexión'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'UP' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText(/Sistema no disponible/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Comprobar conexión/i }));

    expect(await screen.findByText(/Sistema disponible/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
