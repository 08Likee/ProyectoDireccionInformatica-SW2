# Migraciones
La infraestructura base no crea tablas de negocio. En PATCH-001 se incorporarán migraciones versionadas con TypeORM, sin `synchronize: true`. Nunca modificar migraciones aplicadas sobre datos reales.
