import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { hashToken } from '../../infraestructura/seguridad/seguridad.util';
import { AutorizacionesRepository } from '../datos/autorizaciones.repository';
import { AuditoriaRepository, AmbitoAuditoria, DetalleAuditoria, FiltrosAuditoria } from '../datos/auditoria.repository';

const TAMANO_PAGINA = 20;
const MAX_PAGINA = 100;
const CLAVES_FILTRO = ['direccionId','pagina','desde','hasta','accion','actor','entidad','resultado'];
const MAX_BIGINT = 9223372036854775807n;

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new BadRequestException('Filtros inválidos.');
  const entradas = valor as Record<string, unknown>;
  if (Object.keys(entradas).some(k => !CLAVES_FILTRO.includes(k))) throw new BadRequestException('Filtro no permitido.');
  return entradas;
}
function idValido(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[1-9]\d{0,18}$/.test(valor) || BigInt(valor) > MAX_BIGINT) {
    throw new BadRequestException('Identificador inválido.');
  }
  return valor;
}
function textoFiltro(valor: unknown, nombre: string, limite = 80): string | undefined {
  if (valor === undefined || valor === '') return undefined;
  if (typeof valor !== 'string' || valor.trim().length > limite || !valor.trim()
    || Array.from(valor).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw new BadRequestException(`${nombre} inválido.`);
  }
  return valor.trim();
}
function fechaISO(valor: unknown, nombre: string): Date | undefined {
  if (valor === undefined || valor === '') return undefined;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new BadRequestException(`${nombre} debe tener formato AAAA-MM-DD.`);
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0,10) !== valor) {
    throw new BadRequestException(`${nombre} no es una fecha válida.`);
  }
  return fecha;
}

/** Lista explícita de campos que pueden consultarse. Nunca se devuelven JSONB sin depurar. */
const CAMPOS_PUBLICABLES = new Set(['nombre','permisos','codigos','codigo','usuarioId','direccionId',
  'rolId','fechaFin','fechaInicio','referencia','version','cambios']);

export function camposAuditables(valor: unknown): Record<string, unknown> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const datos = valor as Record<string, unknown>;
  const salida: Record<string, unknown> = {};
  for (const [clave, contenido] of Object.entries(datos)) {
    if (!CAMPOS_PUBLICABLES.has(clave)) continue;
    if (contenido === null || typeof contenido === 'number' || typeof contenido === 'boolean'
      || (typeof contenido === 'string' && contenido.length <= 200)) {
      salida[clave] = contenido;
    } else if (Array.isArray(contenido) && contenido.length <= 50 && contenido.every(v => typeof v === 'string' && v.length <= 100)) {
      salida[clave] = contenido;
    }
  }
  return Object.keys(salida).length ? salida : null;
}
function idEntidadSeguro(valor: string | null): string | null {
  return valor && /^[1-9]\d{0,18}$/.test(valor) ? valor : null;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly autorizaciones: AutorizacionesRepository,
    private readonly repo: AuditoriaRepository) {}

  private async ambitosPermitidos(token: string | null): Promise<AmbitoAuditoria[]> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Iniciá sesión para consultar la auditoría.');
    const usuario = await this.autorizaciones.usuarioDeSesion(hashToken(token));
    if (!usuario) throw new UnauthorizedException('La sesión no está vigente.');
    const ambitos = await this.repo.ambitosConPermiso(usuario);
    if (!ambitos.length) throw new ForbiddenException('No contás con permiso para consultar auditoría.');
    return ambitos;
  }

  async ambitos(token: string | null) {
    return { direcciones: await this.ambitosPermitidos(token) };
  }

  private elegirAmbito(ambitos: AmbitoAuditoria[], valor: unknown): AmbitoAuditoria {
    const id = valor === undefined ? (ambitos.length === 1 ? ambitos[0].id : undefined) : idValido(valor);
    if (!id) throw new BadRequestException('Seleccioná la Dirección para consultar.');
    const elegido = ambitos.find(a => a.id === id);
    if (!elegido) throw new ForbiddenException('La Dirección solicitada no está autorizada.');
    return elegido;
  }

  async consultar(token: string | null, entrada: unknown) {
    const ambitos = await this.ambitosPermitidos(token);
    const q = objeto(entrada);
    const direccion = this.elegirAmbito(ambitos, q.direccionId);
    const pagina = q.pagina === undefined ? 0 : Number(q.pagina);
    if (typeof q.pagina !== 'undefined' && (typeof q.pagina !== 'string' || !/^\d{1,3}$/.test(q.pagina))) {
      throw new BadRequestException('Página inválida.');
    }
    if (!Number.isSafeInteger(pagina) || pagina < 0 || pagina > MAX_PAGINA) throw new BadRequestException('Página fuera del rango permitido.');
    const desde = fechaISO(q.desde,'Fecha desde');
    const hasta = fechaISO(q.hasta,'Fecha hasta');
    if (desde && hasta && (hasta < desde || hasta.getTime()-desde.getTime() > 366*86400000)) {
      throw new BadRequestException('El periodo debe ser válido y no superar 366 días.');
    }
    // El filtro corresponde al día civil de Bolivia, no al día UTC del servidor.
    const hastaExclusiva = hasta ? new Date(hasta.getTime()+86400000).toISOString().slice(0,10) : undefined;
    const resultado = textoFiltro(q.resultado,'Resultado',15);
    if (resultado && resultado !== 'EXITO' && resultado !== 'DENEGADO') throw new BadRequestException('Resultado no permitido.');
    const filtros: FiltrosAuditoria = {
      desde: desde?.toISOString().slice(0,10), hastaExclusiva,
      accion: textoFiltro(q.accion,'Operación'),
      actor: textoFiltro(q.actor,'Responsable'),
      entidad: textoFiltro(q.entidad,'Entidad'),
      resultado: resultado as FiltrosAuditoria['resultado'],
    };
    const filas = await this.repo.listar(direccion.id, filtros, pagina, TAMANO_PAGINA);
    return {
      direccion, pagina, tamanoPagina: TAMANO_PAGINA, haySiguiente: filas.length > TAMANO_PAGINA,
      eventos: filas.slice(0,TAMANO_PAGINA).map(e => ({ ...e, identificadorEntidad: idEntidadSeguro(e.identificadorEntidad) })),
    };
  }

  async detalle(token: string | null, idEvento: unknown, direccionValor: unknown) {
    const ambitos = await this.ambitosPermitidos(token);
    const direccion = this.elegirAmbito(ambitos, direccionValor);
    const id = idValido(idEvento);
    const evento: DetalleAuditoria | null = await this.repo.detalle(direccion.id,id);
    if (!evento) throw new NotFoundException('El evento no existe en la Dirección autorizada.');
    return { evento: {
      id:evento.id, fechaHora:evento.fechaHora, accion:evento.accion, entidad:evento.entidad,
      identificadorEntidad:idEntidadSeguro(evento.identificadorEntidad), actor:evento.actor,
      tipoActor:evento.tipoActor, resultado:evento.resultado, origen:evento.origen,
      identificadorCorrelacion:evento.identificadorCorrelacion,
      datosAnteriores:camposAuditables(evento.datosAnteriores),
      datosPosteriores:camposAuditables(evento.datosPosteriores),
    } };
  }
}
