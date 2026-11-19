# ProyectoDireccionInformatica

Sistema web de la Dirección de Ingeniería Informática — UAGRM. Base de desarrollo con frontend React + TypeScript, backend NestJS + TypeScript y PostgreSQL.

## Alcance actual

Infraestructura React + NestJS, landing institucional, consulta de salud PostgreSQL y
CU-01 (gestión de cuenta y acceso) incorporado. La aprobación funcional de CU-01 queda
pendiente de pruebas automatizadas y manuales en el entorno del proyecto.

## Ejecución con Docker Desktop en Windows

1. Crear `.env` a partir de `.env.example`. Generar una contraseña única. No compartirla ni subirla a Git.
2. Generar por primera vez los `package-lock.json` para frontend y backend con `npm install --package-lock-only` ejecutado mediante los contenedores Node.
3. Ejecutar `npm ci`, pruebas y compilaciones. Verificar `docker compose config --quiet`.
4. Iniciar con `docker compose up -d`; abrir http://127.0.0.1:5174. Comprobar `http://127.0.0.1:5174/api/health`.

El puerto 5174 evita conflicto con el proyecto anterior en 5173. El backend y PostgreSQL no publican puertos en el host. Los volúmenes son distintos de los de la instalación anterior; nunca usar `docker compose down -v` para limpiar sin copia y autorización.

### Comandos de referencia

```powershell
Copy-Item .env.example .env
$secret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
(Get-Content .env) -replace 'REEMPLAZAR_CON_SECRETO_LOCAL', $secret | Set-Content -Encoding ascii .env
docker compose config --quiet
docker compose run --rm --no-deps backend npm install --package-lock-only --no-audit --no-fund
docker compose run --rm --no-deps frontend npm install --package-lock-only --no-audit --no-fund
docker compose run --rm --no-deps backend npm ci --no-audit --no-fund
docker compose run --rm --no-deps frontend npm ci --no-audit --no-fund
docker compose run --rm --no-deps backend npm test
docker compose run --rm --no-deps backend npm run build
docker compose run --rm --no-deps frontend npm test
docker compose run --rm --no-deps frontend npm run build
docker compose up -d
```

Las dependencias requieren conexión a npm al instalarse por primera vez. El lock generado debe versionarse. Si falla una prueba o instalación, revisar la salida y no declarar la etapa validada.

El PATCH-000 estableció la base y el PATCH-001 incorpora el CU-01. Esta configuración de desarrollo no debe publicarse sin HTTPS, configuración de producción, secretos y endurecimiento adicional.

## CU-01 — Cuenta y acceso (PK01)

El módulo `backend/src/pk01-gestion-usuarios-seguridad/` separa `presentacion`, `negocio` y `datos`.
Utiliza las tablas `usuario`, `sesion` y `comprobante_cuenta` del diseño oficial de SW2.
Las migraciones TypeORM se aplican al iniciar NestJS (`synchronize: false`); no se requiere
recrear el volumen PostgreSQL. Los comprobantes y las sesiones se almacenan como hashes.

Antes de iniciar esta versión, actualizar el lockfile y las dependencias backend:

```powershell
# Dentro de la carpeta del proyecto
# Primero en Docker, para regenerar backend/package-lock.json según package.json
docker compose run --rm --no-deps backend npm install --no-audit --no-fund
docker compose up -d --force-recreate backend frontend mailpit
```

Pruebas automatizadas:

```powershell
docker compose exec backend npm test
docker compose exec backend npm run build
docker compose exec backend npm run lint
docker compose exec backend npm run test:integration
docker compose exec frontend npm test
docker compose exec frontend npm run build
```

- Portal: `http://127.0.0.1:5174/`
- Registro: `http://127.0.0.1:5174/registro`
- Inicio de sesión: `http://127.0.0.1:5174/login`
- Correo de desarrollo: `http://127.0.0.1:8026/` (Mailpit, **no Gmail real**).
- El correo real se configura mediante `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
  `SMTP_REQUIRE_TLS`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM` en `.env`.
- No publicar la interfaz de Mailpit en Internet ni subir `.env` al repositorio.
- La política de contraseña exige un mínimo de 15 caracteres y cuatro clases.
- Sesiones de navegador mediante cookie HttpOnly/SameSite=Strict (Secure en producción),
  verificación CSRF de doble envío, hashes scrypt y tokens de un solo uso.
- El limitador de intentos incluido es **por proceso** (una instancia NestJS); antes de
  escalar horizontalmente deberá migrarse a almacenamiento compartido.
- HTTPS y SMTP institucional deben configurarse antes del despliegue público.
- Las pruebas de integración usan un servicio de correo simulado, PostgreSQL real y
  eliminan únicamente la cuenta temporal creada por el propio test.

## Repositorio documental institucional (CU-07)

La gestión documental utiliza PostgreSQL para metadatos, versiones y auditoría y un **volumen
privado persistente de Docker** para los archivos. Los bytes **no** se almacenan bajo `frontend`,
`public`, ni en una carpeta servida por HTTP. No se publican URLs físicas: toda recuperación
se valida en NestJS mediante permisos vigentes y ámbito institucional.

Al agregar CU-07, **recrear** el contenedor backend (no basta `docker compose restart`) para
montar el volumen `documentos_nest_data`:

```powershell
docker compose up -d --force-recreate backend frontend
```

No ejecutar `docker compose down -v`: eliminaría también los volúmenes de PostgreSQL y documentos.
Respaldar **tanto** la base PostgreSQL **como** `documentos_nest_data` antes de migrar o restaurar,
ya que se necesitan ambos para conservar referencias consistentes.

Parámetros **técnicos provisionales**, sujetos a validación institucional: PDF, DOCX, XLSX,
CSV UTF-8, JPG/JPEG y PNG; por defecto 50 MiB por archivo (`DOCUMENTOS_MAX_MB`,
configurable entre 1 y 50). PostgreSQL conserva un techo de 50 MiB. Se verifica el tipo mediante firma/estructura
básica, tamaño, hash SHA-256, vigencia de permisos y ubicación institucional. Esto **no**
sustituye un análisis antivirus formal para despliegues institucionales.

La creación documental admite registros sin expediente asociado. CU-08 incorpora vínculos
con expedientes reales y protegidos por claves foráneas y permisos. Las vinculaciones con
correspondencia y trámites se integrarán en sus respectivos incrementos; **no se simulan destinos**.
No se ha implementado eliminación definitiva de documentos, para no destruir antecedentes.

Pruebas: `docker compose exec backend npm test`, `npm run test:integration`, `npm run build`,
`npm run lint`; y `docker compose exec frontend npm test`, `npm run build`.
Para comprobar la capacidad máxima, ejecutar `docker compose exec -e DOCUMENTOS_MAX_MB=50 backend npm run test:integration`.
La prueba documental de límite usa una Dirección de prueba y un subdirectorio aislado del almacén.
Revertir el código no revierte la migración. Volver a 10 MiB requiere que no existan versiones mayores;
la migración descendente rechaza esa reducción si hay datos incompatibles, sin eliminarlos.


## Expedientes administrativos (CU-08)

- Ruta web `/expedientes`. Catálogo `periodo_academico` por Dirección: registrar gestión, código y fechas reales (sin registros ficticios).
- Expedientes con código institucional opcional único por Dirección, asunto obligatorio e identificador visual derivado de la clave primaria. Se admiten expedientes vacíos.
- Asociación documental fija (predeterminada) o dinámica. Un documento solo puede tener un vínculo activo por expediente; los retiros conservan el vínculo y la versión recuperable al momento de retirarlo. Los antecedentes obligatorios no se retiran mediante edición ordinaria.
- Las modificaciones verifican versiones de control y registran auditoría en la transacción. El asunto y los motivos no se publican en auditoría.
- Los documentos nuevos se incorporan por CU-07 y se seleccionan para asociar en CU-08. Si falla la asociación, se puede reintentar sin cargar otra vez el archivo.
- Los permisos `EXPEDIENTES_CONSULTAR` y `EXPEDIENTES_GESTIONAR` no implican acceso documental. Para registrar periodos se necesita `PERIODOS_GESTIONAR`.
- Las restricciones particulares protegen toda versión de un documento, también desde CU-07. Exigen `DOCUMENTOS_RESTRINGIDOS_CONSULTAR` además del permiso ordinario. Para restringir o levantar la restricción se necesitan consulta, gestión, acceso restringido y `DOCUMENTOS_RESTRICCIONES_GESTIONAR`. No se concede ningún permiso nuevo a roles ordinarios: la migración amplía exclusivamente el rol de sistema asignado a la autoridad vigente y audita esa ampliación.
- No se implementan fechas institucionales ficticias, borrado físico, estados de expediente ni gestión automática de trámites. La definición de códigos oficiales y de procedimientos obligatorios queda a cargo de la Dirección.
- La nueva migración `CrearExpedientes1794960004000` no puede revertirse automáticamente: eliminar tablas podría destruir antecedentes o relajar controles de acceso. Preparar respaldo de PostgreSQL y del volumen documental antes de aplicarla.
- `npm run test:integration` incluye `expedientes.integracion.spec.ts` con datos de prueba aislados; ejecutar las pruebas en un entorno de desarrollo, nunca en producción.
