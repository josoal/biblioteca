# Cambios

## 0.3.0 — 2026-11-20

### Nuevo
- El icono de la web pasa a ser el icono de la página en Notion (el más grande disponible; si no hay, `/favicon.ico`).
- La imagen principal de la web (`og:image`) pasa a ser la cabecera de la página en Notion. En Instagram se sube a Notion para que no caduque. Se puede desactivar con la casilla que muestra la vista previa.
- Etiquetas: editor con fichas. Se escribe y se pulsa Intro o coma; las que no existen se marcan como «nueva» y Notion las crea al guardar.
- Si la página ya está guardada, el aviso de arriba ofrece «Actualizar este». Al actualizar se añaden las etiquetas, proyectos y orígenes nuevos, se pone el icono y la cabecera, y el contenido nuevo (anotaciones, captura, página o selección) se añade al final bajo «Actualización · fecha». No se borra nada: el título, Tipo, Categoría y Estado existentes se respetan.
- Si Notion rechaza el icono o la cabecera, el documento se guarda igualmente sin ellos y se avisa.

## 0.2.0 — 2026-11-20

### Nuevo
- Nombre «Biblioteca» e icono propio (estantería con libros) en todos los tamaños.
- Aviso arriba al abrir la extensión: indica si la página ya está guardada (con enlace y fecha) o si es nueva. El botón cambia a «Guardar otra vez».
- «Página completa» guarda el contenido con formato de Notion: títulos, negrita, cursiva, código, enlaces, listas, tareas, citas, código con lenguaje, tablas, separadores, imágenes con pie y vídeos incrustados. Se descartan menús, cookies y pies de página.
- La selección también se guarda con formato.
- Vídeos: se inserta el reproductor de YouTube (video block) y de Vimeo, Dailymotion, TikTok, Twitch, Loom, TED, Streamable y páginas con `og:video`.
- Instagram: se descarga la imagen de la publicación y se sube a Notion, con su texto.
- La captura de pantalla se ve también dentro del documento, además de en «Archivos adjuntos».
- Preselección de Tipo/Origen según el contenido cuando existen esas opciones en Notion.
- Mensajes de progreso durante el guardado.

### Corregido
- Duplicados: se detectan aunque cambie `www`, `http/https`, la barra final, el `#ancla` o parámetros de seguimiento; YouTube e Instagram se comparan por identificador.
- La selección desde el menú contextual conserva los saltos de línea.
- Páginas largas: lotes de hasta 100 bloques, pausa entre peticiones y reintento automático si Notion responde 429 o 5xx. Si Notion rechaza una imagen o un vídeo, se guarda como enlace en vez de fallar.
- Enlaces `mailto:` u otros no web: mensaje claro en lugar de «No se ha podido conectar».
- Los recortes temporales se borran de la memoria de sesión al abrirse.
- Textos que mencionaban «Documentos · Base maestra» ahora hablan de «Biblioteca DB».

## 0.1.0
- Primera versión (generada con ChatGPT), probada con API simulada.
