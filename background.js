// Biblioteca · service worker (Manifest V3).
async function extract(tabId) {
  const [{result}] = await chrome.scripting.executeScript({target:{tabId}, files:["extractor.js"]});
  if (!result) throw Error("No se ha podido leer la página.");
  return result;
}

const MENUS = [
  ["page", "Guardar página en Biblioteca", ["page"]],
  ["selection", "Guardar texto seleccionado en Biblioteca", ["selection"]],
  ["link", "Guardar enlace en Biblioteca", ["link"]],
  ["video", "Guardar página del vídeo en Biblioteca", ["video"]]
];

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  for (const [id, title, contexts] of MENUS) chrome.contextMenus.create({id, title, contexts});
});

async function openClipWindow(entry) {
  const id = crypto.randomUUID();
  await chrome.storage.session.set({["clip:" + id]:entry});
  await chrome.windows.create({url:chrome.runtime.getURL("clip.html?id=" + id), type:"popup", width:500, height:780});
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === "link") {
      // Un enlace a otra página: no se lee la página actual.
      const url = info.linkUrl || "";
      const entry = {title:"", url, mode:"link", tabId:tab.id, windowId:tab.windowId, fromLink:true};
      if (!/^https?:/i.test(url)) entry.error = "Ese enlace no es una dirección web (" + url.split(":")[0] + ":). Solo se pueden guardar enlaces http o https.";
      await openClipWindow(entry);
      return;
    }
    const source = await extract(tab.id).catch(() => ({title:tab.title, url:tab.url, selection:"", text:"", blocks:[], selectionBlocks:[], meta:{}}));
    const mode = info.menuItemId === "selection" ? "selection" : info.menuItemId === "page" ? "article" : "link";
    // Se conserva la selección leída en la página (mantiene saltos de línea y formato);
    // el texto del menú contextual solo se usa si no se pudo leer la página.
    if (mode === "selection" && !source.selection?.trim()) source.selection = info.selectionText || "";
    await openClipWindow({...source, mode, tabId:tab.id, windowId:tab.windowId});
  } catch (e) { console.warn("No se ha podido iniciar el recorte:", e.message); }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg.kind === "extract") extract(msg.tabId).then(reply).catch((e) => reply({error:e.message}));
  else if (msg.kind === "screenshot") {
    (async () => {
      const [active] = await chrome.tabs.query({active:true, windowId:msg.windowId});
      if (active?.id !== msg.tabId) throw Error("Vuelve a la pestaña original antes de hacer la captura.");
      return {data:await chrome.tabs.captureVisibleTab(msg.windowId, {format:"jpeg", quality:85})};
    })().then(reply).catch((e) => reply({error:e.message}));
  } else return;
  return true;
});
