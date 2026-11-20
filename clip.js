import {readConfig,getSchema,saveClip,checkDuplicate,FIELD,cleanUrl,detectMedia,pickOption,richBlocks} from "./notion.js";
const $ = (id) => document.getElementById(id);
let source = {}, config = {}, schema = {}, screenshot = null, override = false, contentEdited = false, known = [], dupTimer = 0, dupSeq = 0;

const status = (s, kind = "") => { $("message").textContent = s; $("message").className = "status " + kind; };
const options = (id, list, value) => { $(id).replaceChildren(); for (const v of list) $(id).add(new Option(v || "Sin asignar", v)); $(id).value = value || ""; };
function checks(id, list, initial = []) {
  $(id).replaceChildren();
  for (const v of list) {
    const label = document.createElement("label"), c = document.createElement("input");
    c.type = "checkbox"; c.value = v; c.checked = initial.includes(v);
    label.append(c, document.createTextNode(v)); $(id).append(label);
  }
}
const chosen = (id) => [...$(id).querySelectorAll("input:checked")].map((x) => x.value);
const opts = (key, type) => (schema[key]?.[type]?.options || []).map((x) => x.name);
const mode = () => document.querySelector('input[name="mode"]:checked').value;
function setMode(v) { const el = document.querySelector(`input[name="mode"][value="${v}"]`); if (el) el.checked = true; updateContent(); }
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("es-ES", {day:"numeric", month:"short", year:"numeric"}); } catch { return ""; } };

// ---------- Contenido ----------
function summarize(blocks) {
  const n = {texto:0, títulos:0, imágenes:0, tablas:0, vídeos:0, código:0};
  for (const b of blocks || []) {
    if (b.t === "img") n.imágenes++; else if (b.t === "table") n.tablas++; else if (b.t === "embed" || b.t === "video") n.vídeos++;
    else if (/^h\d$/.test(b.t)) n.títulos++; else if (b.t === "code") n.código++; else n.texto++;
  }
  const parts = [[n.texto, "bloques de texto"], [n.títulos, "títulos"], [n.imágenes, "imágenes"], [n.tablas, "tablas"], [n.vídeos, "vídeos"], [n.código, "bloques de código"]].filter(([v]) => v).map(([v, l]) => v + " " + l);
  return parts.join(" · ");
}
function updateContent() {
  const m = mode();
  contentEdited = false;
  $("contentField").hidden = m === "link";
  $("content").value = m === "selection" ? source.selection || "" : m === "article" ? source.text || "" : "";
  const rich = m === "selection" ? source.selectionBlocks : m === "article" ? source.blocks : [];
  const ok = richBlocks(rich).length > 0;
  $("summary").textContent = ok ? "Se guardará con formato: " + summarize(rich) + ". Si editas el texto, se guardará sin formato." : m === "article" ? "Se guardará como texto." : "";
  updateCount();
}
function updateCount() { $("count").textContent = $("content").value.length.toLocaleString("es-ES") + " caracteres"; }

// ---------- ¿Ya está guardada? ----------
function showKnown(list, checking = false, error = "") {
  const box = $("already");
  box.replaceChildren(); box.hidden = false;
  known = list || [];
  if (checking) { box.className = "banner checking"; box.textContent = "Comprobando si ya está en tu Biblioteca…"; return; }
  if (error) { box.className = "banner neutral"; box.textContent = "No se ha podido comprobar si ya estaba guardada. " + error; return; }
  if (!known.length) { box.className = "banner fresh"; box.textContent = "✓ Nueva: todavía no está en tu Biblioteca."; $("save").textContent = "Guardar en Notion"; return; }
  box.className = "banner saved";
  const strong = document.createElement("strong");
  strong.textContent = known.length === 1 ? "★ Ya está guardada en tu Biblioteca" : `★ Ya está guardada ${known.length} veces en tu Biblioteca`;
  box.append(strong);
  for (const d of known) {
    const a = document.createElement("a");
    a.href = d.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = d.title + (d.created ? " · " + fmtDate(d.created) : "") + " ↗";
    box.append(a);
  }
  $("save").textContent = "Guardar otra vez";
}
async function checkKnown(url) {
  const seq = ++dupSeq;
  let clean;
  try { clean = cleanUrl(url); } catch { $("already").hidden = true; return; }
  showKnown([], true);
  try { const list = await checkDuplicate(config.token, config.sourceId, clean); if (seq === dupSeq) showKnown(list); }
  catch (e) { if (seq === dupSeq) showKnown([], false, e.message); }
}

// ---------- Medios ----------
function currentMedia() {
  let url = "";
  try { url = cleanUrl($("url").value); } catch { return null; }
  const sameAsPage = (() => { try { return cleanUrl(source.url) === url; } catch { return false; } })();
  return detectMedia(url, sameAsPage ? source.meta || {} : {});
}
function updateMedia() {
  const media = currentMedia(), box = $("media");
  box.hidden = !media;
  if (!media) return;
  box.textContent = media.kind === "youtube" ? "🎬 Se insertará el vídeo de YouTube en el documento."
    : media.kind === "video" ? "🎬 Se insertará el vídeo en el documento."
    : media.image ? "🖼️ Se guardará la imagen de la publicación de Instagram." : "🖼️ Instagram: abre la publicación para poder guardar su imagen.";
}

// ---------- Carga ----------
async function loadSource() {
  const id = new URLSearchParams(location.search).get("id");
  if (id) {
    const key = "clip:" + id;
    const entry = (await chrome.storage.session.get(key))[key];
    if (!entry) throw Error("La captura ya no está disponible. Vuelve a iniciarla desde la página web.");
    chrome.storage.session.remove(key); // no se acumulan recortes en memoria
    return entry;
  }
  const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
  if (!tab?.url || !/^https?:/.test(tab.url)) throw Error("Abre una página web antes de usar la extensión.");
  const response = await chrome.runtime.sendMessage({kind:"extract", tabId:tab.id}).catch(() => null);
  return {...(response?.error ? {} : response), title:response?.title || tab.title, url:response?.url || tab.url, tabId:tab.id, windowId:tab.windowId};
}

function openSettings() { chrome.runtime.openOptionsPage(); }
$("settings").addEventListener("click", openSettings);
$("configure").addEventListener("click", openSettings);
document.querySelectorAll('input[name="mode"]').forEach((el) => el.addEventListener("change", updateContent));
$("content").addEventListener("input", () => { contentEdited = true; updateCount(); });
$("capture").addEventListener("click", async () => {
  $("capture").disabled = true;
  try {
    const r = await chrome.runtime.sendMessage({kind:"screenshot", tabId:source.tabId, windowId:source.windowId});
    if (r?.error) throw Error(r.error);
    screenshot = r.data; $("screenshotPreview").src = screenshot; $("screenshotPreview").hidden = false; $("remove").hidden = false;
    status("Captura preparada. Se subirá al guardar.");
  } catch (e) { status(e.message, "error"); } finally { $("capture").disabled = false; }
});
$("remove").addEventListener("click", () => { screenshot = null; $("screenshotPreview").removeAttribute("src"); $("screenshotPreview").hidden = true; $("remove").hidden = true; });
$("url").addEventListener("input", () => {
  override = false; known = []; $("save").textContent = "Guardar en Notion"; $("duplicate").hidden = true; updateMedia();
  clearTimeout(dupTimer); dupTimer = setTimeout(() => checkKnown($("url").value), 700);
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const save = $("save"); save.disabled = true; status("Guardando…"); $("openPage").hidden = true;
  try {
    const tags = $("tags").value.split(",").map((x) => x.trim()).filter(Boolean);
    const url = cleanUrl($("url").value);
    const sameAsPage = (() => { try { return cleanUrl(source.url) === url; } catch { return false; } })();
    const m = mode();
    const data = {
      title:$("title").value, url, mode:m, content:$("content").value, contentEdited,
      selectionBlocks:sameAsPage ? source.selectionBlocks : [], pageBlocks:sameAsPage ? source.blocks : [],
      media:currentMedia(), description:sameAsPage ? source.meta?.description || "" : "",
      notes:$("notes").value, type:$("type").value, category:$("category").value, status:$("status").value,
      project:chosen("project"), origin:chosen("origin"), tags, screenshot,
      // Si el aviso de arriba ya mostraba que estaba guardada, pulsar «Guardar otra vez» es intencionado.
      allowDuplicate:override || known.length > 0
    };
    if (m !== "link" && !data.content.trim() && !(data.pageBlocks?.length || data.selectionBlocks?.length)) throw Error("No hay texto para guardar. Selecciona texto o cambia a Enlace.");
    const result = await saveClip(config.token, config.sourceId, data, (s) => status(s));
    if (result.duplicate) {
      const box = $("duplicate"); box.replaceChildren();
      const p = document.createElement("p"); p.textContent = "Ya hay un registro con esta dirección. Puedes abrirlo o guardar otro intencionadamente."; box.append(p);
      for (const d of result.duplicate) { const a = document.createElement("a"); a.href = d.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = d.title; box.append(a); }
      const b = document.createElement("button"); b.type = "button"; b.textContent = "Guardar de todos modos";
      b.addEventListener("click", () => { override = true; box.hidden = true; $("form").requestSubmit(); });
      box.append(b); box.hidden = false; showKnown(result.duplicate);
      status("No se ha creado ningún duplicado.", "error"); return;
    }
    $("duplicate").hidden = true; $("openPage").href = result.page.url; $("openPage").hidden = false; save.hidden = true;
    const extra = result.warnings?.length ? "\n" + result.warnings.join("\n") : "";
    if (result.partial) status("Documento creado, pero no se pudo añadir todo el contenido. Abre el documento para comprobarlo. " + result.message + extra, "error");
    else status("¡Documento guardado correctamente!" + extra, "good");
    showKnown([{title:$("title").value, url:result.page.url, created:new Date().toISOString()}, ...known]);
    $("already").firstChild.textContent = "★ Guardada en tu Biblioteca";
  } catch (e) { status(e.message, "error"); } finally { save.disabled = false; }
});

async function init() {
  try {
    config = await readConfig();
    if (!config.token) { $("connection").textContent = "Sin conectar"; $("unconfigured").hidden = false; return; }
    [source, schema] = await Promise.all([loadSource(), getSchema(config.token, config.sourceId)]);
    if (source.error) { $("connection").textContent = "Conectado a Notion"; status(source.error, "error"); return; }
    let url;
    try { url = cleanUrl(source.url); } catch (e) { $("connection").textContent = "Conectado a Notion"; status(e.message, "error"); return; }
    $("title").value = source.title || source.meta?.ogTitle || (source.fromLink ? url : "");
    $("url").value = url;
    checkKnown(url); // en paralelo, mientras se rellena el formulario

    const media = detectMedia(url, source.meta || {});
    const types = opts(FIELD.type, "select"), categories = opts(FIELD.category, "select"), statuses = opts(FIELD.status, "status");
    const initial = source.mode || (source.selection?.trim() ? "selection" : "link");
    const defaultType = media?.kind === "youtube" || media?.kind === "video" ? pickOption(types, "Vídeo", "Video", "Enlace")
      : media?.kind === "instagram" ? pickOption(types, "Imagen", "Publicación", "Red social", "Enlace")
      : initial === "selection" ? pickOption(types, "Anotación", "Cita")
      : initial === "article" ? pickOption(types, "Artículo", "Investigación")
      : pickOption(types, "Enlace");
    options("type", ["", ...types], defaultType);
    options("category", ["", ...categories], "");
    options("status", ["", ...statuses], pickOption(statuses, "Pendiente de revisar"));
    checks("project", opts(FIELD.project, "multi_select"));
    const origins = opts(FIELD.origin, "multi_select");
    const origin = media?.kind === "youtube" ? pickOption(origins, "YouTube", "Web") : media?.kind === "instagram" ? pickOption(origins, "Instagram", "Web") : pickOption(origins, "Web");
    checks("origin", origins, origin ? [origin] : []);
    for (const tag of opts(FIELD.tags, "multi_select")) $("tagOptions").append(new Option(tag, tag));
    setMode(initial);
    updateMedia();
    $("connection").textContent = "Conectado a Notion";
    $("form").hidden = false;
  } catch (e) { $("connection").textContent = "No se ha podido conectar"; status(e.message, "error"); $("unconfigured").hidden = false; }
}
init();
