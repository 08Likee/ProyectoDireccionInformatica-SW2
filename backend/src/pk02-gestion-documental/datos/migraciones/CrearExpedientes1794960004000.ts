import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-08 y protección documental transversal. No modifica migraciones anteriores. */
export class CrearExpedientes1794960004000 implements MigrationInterface {
  name = 'CrearExpedientes1794960004000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE documento ADD CONSTRAINT documento_ambito_unico UNIQUE(id_documento,id_direccion)`);
    await q.query(`CREATE TABLE periodo_academico (
      id_periodo BIGSERIAL PRIMARY KEY,
      id_direccion BIGINT NOT NULL REFERENCES direccion_institucional(id_direccion),
      gestion INTEGER NOT NULL CHECK(gestion BETWEEN 1 AND 9999),
      codigo_periodo VARCHAR(20) NOT NULL CHECK(btrim(codigo_periodo)<>''),
      fecha_inicio DATE NOT NULL, fecha_fin DATE NOT NULL CHECK(fecha_fin>=fecha_inicio),
      creado_por BIGINT NOT NULL REFERENCES usuario(id_usuario), fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(id_periodo,id_direccion)
    )`);
    await q.query('CREATE UNIQUE INDEX periodo_codigo_ambito ON periodo_academico(id_direccion,gestion,lower(codigo_periodo))');
    await q.query(`CREATE TABLE expediente (
      id_expediente BIGSERIAL PRIMARY KEY, id_direccion BIGINT NOT NULL REFERENCES direccion_institucional(id_direccion),
      id_periodo BIGINT NOT NULL, codigo VARCHAR(50) CHECK(codigo IS NULL OR btrim(codigo)<>''),
      asunto VARCHAR(250) NOT NULL CHECK(btrim(asunto)<>''), descripcion VARCHAR(2000) NOT NULL DEFAULT '',
      version_control INTEGER NOT NULL DEFAULT 0 CHECK(version_control>=0),
      creado_por BIGINT NOT NULL REFERENCES usuario(id_usuario), actualizado_por BIGINT NOT NULL REFERENCES usuario(id_usuario),
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(), fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK(fecha_actualizacion>=fecha_creacion), UNIQUE(id_expediente,id_direccion),
      FOREIGN KEY(id_periodo,id_direccion) REFERENCES periodo_academico(id_periodo,id_direccion)
    )`);
    await q.query('CREATE UNIQUE INDEX expediente_codigo_ambito ON expediente(id_direccion,lower(codigo)) WHERE codigo IS NOT NULL');
    await q.query('CREATE INDEX expediente_ambito_periodo ON expediente(id_direccion,id_periodo,fecha_creacion DESC,id_expediente DESC)');
    await q.query(`CREATE TABLE expediente_documento (
      id_expediente_documento BIGSERIAL PRIMARY KEY, id_expediente BIGINT NOT NULL, id_direccion BIGINT NOT NULL,
      id_documento BIGINT NOT NULL, numero_version_fijada INTEGER CHECK(numero_version_fijada>0),
      observacion VARCHAR(1000) NOT NULL DEFAULT '', es_obligatorio BOOLEAN NOT NULL DEFAULT false,
      fecha_vinculacion TIMESTAMPTZ NOT NULL DEFAULT now(), vinculado_por BIGINT NOT NULL REFERENCES usuario(id_usuario),
      numero_version_retiro INTEGER CHECK(numero_version_retiro>0),
      fecha_desvinculacion TIMESTAMPTZ, desvinculado_por BIGINT REFERENCES usuario(id_usuario), motivo_desvinculacion VARCHAR(1000),
      FOREIGN KEY(id_expediente,id_direccion) REFERENCES expediente(id_expediente,id_direccion),
      FOREIGN KEY(id_documento,id_direccion) REFERENCES documento(id_documento,id_direccion),
      FOREIGN KEY(id_documento,numero_version_fijada) REFERENCES version_documento(id_documento,numero_version),
      FOREIGN KEY(id_documento,numero_version_retiro) REFERENCES version_documento(id_documento,numero_version),
      CHECK(NOT es_obligatorio OR fecha_desvinculacion IS NULL),
      CHECK((fecha_desvinculacion IS NULL AND numero_version_retiro IS NULL AND desvinculado_por IS NULL AND motivo_desvinculacion IS NULL) OR
        (fecha_desvinculacion IS NOT NULL AND numero_version_retiro IS NOT NULL AND desvinculado_por IS NOT NULL AND motivo_desvinculacion IS NOT NULL
        AND btrim(motivo_desvinculacion)<>'' AND fecha_desvinculacion>=fecha_vinculacion))
    )`);
    await q.query('CREATE UNIQUE INDEX expediente_documento_activo ON expediente_documento(id_expediente,id_documento) WHERE fecha_desvinculacion IS NULL');
    await q.query('CREATE INDEX expediente_documento_historial ON expediente_documento(id_expediente,fecha_vinculacion DESC)');
    await q.query(`CREATE TABLE restriccion_documento (
      id_restriccion BIGSERIAL PRIMARY KEY, id_documento BIGINT NOT NULL REFERENCES documento(id_documento),
      fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(), registrado_por BIGINT NOT NULL REFERENCES usuario(id_usuario),
      motivo VARCHAR(1000) NOT NULL CHECK(btrim(motivo)<>''), fecha_revocacion TIMESTAMPTZ,
      revocado_por BIGINT REFERENCES usuario(id_usuario), motivo_revocacion VARCHAR(1000),
      CHECK((fecha_revocacion IS NULL AND revocado_por IS NULL AND motivo_revocacion IS NULL) OR
      (fecha_revocacion IS NOT NULL AND revocado_por IS NOT NULL AND motivo_revocacion IS NOT NULL
      AND btrim(motivo_revocacion)<>'' AND fecha_revocacion>=fecha_registro))
    )`);
    await q.query('CREATE UNIQUE INDEX restriccion_documento_activa ON restriccion_documento(id_documento) WHERE fecha_revocacion IS NULL');
    for (const [codigo,modulo,operacion] of [
      ['PERIODOS_GESTIONAR','Expedientes','Registrar periodos académicos'],
      ['DOCUMENTOS_RESTRINGIDOS_CONSULTAR','Documentos','Acceder a documentos restringidos'],
      ['DOCUMENTOS_RESTRICCIONES_GESTIONAR','Documentos','Administrar restricciones documentales'],
    ]) {
      await q.query('INSERT INTO permiso(codigo,modulo,operacion,descripcion) VALUES($1,$2,$3,$4)',[codigo,modulo,operacion,operacion]);
    }
    // Solo el rol protegido de la autoridad inicial, no roles delegados. Las nuevas atribuciones se auditan.
    await q.query(`WITH ampliados AS (
      INSERT INTO rol_permiso(id_rol,id_permiso)
      SELECT DISTINCT r.id_rol,p.id_permiso FROM rol r JOIN autoridad_direccion a ON a.id_direccion=r.id_direccion
      JOIN asignacion_rol ar ON ar.id_rol=r.id_rol AND ar.id_usuario=a.id_usuario
      CROSS JOIN permiso p WHERE r.es_sistema AND r.estado='ACTIVO' AND a.fecha_inicio<=now()
      AND (a.fecha_fin IS NULL OR a.fecha_fin>now()) AND ar.fecha_revocacion IS NULL AND ar.fecha_inicio<=now()
      AND (ar.fecha_fin IS NULL OR ar.fecha_fin>now()) AND p.codigo IN ('PERIODOS_GESTIONAR','DOCUMENTOS_RESTRINGIDOS_CONSULTAR','DOCUMENTOS_RESTRICCIONES_GESTIONAR')
      RETURNING id_rol,id_permiso)
      INSERT INTO registro_auditoria(tipo_actor,identidad_tecnica,accion,tipo_entidad,identificador_entidad,origen,datos_posteriores,identificador_correlacion,id_direccion)
      SELECT 'TECNICO','MIGRACION_CU08','ROL_AMPLIAR_CATALOGO','ROL',r.id_rol::text,'MIGRACION',jsonb_build_object('codigo',p.codigo),gen_random_uuid(),r.id_direccion
      FROM ampliados x JOIN rol r USING(id_rol) JOIN permiso p USING(id_permiso)`);
  }
  async down(): Promise<void> {
    // La reversión automática eliminaría antecedentes o relajaría restricciones vigentes.
    throw new Error('Reversión de CU-08 requiere un procedimiento de restauración validado; no se eliminan datos ni restricciones automáticamente.');
  }
}
