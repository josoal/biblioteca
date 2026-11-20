// Biblioteca · extractor de contenido.
// Se inyecta en la pestaña con chrome.scripting.executeScript({files:["extractor.js"]}).
// No usa módulos ni dependencias: el valor de la última expresión es el resultado.
// Devuelve un formato intermedio sencillo que notion.js convierte en bloques de Notion.
(() => {
  const MAX_BLOCKS = 1500;
  const SKIP = new Set(["SCRIPT","STYLE","NOSCRIPT","TEMPLATE","NAV","FOOTER","ASIDE","FORM","BUTTON","INPUT","SELECT","TEXTAREA","LABEL","SVG","CANVAS","OBJECT","DIALOG","MENU"]);
  const NOISE = /(^|[\s_-])(nav|menu|breadcrumb|share|social|related|recommend|newsletter|subscribe|cookie|consent|banner|advert|ads?|promo|sidebar|comments?|footer|popup|modal|paywall|sponsor)([\s_-]|$)/i;
  const abs = (u) => { try { const x = new URL(u, document.baseURI); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
  const meta = (...names) => {
    for (const n of names) {
      const el = document.querySelector(`meta[property="${n}"],meta[name="${n}"]`);
      if (el?.content) return el.content.trim();
    }
    return "";
  };

  function hidden(el) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
    if (!el.isConnected) return false; // fragmentos de una selección
    const s = getComputedStyle(el);
    return s.display === "none" || s.visibility === "hidden";
  }
  function noisy(el) {
    if (el.tagName === "HEADER" && !el.closest("article")) return true;
    const role = el.getAttribute("role");
    if (role && /^(navigation|banner|contentinfo|complementary|search|dialog)$/.test(role)) return true;
    const id = (el.id || "") + " " + (typeof el.className === "string" ? el.className : "");
    return id.length < 200 && NOISE.test(id) && el.querySelectorAll("p").length < 3;
  }

  // ---- Texto enriquecido ----
  function inline(node, marks, out) {
    if (node.nodeType === 3) {
      const text = node.nodeValue.replace(/\s+/g, " ");
      if (text) out.push({ text, ...marks });
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node, tag = el.tagName;
    if (SKIP.has(tag)) return;
    if (el.isConnected && hidden(el)) return;
    if (tag === "BR") { out.push({ text: "\n", ...marks }); return; }
    if (tag === "IMG") return;
    const m = { ...marks };
    if (tag === "B" || tag === "STRONG") m.b = true;
    if (tag === "I" || tag === "EM" || tag === "CITE") m.i = true;
    if (tag === "U" || tag === "INS") m.u = true;
    if (tag === "S" || tag === "DEL" || tag === "STRIKE") m.s = true;
    if (tag === "CODE" || tag === "KBD" || tag === "SAMP") m.c = true;
    if (tag === "A") { const h = el.getAttribute("href"); const u = h && !h.startsWith("#") ? abs(h) : ""; if (u) m.href = u; }
    for (const c of el.childNodes) inline(c, m, out);
  }
  function tidy(rich) {
    const res = [];
    for (const r of rich) {
      const last = res[res.length - 1];
      if (last && last.b === r.b && last.i === r.i && last.u === r.u && last.s === r.s && last.c === r.c && last.href === r.href) last.text += r.text;
      else res.push({ ...r });
    }
    if (res.length) { res[0].text = res[0].text.replace(/^\s+/, ""); res[res.length - 1].text = res[res.length - 1].text.replace(/\s+$/, ""); }
    for (const r of res) r.text = r.text.replace(/ *\n */g, "\n").replace(/ {2,}/g, " ");
    return res.filter((r) => r.text);
  }
  const richOf = (el) => { const o = []; inline(el, {}, o); return tidy(o); };
  const plain = (rich) => rich.map((r) => r.text).join("");

  // ---- Bloques ----
  const blocks = [];
  const push = (b) => { if (blocks.length < MAX_BLOCKS) blocks.push(b); };
  const BLOCK_TAGS = new Set(["P","DIV","SECTION","ARTICLE","MAIN","HEADER","H1","H2","H3","H4","H5","H6","UL","OL","LI","BLOCKQUOTE","PRE","TABLE","FIGURE","HR","IMG","PICTURE","IFRAME","VIDEO","DL","DT","DD","DETAILS","SUMMARY","CENTER","ADDRESS","FIGCAPTION"]);

  function bestImage(img) {
    const cand = [];
    const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
    for (const part of srcset.split(",")) {
      const [u, w] = part.trim().split(/\s+/);
      if (u) cand.push([abs(u), parseFloat(w) || 1]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    const lazy = img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || img.getAttribute("data-original");
    return (cand[0]?.[0]) || abs(img.currentSrc || "") || abs(lazy || "") || abs(img.getAttribute("src") || "");
  }
  function image(img, caption) {
    const w = Math.max(img.naturalWidth || 0, img.width || 0, parseInt(img.getAttribute("width")) || 0);
    const h = Math.max(img.naturalHeight || 0, img.height || 0, parseInt(img.getAttribute("height")) || 0);
    if ((w && w < 48) || (h && h < 48)) return; // iconos, píxeles de seguimiento
    const src = bestImage(img);
    if (!src || src.length > 1900) return;
    push({ t: "img", src, caption: caption || (img.alt || "").trim().slice(0, 300) });
  }
  function frame(el) {
    const src = abs(el.getAttribute("src") || el.getAttribute("data-src") || "");
    if (!src) return;
    if (/(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|dailymotion\.com|tiktok\.com|twitch\.tv|loom\.com|ted\.com|spotify\.com|soundcloud\.com|google\.com\/maps|codepen\.io|figma\.com)/.test(src)) push({ t: "embed", src });
  }
  function table(el) {
    const rows = [];
    let header = false;
    for (const tr of el.querySelectorAll("tr")) {
      if (tr.closest("table") !== el) continue;
      const cells = [...tr.children].filter((c) => c.tagName === "TD" || c.tagName === "TH");
      if (!cells.length) continue;
      if (!rows.length && cells.every((c) => c.tagName === "TH")) header = true;
      rows.push(cells.map(richOf));
      if (rows.length >= 99) break;
    }
    if (!rows.length) return;
    const width = Math.min(Math.max(...rows.map((r) => r.length)), 20);
    if (width === 1 && rows.length === 1) { push({ t: "p", r: rows[0][0] }); return; }
    push({ t: "table", header, rows: rows.map((r) => { const x = r.slice(0, width); while (x.length < width) x.push([]); return x; }) });
  }
  function list(el, ordered) {
    for (const li of el.children) {
      if (li.tagName !== "LI") continue;
      // Texto propio del elemento (sin sublistas) y luego sublistas aplanadas.
      const clone = li.cloneNode(true);
      clone.querySelectorAll("ul,ol").forEach((x) => x.remove());
      const box = clone.querySelector('input[type="checkbox"]');
      const r = richOf(clone);
      if (r.length) push(box ? { t: "todo", r, checked: box.checked || box.hasAttribute("checked") } : { t: ordered ? "ol" : "ul", r });
      for (const sub of li.children) if (sub.tagName === "UL" || sub.tagName === "OL") list(sub, sub.tagName === "OL");
      li.querySelectorAll("img").forEach((img) => { if (img.closest("li") === li) image(img); });
    }
  }
  function codeLang(el) {
    const c = (el.className || "") + " " + (el.querySelector("code")?.className || "");
    const m = String(c).match(/(?:language|lang|highlight-source)-([\w+#-]+)/i);
    return m ? m[1].toLowerCase() : "";
  }

  function walk(el) {
    if (blocks.length >= MAX_BLOCKS) return;
    if (el.nodeType !== 1) return;
    const tag = el.tagName;
    if (SKIP.has(tag) || hidden(el) || noisy(el)) return;
    switch (tag) {
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": {
        const r = richOf(el);
        if (r.length) push({ t: tag === "H1" ? "h1" : tag === "H2" ? "h2" : "h3", r });
        return;
      }
      case "UL": case "OL": list(el, tag === "OL"); return;
      case "BLOCKQUOTE": { const r = richOf(el); if (r.length) push({ t: "quote", r }); return; }
      case "PRE": { const text = el.innerText ?? el.textContent; if (text.trim()) push({ t: "code", text: text.replace(/\n$/, ""), lang: codeLang(el) }); return; }
      case "HR": push({ t: "hr" }); return;
      case "TABLE": table(el); return;
      case "IMG": image(el); return;
      case "PICTURE": { const img = el.querySelector("img"); if (img) image(img); return; }
      case "FIGURE": {
        const cap = el.querySelector("figcaption")?.innerText?.trim() || "";
        const imgs = el.querySelectorAll("img"), frames = el.querySelectorAll("iframe");
        if (imgs.length || frames.length) { imgs.forEach((img, i) => image(img, i === 0 ? cap : "")); frames.forEach(frame); return; }
        break;
      }
      case "IFRAME": frame(el); return;
      case "VIDEO": {
        const src = abs(el.getAttribute("src") || el.querySelector("source")?.getAttribute("src") || "");
        if (src && /\.(mp4|webm|mov|ogg)(\?|$)/i.test(src)) push({ t: "video", src });
        return;
      }
    }
    // Contenedor: si solo tiene contenido en línea, es un párrafo.
    const hasBlockChild = [...el.children].some((c) => BLOCK_TAGS.has(c.tagName) || (c.tagName === "A" && c.querySelector("img,div,p,h2,h3")) || (c.tagName === "SPAN" && c.querySelector("img,div,p")));
    if (!hasBlockChild) {
      const r = richOf(el);
      if (r.length && plain(r).trim()) push({ t: "p", r });
      el.querySelectorAll("img").forEach((img) => image(img));
      return;
    }
    // Mezcla de texto suelto y bloques: agrupa el texto en párrafos.
    let run = [];
    const flush = () => { const r = tidy(run); if (r.length && plain(r).trim()) push({ t: "p", r }); run = []; };
    for (const c of el.childNodes) {
      if (c.nodeType === 1 && (BLOCK_TAGS.has(c.tagName) || c.querySelector?.("img,div,p,h2,h3,ul,ol,table,figure,iframe"))) { flush(); walk(c); }
      else inline(c, {}, run);
    }
    flush();
  }

  function pickMain() {
    const sel = ["article", "main", "[role='main']", "[itemprop='articleBody']", ".post-content", ".entry-content", ".article-body", ".article-content", ".post-body", "#content", ".content"];
    let best = null, bestLen = 0;
    for (const s of sel) for (const el of document.querySelectorAll(s)) {
      const len = (el.innerText || "").length + el.querySelectorAll("img").length * 200;
      if (len > bestLen) { best = el; bestLen = len; }
    }
    return bestLen > 400 ? best : document.body;
  }

  // ---- Selección ----
  const selection = window.getSelection();
  const selText = selection?.toString() || "";
  let selBlocks = [];
  if (selText.trim() && selection.rangeCount) {
    const box = document.createElement("div");
    for (let i = 0; i < selection.rangeCount; i++) box.append(selection.getRangeAt(i).cloneContents());
    walk(box);
    selBlocks = blocks.splice(0);
  }

  const root = pickMain();
  if (root) walk(root);
  const pageBlocks = blocks.splice(0);
  // Si el contenido empieza repitiendo el título de la página, se quita.
  const docTitle = (meta("og:title") || document.title || "").trim().toLowerCase();
  if (pageBlocks[0]?.t === "h1" && docTitle.includes(plain(pageBlocks[0].r).trim().toLowerCase())) pageBlocks.shift();

  return {
    title: document.title || meta("og:title"),
    url: location.href,
    selection: selText,
    selectionBlocks: selBlocks,
    text: (root?.innerText || "").trim(),
    blocks: pageBlocks,
    meta: {
      ogTitle: meta("og:title", "twitter:title"),
      description: meta("og:description", "description", "twitter:description"),
      image: abs(meta("og:image:secure_url", "og:image", "twitter:image")),
      video: abs(meta("og:video:secure_url", "og:video:url", "og:video", "twitter:player")),
      videoType: meta("og:video:type"),
      type: meta("og:type"),
      siteName: meta("og:site_name")
    }
  };
})();
