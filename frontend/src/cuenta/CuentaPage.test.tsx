import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CuentaPage } from './CuentaPage';

afterEach(cleanup);

describe('Identidad visual de cuenta institucional', () => {
  it('muestra la cabecera completa sin compartir estilos con el indicador de contraseña', () => {
    render(<CuentaPage />);
    const identidad = screen.getByRole('link', { name: /Dirección de Ingeniería Informática — volver al inicio/i });
    expect(identidad.classList.contains('cuenta-identidad')).toBe(true);
    expect(identidad.querySelector('strong')?.textContent).toContain('Dirección de Ingeniería Informática');
    expect(screen.getByRole('link', { name: 'Volver al inicio' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('img', { name: /Edificio del Módulo 236/i }).getAttribute('loading')).toBe('lazy');
  });
});
