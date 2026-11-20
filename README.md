# Biblioteca de conocimiento — extensión personal para Chrome

Versión 0.1.0. Guarda información en la base **Documentos · Base maestra** de tu Biblioteca de conocimiento de Notion. No requiere Cloudflare, una suscripción intermedia ni publicar la extensión en Chrome Web Store.

## Instalar

1. Descomprime el ZIP en una carpeta permanente de tu ordenador.
2. Abre Chrome y entra en `chrome://extensions`.
3. Activa **Modo de desarrollador** y pulsa **Cargar descomprimida**.
4. Selecciona la carpeta que contiene `manifest.json` (biblioteca-clipper). Fija la extensión a la barra de herramientas si quieres.

## Conectar Notion (una sola vez por navegador)

1. Abre [Mis integraciones de Notion](https://www.notion.so/my-integrations) y crea una integración **interna** en el espacio de trabajo adecuado. Dale permisos para leer e insertar contenido; habilita actualización de contenido para añadir texto de artículos largos.
2. Abre [Documentos · Base maestra](https://app.notion.com/p/41e5580d8c9081e7ac28cfc034efd8b0). En el menú de Notion **••• → Conexiones**, añade tu integración. No necesitas compartir otras bases.
3. En las opciones de la extensión, pega el secreto de la integración. El ID de la fuente de datos viene configurado. Pulsa **Comprobar y guardar conexión**.
4. Abre una página web normal y pulsa el icono de Biblioteca.

No compartas tu secreto ni lo envíes por chat. Se guarda localmente en Chrome y puede revocarse desde Notion. No se incluye en este código ni en el ZIP. La clave de una integración es sensible; protege tu perfil de Chrome.

## Usar

- **Enlace:** guarda el título editable, la URL y las anotaciones.
- **Selección:** selecciona texto y luego usa el icono o el menú contextual.
- **Página (texto):** extrae el texto visible de la zona principal de una página. Puedes revisarlo y corregirlo antes de guardar. No conserva necesariamente las imágenes, el HTML ni el diseño completo.
- **YouTube:** reconoce enlaces a vídeos y guarda el enlace junto con un bloque incrustado. No descarga vídeos ni transcripciones.
- **Captura:** pulsa Capturar pantalla, revisa la imagen y guárdala como archivo adjunto. Captura únicamente la parte visible de la pestaña.
- **Clasificación:** rellena los campos del formulario. Las opciones de Notion se leen en tiempo real, incluidos proyectos, categorías y origen. Las etiquetas se separan por comas.
- **Duplicados:** si existe un registro con el mismo enlace normalizado, la extensión mostrará el documento antes de guardar. Puedes crear otro deliberadamente si lo necesitas.

## Limitaciones y permisos

- La extensión solo solicita permiso temporal a la pestaña cuando la utilizas y acceso de red a `api.notion.com`. No realiza capturas automáticas ni rastrea tu navegación.
- Chrome puede impedir acceder a páginas internas o protegidas. No se admiten capturas de esas páginas.
- Notion impone sus propios límites de API, tamaño de archivos y permisos. No hay cuotas comerciales añadidas por esta extensión.
- La primera versión precisa una validación con tu integración real antes de considerarla lista para producción. No usa Cloudflare ni un servidor intermedio.

## Desarrollo

Sin dependencias de ejecución. Manifest V3, JavaScript modular, HTML/CSS y API de Notion. El código está preparado para versionarlo en Git.

- `manifest.json`: permisos y puntos de entrada.
- `clip.html`, `clip.js`: formulario de captura.
- `background.js`: selección, capturas y menú contextual.
- `notion.js`: propiedades, detección de duplicados y comunicación directa con Notion.
- `options.html`, `options.js`: configuración de la integración.
- `tests.mjs`: pruebas unitarias y API simulada. Ejecuta `node --test tests.mjs`.

Referencias: [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [Notion API](https://developers.notion.com/reference/intro).
