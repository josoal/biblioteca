# Biblioteca — extensión personal para Chrome

Versión 0.2.0. Guarda enlaces, páginas completas, textos, vídeos, imágenes y capturas en **Biblioteca DB** (Notion), hablando directamente con la API de Notion. Sin Cloudflare, sin servidores intermedios y sin suscripciones. Los cambios de cada versión están en [CHANGELOG.md](CHANGELOG.md).

## Instalar o actualizar

1. Abre Chrome y entra en `chrome://extensions`.
2. Activa **Modo de desarrollador** y pulsa **Cargar descomprimida**.
3. Selecciona esta carpeta (la que contiene `manifest.json`). Fija el icono a la barra si quieres.
4. Para actualizar tras un cambio, pulsa **Recargar** (↻) en la tarjeta de Biblioteca.

## Conectar Notion (una sola vez por navegador)

1. En [Mis integraciones de Notion](https://www.notion.so/my-integrations) crea una integración **interna** con permisos para leer, insertar y actualizar contenido.
2. Abre [Biblioteca DB](https://app.notion.com/p/41e5580d8c9081e7ac28cfc034efd8b0) y, en **••• → Conexiones**, añade la integración.
3. En las opciones de la extensión pega el secreto y pulsa **Comprobar y guardar conexión**. El ID de la fuente de datos ya viene configurado.

El secreto se guarda solo en el almacenamiento local de Chrome. No está en el código ni en Git.

## Usar

- **Aviso de guardado:** al abrir la extensión, arriba aparece si la página ya está en tu Biblioteca (con enlace y fecha) o si es nueva. Reconoce el mismo enlace aunque cambie `www`, `http/https`, la barra final, un `#ancla` o parámetros de seguimiento (`utm_…`, `fbclid`, `si`, `igsh`…). En YouTube e Instagram se compara por el identificador del vídeo o la publicación.
- **Enlace:** título, URL, clasificación y anotaciones.
- **Selección:** guarda el texto seleccionado conservando formato (negritas, enlaces, listas…).
- **Página completa:** guarda el contenido principal de la página con formato de Notion: títulos, párrafos con negrita/cursiva/código/enlaces, listas, citas, bloques de código con lenguaje, tablas, separadores, imágenes (con pie) y vídeos incrustados. Se descartan menús, pies de página, avisos de cookies y botones de compartir. Si editas el texto en el formulario, se guarda como texto sin formato.
- **Vídeos:** en YouTube se inserta el reproductor en el documento. También en Vimeo, Dailymotion, TikTok, Twitch, Loom, TED, Streamable y en páginas que declaran un vídeo (`og:video`).
- **Instagram:** en una publicación (`/p/…`, `/reel/…`) se descarga la imagen y se sube a Notion (los enlaces de Instagram caducan), junto con el texto de la publicación.
- **Captura:** se adjunta en «Archivos adjuntos» y además se muestra dentro del documento.
- **Clasificación:** Tipo, Categoría, Proyecto, Origen, Etiquetas y Estado se leen de Notion en tiempo real. Si añades a Notion las opciones «Vídeo»/«Imagen» en Tipo o «YouTube»/«Instagram» en Origen, la extensión las preseleccionará automáticamente.
- **Menú contextual (botón derecho):** guardar página, selección, enlace o vídeo.

## Limitaciones

- Chrome no permite leer páginas internas (`chrome://`, Chrome Web Store, visor de PDF).
- Las imágenes de páginas normales se enlazan desde su web original; si la web las borra, dejarán de verse en Notion.
- Instagram: solo se guarda la imagen principal (en carruseles, la primera). Hay que tener abierta la publicación; desde el menú «Guardar enlace» no se puede leer.
- Las listas anidadas se guardan como una lista plana. Las tablas se limitan a 100 filas.
- Notion limita a unas 3 peticiones por segundo; las páginas muy largas tardan algunos segundos y la extensión reintenta si Notion la frena.

## Desarrollo

Sin dependencias. Manifest V3, JavaScript modular, HTML/CSS y API de Notion (versión `2026-03-11`).

- `manifest.json`: permisos y puntos de entrada.
- `clip.html`, `clip.js`: formulario de guardado.
- `background.js`: menú contextual, lectura de páginas y capturas.
- `extractor.js`: se inyecta en la página y convierte su contenido a un formato intermedio.
- `notion.js`: conversión a bloques de Notion, duplicados, subidas y comunicación con la API.
- `options.html`, `options.js`: configuración de la integración.
- `icons/`: icono (SVG original y PNG de 16, 32, 48 y 128 px).
- `tests.mjs`: pruebas con API simulada. Ejecuta `node --test tests.mjs`.

Permisos: `activeTab` y `scripting` (leer la pestaña solo cuando pulsas el botón o el menú), `storage`, `contextMenus`, acceso a `api.notion.com` y a los servidores de imágenes de Instagram (`cdninstagram.com`, `fbcdn.net`) para copiar la imagen.
