# PINTO

[English](README.md) · [Español](README.es.md) · [한국어](README.ko.md)

![PINTO](assets/brand/logo.svg)

**Señala lo que quieres cambiar. Deja que tu IA lo edite.**

PINTO es una pequeña aplicación de escritorio para Windows y macOS cuyo código puedes personalizar. Abre una imagen, marca lo que quieras cambiar, escribe instrucciones y cópialas a tu agente de programación. El texto incluye la ruta de la imagen de referencia y las coordenadas de sus píxeles originales.

PINTO prepara las instrucciones. Tu agente realiza la edición mediante generación de imágenes u otras herramientas disponibles. Si puede leer el archivo local indicado, no necesitas adjuntarlo de nuevo. En una conversación nueva sin acceso al archivo, adjunta también el original.

## Instalar con tu IA

Pega esto en thread0, Claude Code o Codex:

```text
https://github.com/GenDistrict/pinto
Instala esta aplicación. Lee INSTALL.es.md, usa español y ábrela cuando esté lista.
```

El agente sigue [INSTALL.es.md](INSTALL.es.md), descarga el código, prepara el entorno, compila y abre la aplicación. No necesitas tener Git ni Node.js instalados: se puede usar un [ZIP del código](https://github.com/GenDistrict/pinto/archive/refs/heads/main.zip) y un entorno Node.js privado. La primera instalación requiere internet y permiso para ejecutar comandos locales. No necesitas un certificado personal de desarrollador.

Instalación manual desde la carpeta descargada:

```powershell
# Windows
./install.ps1 -Language es
```

```sh
# macOS
sh ./install.sh --language es
```

## Español, inglés y coreano

Al iniciar se utiliza el idioma del sistema, o inglés si no está disponible. Puedes cambiarlo con el selector inferior; la elección se conserva al reiniciar. Las herramientas, la ayuda, los diálogos, los errores y las instrucciones copiadas siguen el idioma elegido. Tus propias notas no se traducen ni se sobrescriben.

[Ver demostración real en español](docs/examples/pinto-es.mp4) · [English demo](docs/examples/pinto-en.mp4)

![PINTO en español](docs/examples/pinto-es.png)

La demostración utiliza la aplicación real, la imagen de ejemplo y las instrucciones en español.

## Uso

1. Abre, arrastra o pega una imagen PNG, JPEG o WebP.
2. Elige **Rectángulo, Elipse, Punto, Línea o Trazo libre**. Haz clic para puntos o arrastra para otras formas. Escribe qué quieres cambiar.
3. Usa **Añadir objetivo** o Mayús+clic/arrastrar para aplicar una instrucción a varios lugares.
4. Pulsa **Copiar instrucciones** o Ctrl+Enter / ⌘Enter.
5. Pega el texto en la conversación de IA que creó el original. En una conversación nueva, adjunta también el original si hace falta.

**Cerrar imagen** guarda el trabajo y vuelve al inicio. Recupéralo desde Trabajos recientes. Incluye deshacer/rehacer, ampliación y desplazamiento, exportación TXT y guardado automático.

Las imágenes se guardan automáticamente. **Más opciones → Cambiar carpeta de imágenes** elige la ubicación; no conecta una cuenta de IA. Límites: 64 MB por imagen, 16.000 px por lado y 64 millones de píxeles en total.

## Trabajar con varias imágenes

![Varias imágenes y una instrucción de referencia](docs/screenshots/multi-image.png)

Abre o arrastra varias imágenes juntas (hasta 20) y cambia entre ellas con las miniaturas. **Añadir imágenes** agrega archivos al trabajo actual; **Abrir** inicia otro trabajo. Cada imagen conserva sus anotaciones y su historial de deshacer al cambiar.

Marca las imágenes de destino y pulsa **Añadir instrucción a las imágenes seleccionadas**. Las instrucciones compartidas se guardan automáticamente. Puedes elegir una referencia: por ejemplo, aplicar los colores de Imagen 1 a Imagen 2. **Copiar todas las instrucciones** y la exportación TXT incluyen rutas distintas, tamaños, coordenadas originales, notas por imagen e instrucciones compartidas/de referencia. Los números estables y las rutas distinguen incluso archivos con el mismo nombre.

**Cerrar trabajo** guarda el conjunto, que puedes recuperar desde Trabajos recientes. Quitar una miniatura no elimina el archivo ni sus notas. Si una instrucción utiliza esa imagen, primero modifica o elimina la instrucción. Los números no cambian al quitar imágenes. Si falla una importación, se conservan los archivos importados y se informa del error. Cambia la carpeta de almacenamiento desde un trabajo de una sola imagen antes de añadir más.

La edición real la realiza el agente. En una conversación sin acceso a archivos locales, proporciona todos los originales utilizados.

## Personalízalo

Pide al mismo agente que cambie el tamaño de letra, los atajos o el formato de las instrucciones. En otra sesión, usa **Más opciones → Copiar guía de personalización** para compartir la ubicación del código y los comandos. Las modificaciones personales no se sobrescriben automáticamente.

- [Instalación y diagnóstico](INSTALL.es.md)
- [Mantenimiento y recuperación](docs/MAINTENANCE.es.md)
- [Guía para agentes](AGENTS.md)

Plataformas previstas: Windows 10+ (x64/ARM64) y macOS 13.5+ (Intel/Apple Silicon). Se ha probado localmente en Windows; la validación de macOS se comprueba por separado. Esta versión no ofrece soporte para Linux.

## Desarrollo

```sh
npm ci
node node_modules/electron/install.js
npm run check
npm test
npm run build
npm start -- --language es
npm run test:e2e
```

Los comandos necesitan Node.js 22.12 o posterior. El instalador lo prepara si hace falta.

## Licencia

[MIT](LICENSE). Puedes usar, modificar y redistribuir el código. Las dependencias conservan sus propias licencias.
