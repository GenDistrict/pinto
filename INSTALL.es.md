# Instalar PINTO con un agente de programación

[English](INSTALL.md) · [Español](INSTALL.es.md) · [한국어](INSTALL.ko.md)

Cuando el usuario proporcione la URL y pida instalar, completa la descarga, instalación y apertura. Lee `AGENTS.md` y responde en el idioma del usuario.

## Descargar

Repositorio: https://github.com/GenDistrict/pinto — rama: `main`.

Usa `git clone https://github.com/GenDistrict/pinto.git` si Git está disponible. Si no, descarga `https://github.com/GenDistrict/pinto/archive/refs/heads/main.zip` y extrae `pinto-main` en una carpeta con permiso de escritura. No es necesario instalar Git. Comprueba que existan `package.json`, `package-lock.json`, `install.ps1` e `install.sh`.

Si ya existe una instalación, conserva el código y los datos. Repárala o sigue la [guía de mantenimiento](docs/MAINTENANCE.es.md); no la sobrescribas con una descarga nueva.

## Instalar y abrir

Lee el script y respeta los permisos del equipo. Desde la carpeta descargada:

```powershell
# Windows: es, en o ko
./install.ps1 -Language es
```

```sh
# macOS
sh ./install.sh --language es
```

El idioma es opcional: se utiliza la elección guardada o el idioma del sistema, con inglés como alternativa. El selector inferior guarda la preferencia. `--language` la sustituye para ese inicio. No se traducen las notas del usuario.

`-Workspace '<carpeta existente>'` / `--workspace '<carpeta existente>'` elige dónde guardar imágenes. Si se omite, se usan los datos de PINTO. No conecta un servicio de IA.

Los scripts utilizan un Node.js compatible o descargan uno oficial en `.pinto/runtime/`, verificando su suma de comprobación. Instalan las dependencias fijadas, preparan Electron, compilan y ejecutan `setup.mjs`. No reduzcas la seguridad del sistema ni cambies ajustes globales de IA. Windows crea `PINTO.lnk`; macOS crea `~/Applications/PINTO.app` y `PINTO.command`. El usuario no necesita aportar un certificado de firma.

`-NoShortcut` / `--no-shortcut` omite el acceso directo del usuario. `-NoLaunch` / `--no-launch` omite la apertura. En ese caso no afirmes que se abrió una ventana.

## Verificar e informar

Lee `.pinto/install-result.json`. Un inicio verificado devuelve `status: "ready"` y `windowReady: true`. Comprueba `sourceRoot`, `launcher`, `sourceEditable`, `locale` y `modificationGuide`. Con un entorno privado usa `nodePath`, por ejemplo `<nodePath> scripts/task.mjs build`.

En esta misma conversación informa del inicio verificado, la ubicación del código, cómo abrir la aplicación y que el usuario puede pedir a la IA que personalice el código local. Incluye ejemplos: tamaño de letra, atajos y formato de instrucciones. Informa solo de lo verificado.

## Errores y recuperación

Los instaladores devuelven un código distinto de cero si fallan. Identifica la fase y la causa; no informes de éxito. Revisa `.pinto/app.log` y `npm run doctor -- --json`. Reinstalar conserva la base de comparación y el código del usuario. Las imágenes y notas permanecen en los datos de PINTO o en `.image-notes/` dentro de la carpeta elegida.
