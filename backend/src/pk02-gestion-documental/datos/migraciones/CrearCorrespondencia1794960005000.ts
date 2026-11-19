import { MigrationInterface, QueryRunner } from 'typeorm';

/** CU-05: registro institucional, sin movimientos de seguimiento. */
export class CrearCorrespondencia1794960005000 implements MigrationInterface {
  name = 'CrearCorrespondencia1794960005000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE tipo_correspondencia (
      id_tipo_correspondencia BIGSERIAL PRIMARY KEY, id_direccion BIGINT NOT NULL REFERENCES direccion_institucional(id_direccion),
      codigo VARCHAR(30) NOT NULL CHECK(btrim(codigo)<>''), nombre VARCHAR(150) NOT NULL CHECK(btrim(nombre)<>''),
      UNIQUE(id_tipo_correspondencia,id_direccion))`);
    await q.query('CREATE UNIQUE INDEX tipo_correspondencia_codigo ON tipo_correspondencia(id_direccion,lower(codigo))');
    await q.query(`CREATE TABLE interlocutor (
      id_interlocutor BIGSERIAL PRIMARY KEY, id_direccion BIGINT NOT NULL REFERENCES direccion_institucional(id_direccion),
      tipo_interlocutor VARCHAR(30) NOT NULL CHECK(tipo_interlocutor IN ('PROPIA_DIRECCION','UNIDAD_INTERNA','UNIDAD_EXTERNA','PERSONA','ORGANIZACION')),
      nombre_identificativo VARCHAR(255) NOT NULL CHECK(btrim(nombre_identificativo)<>''), UNIQUE(id_interlocutor,id_direccion))`);
    await q.query("CREATE UNIQUE INDEX interlocutor_nombre ON interlocutor(id_direccion,tipo_interlocutor,lower(nombre_identificativo)) WHERE tipo_interlocutor<>'PERSONA'");
    await q.query("CREATE UNIQUE INDEX interlocutor_propio ON interlocutor(id_direccion) WHERE tipo_interlocutor='PROPIA_DIRECCION'");
    await q.query(`CREATE TABLE correspondencia (
      id_correspondencia BIGSERIAL PRIMARY KEY, id_direccion BIGINT NOT NULL REFERENCES direccion_institucional(id_direccion),
      id_tipo_correspondencia BIGINT NOT NULL, id_periodo BIGINT, id_remitente BIGINT NOT NULL, id_destinatario BIGINT NOT NULL,
      rol_remitente VARCHAR(20) GENERATED ALWAYS AS ('REMITENTE'::varchar(20)) STORED,
      rol_destinatario VARCHAR(20) GENERATED ALWAYS AS ('DESTINATARIO'::varchar(20)) STORED,
      sentido VARCHAR(20) NOT NULL CHECK(sentido IN ('RECIBIDA','EMITIDA')),
      referencia_oficial VARCHAR(50) CHECK(referencia_oficial IS NULL OR btrim(referencia_oficial)<>''),
      asunto VARCHAR(255) NOT NULL CHECK(btrim(asunto)<>''), fecha_comunicacion DATE NOT NULL,
      referencia VARCHAR(2000) NOT NULL DEFAULT '', observaciones VARCHAR(2000) NOT NULL DEFAULT '',
      version_control INTEGER NOT NULL DEFAULT 0 CHECK(version_control>=0),
      fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(), fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now(),
      registrado_por BIGINT NOT NULL REFERENCES usuario(id_usuario), actualizado_por BIGINT NOT NULL REFERENCES usuario(id_usuario),
      CHECK(fecha_actualizacion>=fecha_registro), UNIQUE(id_correspondencia,id_direccion),
      UNIQUE(id_correspondencia,id_direccion,id_remitente), UNIQUE(id_correspondencia,id_direccion,id_destinatario),
      FOREIGN KEY(id_tipo_correspondencia,id_direccion) REFERENCES tipo_correspondencia(id_tipo_correspondencia,id_direccion),
      FOREIGN KEY(id_periodo,id_direccion) REFERENCES periodo_academico(id_periodo,id_direccion),
      FOREIGN KEY(id_remitente,id_direccion) REFERENCES interlocutor(id_interlocutor,id_direccion),
      FOREIGN KEY(id_destinatario,id_direccion) REFERENCES interlocutor(id_interlocutor,id_direccion))`);
    // Serie provisional: no inventar numeración oficial. El remitente forma parte de la clave solo para recibidas.
    await q.query(`CREATE UNIQUE INDEX correspondencia_recibida_ref ON correspondencia
      (id_direccion,id_remitente,id_tipo_correspondencia,(EXTRACT(YEAR FROM fecha_comunicacion)),lower(regexp_replace(btrim(referencia_oficial),' +',' ','g')))
      WHERE sentido='RECIBIDA' AND referencia_oficial IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX correspondencia_emitida_ref ON correspondencia
      (id_direccion,id_tipo_correspondencia,(EXTRACT(YEAR FROM fecha_comunicacion)),lower(regexp_replace(btrim(referencia_oficial),' +',' ','g')))
      WHERE sentido='EMITIDA' AND referencia_oficial IS NOT NULL`);
    await q.query('CREATE INDEX correspondencia_ambito_fecha ON correspondencia(id_direccion,sentido,fecha_comunicacion DESC,id_correspondencia DESC)');
    await q.query(`CREATE TABLE participacion_correspondencia (
      id_participacion BIGSERIAL PRIMARY KEY, id_correspondencia BIGINT NOT NULL, id_direccion BIGINT NOT NULL,
      id_interlocutor BIGINT NOT NULL, tipo_participacion VARCHAR(20) NOT NULL CHECK(tipo_participacion IN ('REMITENTE','DESTINATARIO')),
      nombre_registrado VARCHAR(255) NOT NULL CHECK(btrim(nombre_registrado)<>''),
      remitente_clave BIGINT GENERATED ALWAYS AS (CASE WHEN tipo_participacion='REMITENTE' THEN id_interlocutor END) STORED,
      destinatario_clave BIGINT GENERATED ALWAYS AS (CASE WHEN tipo_participacion='DESTINATARIO' THEN id_interlocutor END) STORED,
      UNIQUE(id_correspondencia,tipo_participacion),
      FOREIGN KEY(id_correspondencia,id_direccion) REFERENCES correspondencia(id_correspondencia,id_direccion),
      FOREIGN KEY(id_interlocutor,id_direccion) REFERENCES interlocutor(id_interlocutor,id_direccion),
      FOREIGN KEY(id_correspondencia,id_direccion,remitente_clave) REFERENCES correspondencia(id_correspondencia,id_direccion,id_remitente) DEFERRABLE INITIALLY DEFERRED,
      FOREIGN KEY(id_correspondencia,id_direccion,destinatario_clave) REFERENCES correspondencia(id_correspondencia,id_direccion,id_destinatario) DEFERRABLE INITIALLY DEFERRED)`);
    // Exigir las dos instantáneas incluso al escribir directamente en SQL. Las referencias circulares se comprueban al confirmar la transacción.
    await q.query(`ALTER TABLE correspondencia ADD CONSTRAINT correspondencia_remitente_registrado
      FOREIGN KEY(id_correspondencia,rol_remitente) REFERENCES participacion_correspondencia(id_correspondencia,tipo_participacion) DEFERRABLE INITIALLY DEFERRED,
      ADD CONSTRAINT correspondencia_destinatario_registrado
      FOREIGN KEY(id_correspondencia,rol_destinatario) REFERENCES participacion_correspondencia(id_correspondencia,tipo_participacion) DEFERRABLE INITIALLY DEFERRED`);
    await q.query(`CREATE TABLE correspondencia_correccion (
      id_correccion BIGSERIAL PRIMARY KEY, id_correspondencia BIGINT NOT NULL, id_direccion BIGINT NOT NULL,
      version_anterior INTEGER NOT NULL CHECK(version_anterior>=0), version_posterior INTEGER NOT NULL CHECK(version_posterior=version_anterior+1),
      motivo VARCHAR(1000) NOT NULL CHECK(btrim(motivo)<>''), datos_anteriores JSONB NOT NULL, datos_posteriores JSONB NOT NULL,
      corregido_por BIGINT NOT NULL REFERENCES usuario(id_usuario), fecha_correccion TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY(id_correspondencia,id_direccion) REFERENCES correspondencia(id_correspondencia,id_direccion), UNIQUE(id_correspondencia,version_posterior))`);
    // Identificadores de tabla/columna son constantes internas, nunca entrada HTTP.
    for (const [tabla,entidad] of [['correspondencia_documento','documento'],['correspondencia_expediente','expediente']]) {
      const documental=entidad==='documento';
      await q.query(`CREATE TABLE ${tabla} (
        id_${tabla} BIGSERIAL PRIMARY KEY, id_correspondencia BIGINT NOT NULL,id_direccion BIGINT NOT NULL,id_${entidad} BIGINT NOT NULL,
        fecha_vinculacion TIMESTAMPTZ NOT NULL DEFAULT now(),vinculado_por BIGINT NOT NULL REFERENCES usuario(id_usuario),
        fecha_desvinculacion TIMESTAMPTZ,desvinculado_por BIGINT REFERENCES usuario(id_usuario),motivo_desvinculacion VARCHAR(1000),
        ${documental?'numero_version_fijada INTEGER CHECK(numero_version_fijada>0),numero_version_retiro INTEGER CHECK(numero_version_retiro>0),':''}
        FOREIGN KEY(id_correspondencia,id_direccion) REFERENCES correspondencia(id_correspondencia,id_direccion),
        FOREIGN KEY(id_${entidad},id_direccion) REFERENCES ${entidad}(id_${entidad},id_direccion),
        ${documental?'FOREIGN KEY(id_documento,numero_version_fijada) REFERENCES version_documento(id_documento,numero_version), FOREIGN KEY(id_documento,numero_version_retiro) REFERENCES version_documento(id_documento,numero_version),':''}
        CHECK((fecha_desvinculacion IS NULL AND desvinculado_por IS NULL AND motivo_desvinculacion IS NULL ${documental?'AND numero_version_retiro IS NULL':''}) OR
          (fecha_desvinculacion IS NOT NULL AND desvinculado_por IS NOT NULL AND motivo_desvinculacion IS NOT NULL AND btrim(motivo_desvinculacion)<>'' AND fecha_desvinculacion>=fecha_vinculacion ${documental?'AND numero_version_retiro IS NOT NULL':''})))`);
      await q.query(`CREATE UNIQUE INDEX ${tabla}_activo ON ${tabla}(id_correspondencia,id_${entidad}) WHERE fecha_desvinculacion IS NULL`);
      await q.query(`CREATE INDEX ${tabla}_historial ON ${tabla}(id_correspondencia,fecha_vinculacion DESC)`);
    }
    await q.query('INSERT INTO permiso(codigo,modulo,operacion,descripcion) VALUES($1,$2,$3,$4)',[
      'CORRESPONDENCIA_CATALOGOS_GESTIONAR','Correspondencia','Gestionar catálogos','Registrar tipos e interlocutores de correspondencia']);
    await q.query(`WITH ampliados AS (
      INSERT INTO rol_permiso(id_rol,id_permiso)
      SELECT DISTINCT r.id_rol,p.id_permiso FROM rol r JOIN autoridad_direccion a ON a.id_direccion=r.id_direccion
      JOIN asignacion_rol ar ON ar.id_rol=r.id_rol AND ar.id_usuario=a.id_usuario CROSS JOIN permiso p
      WHERE r.es_sistema AND r.estado='ACTIVO' AND a.fecha_inicio<=now() AND (a.fecha_fin IS NULL OR a.fecha_fin>now())
      AND ar.fecha_revocacion IS NULL AND ar.fecha_inicio<=now() AND (ar.fecha_fin IS NULL OR ar.fecha_fin>now())
      AND p.codigo='CORRESPONDENCIA_CATALOGOS_GESTIONAR' RETURNING id_rol,id_permiso)
      INSERT INTO registro_auditoria(tipo_actor,identidad_tecnica,accion,tipo_entidad,identificador_entidad,origen,datos_posteriores,identificador_correlacion,id_direccion)
      SELECT 'TECNICO','MIGRACION_CU05','ROL_AMPLIAR_CATALOGO','ROL',r.id_rol::text,'MIGRACION',jsonb_build_object('codigo',p.codigo),gen_random_uuid(),r.id_direccion
      FROM ampliados x JOIN rol r USING(id_rol) JOIN permiso p USING(id_permiso)`);
  }
  async down(): Promise<void> { throw new Error('CU-05 requiere restauración validada; no se eliminan comunicaciones ni antecedentes automáticamente.'); }
}
