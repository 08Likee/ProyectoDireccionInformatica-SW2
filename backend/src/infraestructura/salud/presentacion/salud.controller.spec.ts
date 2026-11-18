import { SaludController } from './salud.controller';
import { SaludService } from '../negocio/salud.service';

describe('Controlador de salud', () => {
  it('delega la verificación al servicio', async () => {
    const service = { comprobar: jest.fn().mockResolvedValue({ status: 'UP' }) };
    const controller = new SaludController(service as unknown as SaludService);
    await expect(controller.consultar()).resolves.toEqual({ status: 'UP' });
    expect(service.comprobar).toHaveBeenCalledTimes(1);
  });
});
