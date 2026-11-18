/** El identificador PostgreSQL BIGINT se conserva como string para evitar pérdida de precisión JS. */
export interface UsuarioFila {
  id_usuario: string;
  identificador_personal: string;
  nombres: string;
  apellidos: string;
  correo: string;
  contrasena_hash: string;
  estado_cuenta: 'PENDIENTE' | 'ACTIVA' | 'SUSPENDIDA';
  fecha_verificacion: Date | null;
}

export interface PerfilPublico {
  id: string;
  identificadorPersonal: string;
  nombres: string;
  apellidos: string;
  correo: string;
  verificado: boolean;
  /** La asignación de roles se implementará únicamente en CU-02. */
  permisosInstitucionales: [];
}

export function perfilPublico(usuario: UsuarioFila): PerfilPublico {
  return {
    id: String(usuario.id_usuario),
    identificadorPersonal: usuario.identificador_personal,
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    correo: usuario.correo,
    verificado: usuario.estado_cuenta === 'ACTIVA',
    permisosInstitucionales: [],
  };
}
