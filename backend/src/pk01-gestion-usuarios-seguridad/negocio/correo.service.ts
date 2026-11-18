import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);

  async enviar(destinatario: string, asunto: string, ruta: string): Promise<void> {
    const base = process.env.APP_PUBLIC_URL ?? 'http://127.0.0.1:5174';
    const url = new URL(ruta, base).toString();
    const host = process.env.SMTP_HOST ?? 'mailpit';
    const puerto = Number(process.env.SMTP_PORT ?? '1025');
    const usuario = process.env.SMTP_USER;
    const clave = process.env.SMTP_PASSWORD;
    const transport = nodemailer.createTransport({
      host,
      port: puerto,
      secure: process.env.SMTP_SECURE === 'true',
      requireTLS: process.env.SMTP_REQUIRE_TLS === 'true',
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
      ...(usuario && clave ? { auth: { user: usuario, pass: clave } } : {}),
    });
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? 'Dirección de Ingeniería Informática <no-reply@direccion.local>',
        to: destinatario,
        subject: asunto,
        text: `Para continuar con tu cuenta, abre este enlace:\n${url}\n\nSi no solicitaste esta acción, ignora el mensaje.`,
      });
    } catch {
      this.logger.error(`No se pudo enviar un mensaje de ${asunto} mediante el SMTP configurado.`);
      throw new ServiceUnavailableException('El servicio de correo no está disponible. Intenta reenviar el mensaje.');
    } finally {
      transport.close();
    }
  }
}
