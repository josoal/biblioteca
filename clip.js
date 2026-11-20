import {readConfig,getSchema,saveClip,updateClip,checkDuplicate,FIELD,cleanUrl,detectMedia,pickOption,richBlocks} from "./notion.js";
const $ = (id) => document.getElementById(id);
let source = {}, config = {}, schema = {}, screenshot = null, override = false, contentEdited = false;
let known = [], updateTarget = null, dupTimer = 0, dupSeq = 0, existingTags = [], tags = [];

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
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const el = (tag, props = {}, ...children) => { const e = Object.assign(document.createElement(tag), props); e.append(...children); return e; };

// ---------- Etiquetas: existentes o nuevas (Notion crea las nuevas al guardar) ----------
function renderTags() {
  const box = $("tagChips"); box.replaceChildren();
  for (const t of tags) {
    const isNew = !existingTags.some((x) => fold(x) === fold(t));
    const remove = el("button", {type:"button", className:"chip-x", title:"Quitar", textContent:"×"});
    remove.addEventListener("click", () => { tags = tags.filter((x) => x !== t); renderTags(); });
    box.append(el("span", {className:"tag" + (isNew ? " new" : "")}, t, ...(isNew ? [el("small", {textContent:"nueva"})] : []), remove));
  }
}
function addTag(raw) {
  for (let name of String(raw).split(",")) {
    name = name.trim().replace(/\s+/g, " ").slice(0, 100);
    if (!name) continue;
    const existing = existingTags.find((x) => fold(x) === fold(name));
    if (existing) name = existing; // respeta la forma ya usada en Notion
    if (!tags.some((x) => fold(x) === fold(name))) tags.push(name);
  }
  renderTags();
}
$("tags").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag($("tags").value); $("tags").value = ""; }
  else if (e.key === "Backspace" && !$("tags").value && tags.length) { tags.pop(); renderTags(); }
});
$("tags").addEventListener("input", () => {
  // Al elegir una sugerencia de la lista, se añade directamente.
  const v = $("tags").value;
  if (v.includes(",") || existingTags.includes(v)) { addTag(v); $("tags").value = ""; }
});
$("tags").addEventListener("blur", () => { if ($("tags").value.trim()) { addTag($("tags").value); $("tags").value = ""; } });

// ---------- Contenido ----------
function summarize(blocks) {
  const n = {texto:0, títulos:0, imágenes:0, tablas:0, vídeos:0, código:0};
  for (const b of blocks || []) {
    if (b.t === "img") n.imágenes++; else if (b.t === "table") n.tablas++; else if (b.t === "embed" || b.t === "video") n.vídeos++;
    else if (/^h\d$/.test(b.t)) n.títulos++; else if (b.t === "code") n.código++; else n.texto++;
  }
  return [[n.texto, "bloques de texto"], [n.títulos, "títulos"], [n.imágenes, "imágenes"], [n.tablas, "tablas"], [n.vídeos, "vídeos"], [n.código, "bloques de código"]].filter(([v]) => v).map(([v, l]) => v + " " + l).join(" · ");
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

// ---------- ¿Ya está guardada? ¿Guardar otra vez o actualizar? ----------
function saveLabel() {
  $("save").textContent = updateTarget ? "Actualizar el documento existente" : known.length ? "Guardar como documento nuevo" : "Guardar en Notion";
  $("save").classList.toggle("update", !!updateTarget);
}
function chooseUpdate(doc) {
  updateTarget = doc;
  for (const row of $("already").querySelectorAll(".dup-row")) row.classList.toggle("selected", row.dataset.id === doc?.id);
  for (const b of $("already").querySelectorAll(".dup-row button")) b.textContent = b.closest(".dup-row").dataset.id === doc?.id ? "✓ Se actualizará" : "Actualizar este";
  saveLabel();
}
function showKnown(list, checking = false, error = "") {
  const box = $("already");
  box.replaceChildren(); box.hidden = false;
  known = list || [];
  if (!known.some((d) => d.id === updateTarget?.id)) updateTarget = null;
  if (checking) { box.className = "banner checking"; box.textContent = "Comprobando si ya está en tu Biblioteca…"; saveLabel(); return; }
  if (error) { box.className = "banner neutral"; box.textContent = "No se ha podido comprobar si ya estaba guardada. " + error; saveLabel(); return; }
  if (!known.length) { box.className = "banner fresh"; box.textContent = "✓ Nueva: todavía no está en tu Biblioteca."; saveLabel(); return; }
  box.className = "banner saved";
  box.append(el("strong", {textContent:known.length === 1 ? "★ Ya está guardada en tu Biblioteca" : `★ Ya está guardada ${known.length} veces en tu Biblioteca`}));
  for (const d of known) {
    const a = el("a", {href:d.url, target:"_blank", rel:"noopener noreferrer", textContent:d.title + (d.created ? " · " + fmtDate(d.created) : "") + " ↗"});
    const b = el("button", {type:"button", textContent:"Actualizar este"});
    b.addEventListener("click", () => chooseUpdate(updateTarget?.id === d.id ? null : d));
    const row = el("div", {className:"dup-row"}, a, b); row.dataset.id = d.id;
    box.append(row);
  }
  box.append(el("small", {className:"hint", textContent:"Actualizar añade lo nuevo al final del documento y completa sus propiedades, sin borrar nada."}));
  chooseUpdate(updateTarget);
}
async function checkKnown(url) {
  const seq = ++dupSeq;
  let clean;
  try { clean = cleanUrl(url); } catch { $("already").hidden = true; return; }
  showKnown([], true);
  try { const list = await checkDuplicate(config.token, config.sourceId, clean); if (seq === dupSeq) showKnown(list); }
  catch (e) { if (seq === dupSeq) showKnown([], false, e.message); }
}

// ---------- Medios, icono y cabecera ----------
const samePage = () => { try { return cleanUrl(source.url) === cleanUrl($("url").value); } catch { return false; } };
function currentMedia() {
  let url = "";
  try { url = cleanUrl($("url").value); } catch { return null; }
  return detectMedia(url, samePage() ? source.meta || {} : {});
}
function updateMedia() {
  const media = currentMedia(), box = $("media");
  box.hidden = !media;
  if (media) box.textContent = media.kind === "youtube" ? "🎬 Se insertará el vídeo de YouTube en el documento."
    : media.kind === "video" ? "🎬 Se insertará el vídeo en el documento."
    : media.image ? "🖼️ Se guardará la imagen de la publicación de Instagram." : "🖼️ Instagram: abre la publicación para poder guardar su imagen.";
  // Vista previa del icono y la cabecera que tendrá la página en Notion.
  const icon = samePage() ? source.meta?.icon : "", cover = samePage() ? source.meta?.image : "";
  $("look").hidden = !icon && !cover;
  $("lookIcon").hidden = !icon; if (icon) $("lookIcon").src = icon;
  $("lookCover").hidden = !cover; if (cover) $("lookCover").src = cover;
  $("lookText").textContent = icon && cover ? "Icono y cabecera de la página en Notion" : icon ? "Icono de la página en Notion" : "Cabecera de la página en Notion";
}
$("lookIcon").addEventListener("error", () => { $("lookIcon").hidden = true; });
$("lookCover").addEventListener("error", () => { $("lookCover").hidden = true; });

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
document.querySelectorAll('input[name="mode"]').forEach((x) => x.addEventListener("change", updateContent));
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
  override = false; known = []; updateTarget = null; saveLabel(); $("duplicate").hidden = true; updateMedia();
  clearTimeout(dupTimer); dupTimer = setTimeout(() => checkKnown($("url").value), 700);
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if ($("tags").value.trim()) { addTag($("tags").value); $("tags").value = ""; }
  const save = $("save"); save.disabled = true; status("Guardando…"); $("openPage").hidden = true;
  try {
    const url = cleanUrl($("url").value), same = samePage(), m = mode();
    const data = {
      title:$("title").value, url, mode:m, content:$("content").value, contentEdited,
      selectionBlocks:same ? source.selectionBlocks : [], pageBlocks:same ? source.blocks : [],
      media:currentMedia(), description:same ? source.meta?.description || "" : "",
      icon:same ? source.meta?.icon || "" : "", cover:same ? source.meta?.image || "" : "", useLook:$("useLook").checked,
      notes:$("notes").value, type:$("type").value, category:$("category").value, status:$("status").value,
      project:chosen("project"), origin:chosen("origin"), tags:[...tags], screenshot,
      // Si el aviso de arriba ya mostraba que estaba guardada, «Guardar como documento nuevo» es intencionado.
      allowDuplicate:override || known.length > 0
    };
    if (m !== "link" && !data.content.trim() && !(data.pageBlocks?.length || data.selectionBlocks?.length)) throw Error("No hay texto para guardar. Selecciona texto o cambia a Enlace.");
    const progress = (s) => status(s);
    const result = updateTarget ? await updateClip(config.token, config.sourceId, updateTarget.id, data, progress) : await saveClip(config.token, config.sourceId, data, progress);
    if (result.duplicate) {
      const box = $("duplicate"); box.replaceChildren();
      box.append(el("p", {textContent:"Ya hay un registro con esta dirección. Puedes actualizarlo o guardar otro intencionadamente."}));
      for (const d of result.duplicate) box.append(el("a", {href:d.url, target:"_blank", rel:"noopener noreferrer", textContent:d.title}));
      const upd = el("button", {type:"button", textContent:"Actualizar el existente"});
      upd.addEventListener("click", () => { box.hidden = true; chooseUpdate(result.duplicate[0]); $("form").requestSubmit(); });
      const again = el("button", {type:"button", textContent:"Guardar otro nuevo"});
      again.addEventListener("click", () => { override = true; box.hidden = true; $("form").requestSubmit(); });
      box.append(el("div", {className:"actions"}, upd, again)); box.hidden = false; showKnown(result.duplicate);
      status("No se ha creado ningún duplicado.", "error"); return;
    }
    $("duplicate").hidden = true; $("openPage").href = result.page.url; $("openPage").hidden = false; save.hidden = true;
    const extra = result.warnings?.length ? "\n" + result.warnings.join("\n") : "";
    const done = result.updated ? "¡Documento actualizado!" : "¡Documento guardado correctamente!";
    if (result.partial) status((result.updated ? "Documento actualizado" : "Documento creado") + ", pero no se pudo añadir todo el contenido. Abre el documento para comprobarlo. " + result.message + extra, "error");
    else status(done + extra, "good");
    const list = result.updated ? known : [{id:result.page.id, title:$("title").value, url:result.page.url, created:new Date().toISOString()}, ...known];
    updateTarget = null; showKnown(list);
    $("already").querySelectorAll(".dup-row button, .hint").forEach((x) => x.remove());
    $("already").firstChild.textContent = result.updated ? "★ Actualizada en tu Biblioteca" : "★ Guardada en tu Biblioteca";
    existingTags = [...new Set([...existingTags, ...tags])]; renderTags();
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
    existingTags = opts(FIELD.tags, "multi_select");
    for (const tag of existingTags) $("tagOptions").append(new Option(tag, tag));
    setMode(initial);
    updateMedia();
    $("connection").textContent = "Conectado a Notion";
    $("form").hidden = false;
  } catch (e) { $("connection").textContent = "No se ha podido conectar"; status(e.message, "error"); $("unconfigured").hidden = false; }
}
init();
