# Migraciones

Las migraciones versionadas viven dentro de los paquetes funcionales, por ejemplo:
`src/pk01-gestion-usuarios-seguridad/datos/migraciones/CrearCuentas1794960000000.ts`.

TypeORM las ejecuta al iniciar el backend (`migrationsRun: true` y `synchronize: false`).
Se conservan las migraciones aplicadas y nunca se reescriben después de utilizarse con datos reales.
Para verificar su registro: `SELECT * FROM migrations ORDER BY timestamp;` desde PostgreSQL.
