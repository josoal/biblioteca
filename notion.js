// Biblioteca · comunicación con la API de Notion y conversión a bloques.
export const DEFAULT_SOURCE = "41e5580d-8c90-81bc-8a73-000b8e632220";
export const DEFAULT_DB = "41e5580d-8c90-81e7-ac28-cfc034efd8b0";
export const DB_LINK = "https://app.notion.com/p/41e5580d8c9081e7ac28cfc034efd8b0";
export const NOTION_VERSION = "2026-03-11";
export const FIELD = Object.freeze({title:"Título",type:"Tipo",category:"Categoría",project:"Proyecto",origin:"Origen",url:"Fuente original",tags:"Etiquetas",status:"Estado",files:"Archivos adjuntos"});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Identificadores y enlaces ----------
export function normalizeId(input) {
  const s = String(input || "").trim();
  const match = s.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})(?=[^0-9a-f]|$)/i);
  if (!match) throw Error("Introduce un identificador o enlace de Notion válido.");
  const v = match[1].replace(/-/g,"").toLowerCase();
  return [v.slice(0,8),v.slice(8,12),v.slice(12,16),v.slice(16,20),v.slice(20)].join("-");
}

const TRACKING = /^(utm_.*|fbclid|gclid|dclid|yclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|igsh|igshid|si|feature|ref_src|ref_url|spm|share_id|_ga|_gl|wt\.mc_id|cmpid|ocid)$/i;

export function isWebUrl(input) {
  try { return ["http:","https:"].includes(new URL(input).protocol); } catch { return false; }
}

export function youtubeId(url) {
  try {
    const u = new URL(url), h = u.hostname.replace(/^(www|m|music)\./, "");
    let id = "";
    if (h === "youtu.be") id = u.pathname.split("/")[1];
    else if (h === "youtube.com" || h === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
      else { const m = u.pathname.match(/^\/(shorts|live|embed|v)\/([\w-]{11})/); if (m) id = m[2]; }
    }
    return /^[\w-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
}
export const isYoutube = (url) => !!youtubeId(url);

export function instagramPost(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return "";
    const m = u.pathname.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
    return m ? m[2] : "";
  } catch { return ""; }
}

export function cleanUrl(input) {
  const u = new URL(String(input || "").trim());
  if (!["http:","https:"].includes(u.protocol)) throw Error("Solo se pueden guardar enlaces web (http o https).");
  u.username = ""; u.password = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  // Los anclajes (#sección) no cambian la página, salvo en webs con rutas #/ o #!.
  if (u.hash && !/^#[!/]/.test(u.hash)) u.hash = "";
  const yt = youtubeId(u.href);
  if (yt) {
    const y = new URL("https://www.youtube.com/watch");
    y.searchParams.set("v", yt);
    for (const k of ["t", "list"]) if (u.searchParams.get(k)) y.searchParams.set(k, u.searchParams.get(k));
    return y.href;
  }
  const ig = instagramPost(u.href);
  if (ig) { const kind = u.pathname.match(/\/(p|reel|reels|tv)\//)[1]; return `https://www.instagram.com/${kind === "reels" ? "reel" : kind}/${ig}/`; }
  return u.href;
}

// Variantes equivalentes de un enlace para detectar duplicados guardados con otra forma.
export function duplicateFilter(url) {
  const yt = youtubeId(url);
  if (yt) return {or:[`v=${yt}`, `youtu.be/${yt}`, `/shorts/${yt}`].map((c) => ({property:FIELD.url,url:{contains:c}}))};
  const ig = instagramPost(url);
  if (ig) return {or:[`/p/${ig}`, `/reel/${ig}`, `/reels/${ig}`, `/tv/${ig}`].map((c) => ({property:FIELD.url,url:{contains:c}}))};
  const u = new URL(url), set = new Set();
  const hosts = u.hostname.startsWith("www.") ? [u.hostname, u.hostname.slice(4)] : [u.hostname, "www." + u.hostname];
  const paths = u.pathname === "/" ? ["/"] : [u.pathname.replace(/\/$/, ""), u.pathname.replace(/\/?$/, "/")];
  for (const proto of ["https:", "http:"]) for (const host of hosts) for (const path of paths) {
    const v = new URL(url); v.protocol = proto; v.hostname = host; v.pathname = path;
    set.add(v.href);
    if (path === "/" && !v.search && !v.hash) set.add(v.href.replace(/\/$/, ""));
  }
  return {or:[...set].slice(0, 20).map((equals) => ({property:FIELD.url,url:{equals}}))};
}

// ---------- Vídeo e imágenes destacadas ----------
const VIDEO_HOSTS = /(^|\.)(vimeo\.com|dailymotion\.com|dai\.ly|tiktok\.com|twitch\.tv|loom\.com|ted\.com|streamable\.com|rumble\.com|facebook\.com|fb\.watch|bilibili\.com|wistia\.com)$/;
export function detectMedia(url, meta = {}) {
  if (isYoutube(url)) return {kind:"youtube", video:cleanUrl(url)};
  if (instagramPost(url)) return {kind:"instagram", image:meta.image || ""};
  let host = "";
  try { host = new URL(url).hostname; } catch {}
  const metaVideo = meta.video && isWebUrl(meta.video) ? meta.video : "";
  if (/\.(mp4|webm|mov)(\?|$)/i.test(metaVideo)) return {kind:"video", video:metaVideo, file:true};
  if (VIDEO_HOSTS.test(host) && (/^video/.test(meta.type || "") || metaVideo || /vimeo\.com\/\d|dailymotion\.com\/video|dai\.ly\/|tiktok\.com\/@[^/]+\/video|loom\.com\/share|streamable\.com\/\w|ted\.com\/talks|twitch\.tv\//.test(url))) return {kind:"video", embed:url};
  if (/^video/.test(meta.type || "") && metaVideo) return {kind:"video", embed:metaVideo};
  return null;
}

// ---------- Texto enriquecido ----------
export function chunks(text, size = 1800) {
  const chars = Array.from(String(text || "")); const res = [];
  for (let i = 0; i < chars.length; i += size) res.push(chars.slice(i, i + size).join(""));
  return res;
}
const rt = (content, link) => ({type:"text", text:{content, ...(link ? {link:{url:link}} : {})}});
function validLink(href) {
  if (!href || href.length > 1900) return "";
  try { const u = new URL(href); return ["http:","https:","mailto:"].includes(u.protocol) ? u.href : ""; } catch { return ""; }
}
// Convierte segmentos {text,b,i,u,s,c,href} al formato rich_text de Notion (máx. 2000 caracteres y 100 elementos).
export function richText(segments) {
  const out = [];
  for (const seg of segments || []) {
    const link = validLink(seg.href);
    for (const piece of chunks(seg.text, 1900)) {
      const item = rt(piece, link);
      const annotations = {};
      if (seg.b) annotations.bold = true;
      if (seg.i) annotations.italic = true;
      if (seg.u) annotations.underline = true;
      if (seg.s) annotations.strikethrough = true;
      if (seg.c) annotations.code = true;
      if (Object.keys(annotations).length) item.annotations = annotations;
      out.push(item);
    }
  }
  if (out.length <= 100) return out;
  const head = out.slice(0, 99);
  head.push(rt(out.slice(99).map((x) => x.text.content).join("").slice(0, 1900)));
  return head;
}
const plainRich = (text) => chunks(text, 1900).slice(0, 100).map((s) => rt(s));

// ---------- Bloques ----------
const block = (type, value) => ({object:"block", type, [type]:value});
const paragraph = (text) => block("paragraph", {rich_text:plainRich(text)});
const heading = (text, level = 2) => block("heading_" + level, {rich_text:plainRich(text)});
export const imageBlock = (url, caption = "") => block("image", {type:"external", external:{url}, ...(caption ? {caption:plainRich(caption.slice(0, 1900))} : {})});
export const uploadedImageBlock = (id, caption = "") => block("image", {type:"file_upload", file_upload:{id}, ...(caption ? {caption:plainRich(caption)} : {})});
export const videoBlock = (url) => block("video", {type:"external", external:{url}});
export const embedBlock = (url) => block("embed", {url});

const CODE_LANGS = {js:"javascript",javascript:"javascript",jsx:"javascript",ts:"typescript",typescript:"typescript",tsx:"typescript",py:"python",python:"python",sh:"shell",shell:"shell",bash:"bash",zsh:"shell",console:"shell",ps1:"powershell",powershell:"powershell",json:"json",html:"html",xml:"xml",css:"css",scss:"scss",sql:"sql",java:"java",kotlin:"kotlin",c:"c",cpp:"c++","c++":"c++",cs:"c#",csharp:"c#","c#":"c#",go:"go",rust:"rust",rs:"rust",php:"php",ruby:"ruby",rb:"ruby",swift:"swift",yaml:"yaml",yml:"yaml",md:"markdown",markdown:"markdown",r:"r",dart:"dart",lua:"lua",diff:"diff",docker:"docker",dockerfile:"docker",graphql:"graphql",latex:"latex",tex:"latex",vb:"visual basic",vba:"visual basic"};

// Convierte el formato intermedio de extractor.js en bloques de Notion.
export function richBlocks(items) {
  const out = [];
  for (const it of items || []) {
    switch (it.t) {
      case "h1": case "h2": case "h3": { const r = richText(it.r); if (r.length) out.push(block("heading_" + it.t[1], {rich_text:r})); break; }
      case "p": case "quote": case "ul": case "ol": {
        const type = {p:"paragraph", quote:"quote", ul:"bulleted_list_item", ol:"numbered_list_item"}[it.t];
        const r = richText(it.r); if (r.length) out.push(block(type, {rich_text:r})); break;
      }
      case "todo": { const r = richText(it.r); if (r.length) out.push(block("to_do", {rich_text:r, checked:!!it.checked})); break; }
      case "code": out.push(block("code", {rich_text:plainRich(it.text), language:CODE_LANGS[it.lang] || "plain text"})); break;
      case "hr": out.push(block("divider", {})); break;
      case "img": if (isWebUrl(it.src)) out.push(imageBlock(it.src, it.caption)); break;
      case "video": if (isWebUrl(it.src)) out.push(videoBlock(it.src)); break;
      case "embed": if (isWebUrl(it.src)) out.push(youtubeId(it.src) ? videoBlock(cleanUrl(it.src)) : embedBlock(it.src)); break;
      case "table": {
        const width = it.rows?.[0]?.length || 0;
        if (!width) break;
        const rows = it.rows.slice(0, 100).map((cells) => block("table_row", {cells:cells.slice(0, width).map((c) => richText(c))}));
        out.push(block("table", {table_width:width, has_column_header:!!it.header, has_row_header:false, children:rows}));
        break;
      }
    }
  }
  return out;
}

export function textBlocks(label, text) {
  if (!String(text || "").trim()) return [];
  const blocks = label ? [heading(label)] : [];
  for (const p of String(text).trim().split(/\n\s*\n/)) for (const c of chunks(p)) if (c.trim()) blocks.push(paragraph(c));
  return blocks;
}

// Cabecera de la página: fuente, medios, captura y anotaciones.
export function headerBlocks(data, uploads = {}) {
  const result = [];
  if (data.url) result.push(block("paragraph", {rich_text:[rt("Fuente original: "), rt(data.url.slice(0, 1800), data.url)]}));
  const media = data.media;
  if (media?.kind === "youtube") result.push(videoBlock(media.video));
  else if (media?.kind === "video") result.push(media.file ? videoBlock(media.video) : embedBlock(media.embed));
  else if (media?.kind === "instagram") {
    if (uploads.mediaImage) result.push(uploadedImageBlock(uploads.mediaImage));
    else if (media.image) result.push(imageBlock(media.image));
    if (data.description) result.push(...textBlocks("", data.description));
  }
  if (uploads.screenshotBlock) result.push(heading("Captura de pantalla", 3), uploadedImageBlock(uploads.screenshotBlock));
  result.push(...textBlocks("Anotaciones", data.notes));
  return result;
}

export function contentBlocks(data) {
  if (data.mode === "selection") {
    const rich = data.contentEdited ? [] : richBlocks(data.selectionBlocks);
    const body = rich.length ? rich : textBlocks("", data.content);
    return body.length ? [heading("Texto seleccionado"), ...body] : [];
  }
  if (data.mode === "article") {
    const rich = data.contentEdited ? [] : richBlocks(data.pageBlocks);
    const body = rich.length ? rich : textBlocks("", data.content);
    return body.length ? [heading("Contenido de la página"), ...body] : [];
  }
  return [];
}

export function makeBlocks(data, uploads = {}) {
  return [...headerBlocks(data, uploads), ...contentBlocks(data)];
}

// Divide los bloques en lotes que respetan los límites de Notion (100 bloques y ~500 KB por petición).
export function batches(blocks, max = 100, maxBytes = 350000) {
  const res = []; let cur = [], size = 0;
  for (const b of blocks) {
    const s = JSON.stringify(b).length;
    if (cur.length && (cur.length >= max || size + s > maxBytes)) { res.push(cur); cur = []; size = 0; }
    cur.push(b); size += s;
  }
  if (cur.length) res.push(cur);
  return res;
}

// Si Notion rechaza una imagen o un vídeo externo, se sustituye por un enlace.
export function mediaAsLinks(blocks) {
  return blocks.map((b) => {
    const url = b.type === "image" && b.image.type === "external" ? b.image.external.url
      : b.type === "video" && b.video.type === "external" ? b.video.external.url
      : b.type === "embed" ? b.embed.url : "";
    if (!url) return b;
    const label = b.type === "image" ? "Imagen: " : b.type === "video" ? "Vídeo: " : "Contenido incrustado: ";
    return block("paragraph", {rich_text:[rt(label), rt(url.slice(0, 1800), url.length <= 2000 ? url : undefined)]});
  });
}

export function makeProperties(data, schema, uploadId) {
  const p = {};
  const put = (key, type, value) => { if (schema[key]?.type === type) p[key] = {[type]:value}; };
  put(FIELD.title, "title", chunks(data.title.trim()).map((s) => rt(s)));
  put(FIELD.url, "url", data.url);
  for (const [k, v] of [[FIELD.type, data.type], [FIELD.category, data.category]]) if (v) put(k, "select", {name:v});
  if (data.status) put(FIELD.status, "status", {name:data.status});
  for (const [k, v] of [[FIELD.project, data.project], [FIELD.origin, data.origin], [FIELD.tags, data.tags]]) if (v?.length) put(k, "multi_select", [...new Set(v)].map((name) => ({name:name.replace(/,/g, " ").slice(0, 100)})));
  if (uploadId) put(FIELD.files, "files", [{name:"Captura.jpg", type:"file_upload", file_upload:{id:uploadId}}]);
  return p;
}

// Elige la opción existente que mejor encaja (sin distinguir mayúsculas ni tildes).
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export function pickOption(options, ...wanted) {
  for (const w of wanted) { const hit = options.find((o) => fold(o) === fold(w)); if (hit) return hit; }
  return "";
}

// ---------- API ----------
export async function api(token, path, method = "GET", body, tries = 4) {
  if (!token) throw Error("Falta conectar tu integración de Notion.");
  const headers = {Authorization:"Bearer " + token, "Notion-Version":NOTION_VERSION};
  const form = body instanceof FormData;
  if (body !== undefined && !form) headers["Content-Type"] = "application/json";
  for (let attempt = 1; ; attempt++) {
    const response = await fetch("https://api.notion.com/v1" + path, {method, headers, body:body === undefined ? undefined : form ? body : JSON.stringify(body)});
    const result = await response.json().catch(() => ({}));
    if (response.ok) return result;
    if ((response.status === 429 || response.status >= 500) && attempt < tries) {
      const wait = Number(response.headers.get("Retry-After"));
      await sleep(wait > 0 ? Math.min(wait, 30) * 1000 : 600 * attempt);
      continue;
    }
    const hints = {401:"Clave de Notion incorrecta o revocada.", 403:"La integración no tiene permisos suficientes.", 404:"Notion no encuentra la base de datos. Comprueba que la integración está conectada a «Biblioteca DB».", 429:"Notion ha limitado temporalmente las solicitudes. Espera un momento y vuelve a intentarlo."};
    const err = Error((hints[response.status] || "Error de Notion (" + response.status + ").") + " " + (result.message || ""));
    err.status = response.status;
    throw err;
  }
}

export async function readConfig() {
  const {token = "", sourceId = DEFAULT_SOURCE} = await chrome.storage.local.get(["token", "sourceId"]);
  return {token, sourceId};
}

export async function getSchema(token, id) {
  const source = await api(token, "/data_sources/" + normalizeId(id));
  const schema = source.properties || {};
  for (const [key, type] of [[FIELD.title,"title"],[FIELD.url,"url"],[FIELD.type,"select"],[FIELD.category,"select"],[FIELD.project,"multi_select"],[FIELD.origin,"multi_select"],[FIELD.tags,"multi_select"],[FIELD.status,"status"],[FIELD.files,"files"]]) {
    if (schema[key]?.type !== type) throw Error("Falta el campo «" + key + "» o tiene un tipo diferente al esperado.");
  }
  return schema;
}

export async function checkDuplicate(token, id, url) {
  const r = await api(token, "/data_sources/" + normalizeId(id) + "/query", "POST", {filter:duplicateFilter(cleanUrl(url)), sorts:[{timestamp:"created_time", direction:"descending"}], page_size:5});
  return (r.results || []).filter((x) => x.object === "page" && !x.in_trash && !x.archived).map((x) => ({
    id:x.id, url:x.url, created:x.created_time || "",
    title:x.properties?.[FIELD.title]?.title?.map((t) => t.plain_text || t.text?.content || "").join("") || "Documento existente"
  }));
}

export async function uploadFile(token, blob, filename) {
  if (blob.size > 20 * 1024 * 1024) throw Error("El archivo supera los 20 MB que admite la subida directa a Notion.");
  const upload = await api(token, "/file_uploads", "POST", {mode:"single_part", filename, content_type:blob.type});
  const form = new FormData(); form.append("file", blob, filename);
  const sent = await api(token, "/file_uploads/" + upload.id + "/send", "POST", form);
  if (sent.status !== "uploaded") throw Error("Notion no ha confirmado la subida de " + filename + ".");
  return upload.id;
}

export function dataUrlToBlob(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw Error("Formato de captura no válido.");
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new Blob([bytes], {type:m[1]});
}

// Descarga una imagen (p. ej. la de Instagram, cuyos enlaces caducan) para guardarla en Notion.
async function fetchImage(url) {
  const r = await fetch(url, {credentials:"omit"});
  if (!r.ok) throw Error("No se ha podido descargar la imagen (" + r.status + ").");
  const blob = await r.blob();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(blob.type)) throw Error("El archivo descargado no es una imagen compatible.");
  return blob;
}

async function appendAll(token, pageId, blocks, onProgress) {
  const groups = batches(blocks);
  for (let i = 0; i < groups.length; i++) {
    onProgress?.(`Añadiendo contenido (${i + 1} de ${groups.length})…`);
    try { await api(token, "/blocks/" + pageId + "/children", "PATCH", {children:groups[i]}); }
    catch (e) {
      if (e.status !== 400) throw e;
      // Algún medio externo no es válido para Notion: se reintenta con enlaces.
      await api(token, "/blocks/" + pageId + "/children", "PATCH", {children:mediaAsLinks(groups[i])});
    }
    if (i < groups.length - 1) await sleep(340); // Notion admite ~3 peticiones por segundo.
  }
}

export async function saveClip(token, id, data, onProgress) {
  id = normalizeId(id);
  if (!data.title?.trim()) throw Error("El título es obligatorio.");
  data.url = cleanUrl(data.url);
  if (data.url.length > 2000) throw Error("El enlace supera el máximo de Notion.");
  onProgress?.("Comprobando la base de datos…");
  const schema = await getSchema(token, id);
  if (!data.allowDuplicate) { const dup = await checkDuplicate(token, id, data.url); if (dup.length) return {duplicate:dup}; }

  const uploads = {}, warnings = [];
  if (data.screenshot) {
    onProgress?.("Subiendo la captura…");
    // Se sube dos veces: una para «Archivos adjuntos» y otra para verla dentro de la página.
    uploads.screenshotFile = await uploadFile(token, dataUrlToBlob(data.screenshot), "Captura.jpg");
    try { uploads.screenshotBlock = await uploadFile(token, dataUrlToBlob(data.screenshot), "Captura.jpg"); }
    catch { warnings.push("La captura está en Archivos adjuntos, pero no dentro de la página."); }
  }
  if (data.media?.kind === "instagram" && data.media.image) {
    onProgress?.("Guardando la imagen de Instagram…");
    try {
      const blob = await fetchImage(data.media.image);
      const ext = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1];
      uploads.mediaImage = await uploadFile(token, blob, "Instagram." + ext);
    } catch (e) { warnings.push("La imagen de Instagram se ha enlazado, no copiado (" + e.message + "). Ese enlace puede caducar."); }
  }

  const head = headerBlocks(data, uploads);
  const body = contentBlocks(data);
  const properties = makeProperties(data, schema, uploads.screenshotFile);
  onProgress?.("Creando el documento…");
  const parent = {type:"data_source_id", data_source_id:id};
  let page;
  try { page = await api(token, "/pages", "POST", {parent, properties, children:head}); }
  catch (e) {
    if (e.status !== 400 || !head.length) throw e;
    page = await api(token, "/pages", "POST", {parent, properties, children:mediaAsLinks(head)});
    warnings.push("Notion no aceptó un vídeo o una imagen; se ha guardado como enlace.");
  }
  try { await appendAll(token, page.id, body, onProgress); }
  catch (e) { return {page:{id:page.id, url:page.url}, partial:true, message:e.message, warnings}; }
  return {page:{id:page.id, url:page.url}, warnings};
}
