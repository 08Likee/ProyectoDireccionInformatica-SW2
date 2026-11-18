import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SaludService {
  constructor(private readonly db: DataSource) {}

  async comprobar(): Promise<{ status: 'UP' }> {
    try {
      await this.db.query('SELECT 1');
      return { status: 'UP' };
    } catch {
      throw new ServiceUnavailableException('Servicio no disponible');
    }
  }
}
