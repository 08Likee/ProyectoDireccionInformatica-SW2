/**
 * Provisión extraordinaria de la PRIMERA autoridad institucional.
 * Uso exclusivamente por un operador con acceso administrativo al contenedor.
 * No existe ruta HTTP ni contraseña predeterminada.
 * Se debe comprobar fuera del sistema la designación institucional real.
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

async function ejecutar(): Promise<void> {
  const args = process.argv.slice(2);
  const indice = args.indexOf('--correo');
  const correo = indice >= 0 ? args[indice + 1]?.trim().toLowerCase() : undefined;
  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 150
    || !args.includes('--confirmo-designacion')) {
    throw new Error('Uso: node dist/infraestructura/seguridad/provision-director.js --correo CORREO_VERIFICADO --confirmo-designacion. Verificá antes la documentación oficial del nombramiento.');
  }
  const db = new Client({
    host: process.env.POSTGRES_HOST ?? 'db',
    port: Number(process.env.POSTGRES_PORT ?? '5432'),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB ?? 'direccion_informatica',
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    // Evita ejecuciones simultáneas y una segunda autoridad inicial.
    await db.query('SELECT pg_advisory_xact_lock(4082036002)');
    const yaExiste = await db.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM autoridad_direccion');
    if (Number(yaExiste.rows[0].total) !== 0) {
      throw new Error('La provisión inicial ya fue realizada. Las transferencias futuras corresponden al procedimiento institucional específico.');
    }
    const usuarios = await db.query<{id_usuario:string}>(`SELECT id_usuario::text FROM usuario
      WHERE correo=$1 AND estado_cuenta='ACTIVA' AND fecha_verificacion IS NOT NULL FOR UPDATE`,[correo]);
    const usuarioId = usuarios.rows[0]?.id_usuario;
    if (!usuarioId) throw new Error('La cuenta debe existir y tener su correo verificado antes de asignar la autoridad.');
    const direcciones = await db.query<{id_direccion:string}>(`INSERT INTO direccion_institucional(codigo,nombre)
      VALUES('DI_INFORMATICA','Dirección de Ingeniería Informática')
      ON CONFLICT(codigo) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id_direccion::text`);
    const direccionId = direcciones.rows[0].id_direccion;
    const rol = await db.query<{id_rol:string}>(`INSERT INTO rol(id_direccion,nombre,descripcion,es_sistema,creado_por,actualizado_por)
      VALUES($1,'Dirección de Carrera','Autoridad institucional inicial, protegida del mantenimiento ordinario',true,$2,$2)
      RETURNING id_rol::text`,[direccionId,usuarioId]);
    const rolId = rol.rows[0].id_rol;
    await db.query('INSERT INTO rol_permiso(id_rol,id_permiso) SELECT $1,id_permiso FROM permiso', [rolId]);
    const cuentaPermisos=await db.query<{total:string}>(`SELECT COUNT(*)::text AS total FROM rol_permiso
      JOIN permiso USING(id_permiso) WHERE id_rol=$1 AND codigo='AUTORIZACIONES_ADMINISTRAR'`,[rolId]);
    if (Number(cuentaPermisos.rows[0].total)!==1) throw new Error('El catálogo de permisos no está inicializado.');
    await db.query('INSERT INTO autoridad_direccion(id_direccion,id_usuario) VALUES($1,$2)',[direccionId,usuarioId]);
    await db.query('INSERT INTO asignacion_rol(id_usuario,id_rol,asignado_por) VALUES($1,$2,$1)',[usuarioId,rolId]);
    await db.query(`INSERT INTO registro_auditoria(tipo_actor,identidad_tecnica,accion,tipo_entidad,
      identificador_entidad,origen,datos_posteriores,identificador_correlacion,id_direccion)
      VALUES('TECNICO','PROVISION_LOCAL_AUTORIZADA','AUTORIDAD_INICIAL','AUTORIDAD_DIRECCION',
      $1,'PROVISION_LOCAL',$2::jsonb,$3,$4)`,
    [usuarioId,JSON.stringify({usuarioId,direccionId,rolId}),randomUUID(),direccionId]);
    await db.query('COMMIT');
    process.stdout.write('Provisión inicial completada y auditada. Ingresá nuevamente al sistema con la cuenta designada.\n');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally { await db.end(); }
}

void ejecutar().catch((e:unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : 'Error inesperado.'}\n`);
  process.exitCode = 1;
});
