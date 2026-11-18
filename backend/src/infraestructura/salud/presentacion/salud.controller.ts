import { Controller, Get } from '@nestjs/common';
import { SaludService } from '../negocio/salud.service';

@Controller('api/health')
export class SaludController {
  constructor(private readonly salud: SaludService) {}

  @Get()
  async consultar(): Promise<{ status: 'UP' }> {
    return this.salud.comprobar();
  }
}
