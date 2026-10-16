# Personalización, actualizaciones y recuperación

[English](MAINTENANCE.md) · [Español](MAINTENANCE.es.md) · [한국어](MAINTENANCE.ko.md)

PINTO guarda una base de comparación en `.pinto/baseline.json` durante la primera instalación. Reinstalar no la sobrescribe. Usa la guía de personalización de la aplicación para dar contexto a tu agente.

```sh
npm run changes
npm run backup
```

El primer comando muestra cambios respecto a la base. El segundo crea `.pinto/backups/<id>/`. Las imágenes y notas del usuario permanecen en su ubicación original; no forman parte de la copia del código.

Descarga la nueva versión en otra carpeta y compara desde la instalación actual:

```sh
npm run update:plan -- --from '/ruta/al/nuevo-codigo'
```

Se conservan las modificaciones locales. Si ambas versiones cambiaron un archivo de forma distinta, no se aplica automáticamente: prepara una combinación que preserve el trabajo del usuario. Si no hay conflictos, cierra PINTO y ejecuta:

```sh
npm run update:apply -- --from '/ruta/al/nuevo-codigo'
node scripts/setup.mjs --no-shortcut --language es
```

Se verifica una copia candidata antes de aplicar, se crea una copia de seguridad y se recupera el estado anterior si la sustitución falla. Omite `--no-shortcut` si necesitas actualizar accesos directos.

Para restaurar, cierra la aplicación:

```sh
npm run restore -- --backup '<id>'
```

Las copias normales no incluyen las dependencias ni la compilación: instálalas y compila de nuevo si hace falta. El resultado incluye `safetyBackup` con el estado anterior a la restauración.

Datos: `%APPDATA%/PINTO/` en Windows; `~/Library/Application Support/PINTO/` en macOS. Si eliges una carpeta de trabajo, las imágenes y anotaciones están en `.image-notes/<id>/`. La preferencia de idioma se guarda en `language.json` dentro de los datos de PINTO.
