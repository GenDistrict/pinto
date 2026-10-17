# PINTO

[English](README.md) · [Español](README.es.md) · [한국어](README.ko.md)

![PINTO](assets/brand/logo.svg)

**Instrucciones precisas de edición visual para el agente de programación que ya usas en tu equipo.**

Usa PINTO junto con tu agente en **thread0**, **Claude Code**, **Codex** u otro agente de programación que se ejecute en tu equipo. PINTO es una pequeña aplicación de escritorio para Windows y macOS, con código personalizable, que te ayuda a comunicar exactamente qué quieres cambiar en una imagen, un PDF, un archivo HTML o una aplicación web local.

Abre tus imágenes, marca las partes que quieras cambiar y añade notas. PINTO reúne las rutas de los archivos, las coordenadas de los píxeles originales, las zonas seleccionadas y las relaciones entre imágenes de referencia en instrucciones que puedes copiar y pegar en el agente que ya utilizas.

**PINTO hace precisa la solicitud. Tu agente de programación realiza la edición**, mediante generación de imágenes u otras herramientas adecuadas que tenga disponibles. Si puede leer los archivos locales indicados, no necesitas adjuntar las imágenes de nuevo. En una conversación nueva sin acceso a esos archivos, adjunta también los originales.

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

PINTO 0.4 también abre **PDF, HTML local y aplicaciones web locales** en el mismo visor.

- PDF: ruta original, número de página, coordenadas en puntos PDF y texto bajo la marca. Se pide modificar el documento fuente y regenerar el PDF cuando corresponda.
- HTML: ruta del archivo, coordenadas CSS, selector/texto del elemento y pasos para llegar a una pantalla.
- Aplicación web: URL actual, coordenadas CSS y pistas del elemento. Se pide editar el código del proyecto, no la captura ni los archivos compilados.

**Ver / Editar** mantiene la página actual. Punto es la primera herramienta y la predeterminada. Los PDF tienen miniaturas a la izquierda y un botón en el borde para ocultarlas. HTML usa flechas y una sola herramienta Mano: arrastrar desplaza y hacer clic interactúa. La lista de instrucciones permite volver a las páginas/pantallas marcadas. Las notas y capturas se guardan y se recuperan al reiniciar.

Usa **Abrir aplicación web** en el inicio o en Más opciones con una URL `http://localhost`, `http://127.0.0.1` o `http://[::1]`. Abre la ventana web de PINTO para iniciar sesión o navegar y después actualiza la captura. No se importan credenciales de thread0 ni de otros navegadores.

Límites: 20 elementos por trabajo (cada página PDF o pantalla guardada cuenta como uno), hasta 20 páginas por PDF, sin PDF protegidos por contraseña. HTML usa recursos locales bajo su carpeta; las aplicaciones web solo permiten solicitudes del mismo origen. No se incluyen CDN externos ni el estado temporal de otro navegador. Las capturas web tienen 1280 CSS px de ancho y hasta 8000 de alto; el recorte se indica. Los clics de HTML se reproducen desde la carga inicial; para usar una aplicación web interactúa en su ventana y actualiza la captura.

![Instrucciones sobre PDF](docs/screenshots/documents-pdf.png)

1. Abre o arrastra imágenes, PDF o HTML; pega imágenes; o abre una URL de una aplicación web local.
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
