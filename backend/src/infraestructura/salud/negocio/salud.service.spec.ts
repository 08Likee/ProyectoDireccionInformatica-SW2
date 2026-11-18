import { ServiceUnavailableException } from '@nestjs/common';
import { SaludService } from './salud.service';

const consulta = jest.fn();
const service = new SaludService({ query: consulta } as never);

describe('Salud de plataforma', () => {
  beforeEach(() => consulta.mockReset());

  it('confirma disponibilidad cuando PostgreSQL responde', async () => {
    consulta.mockResolvedValue([{ '?column?': 1 }]);
    await expect(service.comprobar()).resolves.toEqual({ status: 'UP' });
    expect(consulta).toHaveBeenCalledWith('SELECT 1');
  });

  it('no informa UP cuando falla PostgreSQL', async () => {
    consulta.mockRejectedValue(new Error('db offline'));
    await expect(service.comprobar()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
