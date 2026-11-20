// Pruebas unitarias con API de Notion simulada. Ejecuta: node --test tests.mjs
import {test} from "node:test";
import assert from "node:assert/strict";
import {cleanUrl,isYoutube,youtubeId,instagramPost,normalizeId,chunks,makeBlocks,makeProperties,saveClip,FIELD,DEFAULT_SOURCE,duplicateFilter,detectMedia,richText,richBlocks,batches,mediaAsLinks,pickOption,updateClip,mergeProperties,pageLook} from "./notion.js";

const schema = Object.fromEntries([[FIELD.title,"title"],[FIELD.type,"select"],[FIELD.category,"select"],[FIELD.project,"multi_select"],[FIELD.origin,"multi_select"],[FIELD.url,"url"],[FIELD.tags,"multi_select"],[FIELD.status,"status"],[FIELD.files,"files"]].map(([k,type]) => [k,{type}]));
const specimen = {title:"Ejemplo",url:"https://example.org/test?utm_source=x",type:"Investigación",category:"Tecnología",project:["Ensayos"],origin:["Web"],tags:["prueba","prueba"],status:"Pendiente de revisar",mode:"article",notes:"Nota",content:"Prueba de texto"};

function mockFetch(handler) {
  const calls = [], original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push([url, options]);
    const r = await handler(url, options, calls);
    if (r instanceof Response) return r;
    return new Response(JSON.stringify(r), {status:200});
  };
  return {calls, restore:() => { globalThis.fetch = original; }};
}

test("normaliza identificadores y enlaces", () => {
  assert.equal(normalizeId("https://notion.so/" + DEFAULT_SOURCE.replaceAll("-", "")), DEFAULT_SOURCE);
  assert.equal(cleanUrl(specimen.url), "https://example.org/test");
  assert.equal(cleanUrl("https://example.org/a?x=1&fbclid=2#seccion"), "https://example.org/a?x=1");
  assert.equal(cleanUrl("https://app.example.org/#/ruta"), "https://app.example.org/#/ruta");
  assert.equal(cleanUrl("https://youtu.be/dQw4w9WgXcQ?t=60&si=abc"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60");
  assert.equal(cleanUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(cleanUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(cleanUrl("https://www.instagram.com/p/ABC123/?igsh=xyz&img_index=2"), "https://www.instagram.com/p/ABC123/");
  assert.equal(cleanUrl("https://www.instagram.com/usuario/reel/XYZ_9/"), "https://www.instagram.com/reel/XYZ_9/");
  assert.throws(() => cleanUrl("javascript:alert(1)"), /enlaces web/);
  assert.throws(() => cleanUrl("mailto:a@b.c"), /enlaces web/);
  assert.equal(isYoutube("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isYoutube("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), false);
  assert.equal(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(instagramPost("https://www.instagram.com/explore/"), "");
});

test("detecta duplicados guardados con otra forma del enlace", () => {
  const f = duplicateFilter("https://example.org/articulo");
  const values = f.or.map((x) => x.url.equals);
  for (const v of ["https://example.org/articulo", "https://example.org/articulo/", "https://www.example.org/articulo", "http://example.org/articulo/"]) assert.ok(values.includes(v), v);
  const yt = duplicateFilter("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.deepEqual(yt.or.map((x) => x.url.contains), ["v=dQw4w9WgXcQ", "youtu.be/dQw4w9WgXcQ", "/shorts/dQw4w9WgXcQ"]);
  assert.equal(duplicateFilter("https://www.instagram.com/p/ABC/").or.length, 4);
});

test("detecta vídeos e Instagram", () => {
  assert.equal(detectMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ").kind, "youtube");
  assert.deepEqual(detectMedia("https://vimeo.com/123456"), {kind:"video", embed:"https://vimeo.com/123456"});
  assert.equal(detectMedia("https://example.org/v", {type:"video.other", video:"https://cdn.example.org/a.mp4"}).file, true);
  assert.equal(detectMedia("https://example.org/articulo", {type:"article"}), null);
  assert.equal(detectMedia("https://www.instagram.com/p/ABC/", {image:"https://scontent.cdninstagram.com/x.jpg"}).image, "https://scontent.cdninstagram.com/x.jpg");
});

test("convierte formato enriquecido a bloques de Notion", () => {
  const r = richText([{text:"negrita", b:true}, {text:" enlace", href:"https://a.org"}, {text:" malo", href:"javascript:x"}]);
  assert.deepEqual(r[0].annotations, {bold:true});
  assert.equal(r[1].text.link.url, "https://a.org/");
  assert.equal(r[2].text.link, undefined);
  assert.equal(richText(Array.from({length:150}, (_, i) => ({text:"x" + i, b:i % 2 === 0}))).length, 100);
  const blocks = richBlocks([
    {t:"h1", r:[{text:"T"}]}, {t:"p", r:[{text:"P"}]}, {t:"ul", r:[{text:"a"}]}, {t:"ol", r:[{text:"b"}]},
    {t:"quote", r:[{text:"q"}]}, {t:"code", text:"let a=1", lang:"js"}, {t:"hr"}, {t:"img", src:"https://a.org/i.png", caption:"pie"},
    {t:"img", src:"data:image/png;base64,AA"}, {t:"embed", src:"https://www.youtube.com/embed/dQw4w9WgXcQ"}, {t:"embed", src:"https://player.vimeo.com/video/1"},
    {t:"table", header:true, rows:[[[{text:"A"}],[{text:"B"}]],[[{text:"1"}],[]]]}, {t:"todo", r:[{text:"t"}], checked:true}
  ]);
  assert.deepEqual(blocks.map((b) => b.type), ["heading_1","paragraph","bulleted_list_item","numbered_list_item","quote","code","divider","image","video","embed","table","to_do"]);
  assert.equal(blocks[5].code.language, "javascript");
  assert.equal(blocks[8].video.external.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(blocks[10].table.children.length, 2);
  assert.equal(blocks[10].table.table_width, 2);
});

test("trocea, construye propiedades y lotes", () => {
  assert.deepEqual(chunks("hola😀", 3), ["hol", "a😀"]);
  const p = makeProperties(specimen, schema, "upload-id");
  assert.equal(p[FIELD.title].title[0].text.content, "Ejemplo");
  assert.deepEqual(p[FIELD.tags].multi_select, [{name:"prueba"}]);
  assert.equal(p[FIELD.files].files[0].file_upload.id, "upload-id");
  assert.equal(makeBlocks(specimen).length, 5);
  assert.equal(makeBlocks({...specimen, mode:"link", media:detectMedia("https://youtu.be/dQw4w9WgXcQ")})[1].type, "video");
  const many = Array.from({length:250}, () => ({object:"block", type:"divider", divider:{}}));
  assert.deepEqual(batches(many).map((b) => b.length), [100, 100, 50]);
  assert.equal(mediaAsLinks([{type:"image", image:{type:"external", external:{url:"https://a.org/i.png"}}}])[0].type, "paragraph");
  assert.equal(pickOption(["Vídeo", "Enlace"], "video"), "Vídeo");
  assert.equal(pickOption(["Enlace"], "Vídeo", "Enlace"), "Enlace");
});

test("impide duplicados y crea un registro largo con formato", async () => {
  let duplicate = true;
  const m = mockFetch((url) => {
    if (url.endsWith("/query")) return {results:duplicate ? [{object:"page", id:"existing", url:"https://www.notion.so/existing", created_time:"2026-01-01T00:00:00Z", properties:{[FIELD.title]:{title:[{plain_text:"Existente"}]}}}] : []};
    if (url.endsWith("/data_sources/" + DEFAULT_SOURCE)) return {properties:schema};
    if (url.endsWith("/pages")) return {id:"created", url:"https://www.notion.so/created"};
    if (url.endsWith("/children")) return {results:[]};
    throw Error("Llamada inesperada " + url);
  });
  try {
    const a = await saveClip("token-simulado", DEFAULT_SOURCE, {...specimen});
    assert.equal(a.duplicate.length, 1); assert.equal(a.duplicate[0].created, "2026-01-01T00:00:00Z");
    assert.equal(m.calls.some((x) => x[0].endsWith("/pages")), false);
    duplicate = false;
    const pageBlocks = Array.from({length:230}, (_, i) => ({t:"p", r:[{text:"Párrafo " + i, b:i === 0}]}));
    const b = await saveClip("token-simulado", DEFAULT_SOURCE, {...specimen, pageBlocks});
    assert.equal(b.page.id, "created"); assert.equal(b.partial, undefined);
    const create = m.calls.find((x) => x[0].endsWith("/pages"));
    assert.equal(JSON.parse(create[1].body).parent.data_source_id, DEFAULT_SOURCE);
    const appended = m.calls.filter((x) => x[0].endsWith("/children")).map((x) => JSON.parse(x[1].body).children);
    assert.equal(appended.reduce((n, c) => n + c.length, 0), 231); // título + 230 párrafos
    assert.ok(appended.every((c) => c.length <= 100));
    assert.deepEqual(appended[0][1].paragraph.rich_text[0].annotations, {bold:true});
  } finally { m.restore(); }
});

test("reintenta si Notion limita las peticiones y sustituye medios rechazados", async () => {
  let limited = 1, rejected = 1;
  const m = mockFetch((url, opts) => {
    if (url.endsWith("/data_sources/" + DEFAULT_SOURCE)) return {properties:schema};
    if (url.endsWith("/query")) {
      if (limited-- > 0) return new Response("{}", {status:429, headers:{"Retry-After":"0"}});
      return {results:[]};
    }
    if (url.endsWith("/pages")) return {id:"p", url:"https://www.notion.so/p"};
    if (url.endsWith("/children")) {
      const body = JSON.parse(opts.body);
      if (body.children.some((b) => b.type === "image") && rejected-- > 0) return new Response(JSON.stringify({message:"invalid image"}), {status:400});
      return {results:[]};
    }
    throw Error("Llamada inesperada " + url);
  });
  try {
    const r = await saveClip("t", DEFAULT_SOURCE, {...specimen, pageBlocks:[{t:"img", src:"https://a.org/x.png"}]});
    assert.equal(r.page.id, "p"); assert.equal(r.partial, undefined);
    const last = JSON.parse(m.calls.filter((x) => x[0].endsWith("/children")).at(-1)[1].body).children;
    assert.equal(last[1].type, "paragraph");
  } finally { m.restore(); }
});

test("sube la captura (adjunto y dentro de la página) y la imagen de Instagram", async () => {
  let uploads = 0, created;
  const m = mockFetch(async (url, opts) => {
    if (url.endsWith("/data_sources/" + DEFAULT_SOURCE)) return {properties:schema};
    if (url.endsWith("/query")) return {results:[]};
    if (url.startsWith("https://scontent")) return new Response(new Blob([new Uint8Array([1,2,3])], {type:"image/jpeg"}));
    if (url.endsWith("/file_uploads")) return {id:"up" + (++uploads)};
    if (/\/file_uploads\/up\d\/send$/.test(url)) { assert.ok(opts.body instanceof FormData); assert.equal(opts.body.get("file").type, "image/jpeg"); return {status:"uploaded"}; }
    if (url.endsWith("/pages")) { created = JSON.parse(opts.body); return {id:"saved", url:"https://example.org/notion"}; }
    throw Error("Petición inesperada " + url);
  });
  try {
    const r = await saveClip("mock-secret", DEFAULT_SOURCE, {...specimen, url:"https://www.instagram.com/p/ABC/", mode:"link", media:{kind:"instagram", image:"https://scontent.cdninstagram.com/x.jpg"}, description:"Pie de foto", screenshot:"data:image/jpeg;base64,AA=="});
    assert.equal(r.page.id, "saved"); assert.deepEqual(r.warnings, []);
    assert.equal(uploads, 3);
    assert.equal(created.properties[FIELD.files].files[0].file_upload.id, "up1");
    const images = created.children.filter((b) => b.type === "image").map((b) => b.image.file_upload.id);
    assert.deepEqual(images, ["up3", "up2"]);
  } finally { m.restore(); }
});

test("pone el icono de la web y la imagen principal como cabecera, con alternativa si Notion los rechaza", async () => {
  assert.deepEqual(pageLook({icon:"https://a.org/favicon.png", cover:"https://a.org/og.jpg"}), {icon:{type:"external", external:{url:"https://a.org/favicon.png"}}, cover:{type:"external", external:{url:"https://a.org/og.jpg"}}});
  assert.deepEqual(pageLook({icon:"https://a.org/f.png", useLook:false}), {});
  assert.deepEqual(pageLook({icon:"javascript:x"}), {});
  let tries = 0, accepted;
  const m = mockFetch((url, opts) => {
    if (url.endsWith("/data_sources/" + DEFAULT_SOURCE)) return {properties:schema};
    if (url.endsWith("/query")) return {results:[]};
    if (url.endsWith("/pages")) {
      const body = JSON.parse(opts.body); tries++;
      if (body.cover) return new Response(JSON.stringify({message:"cover invalid"}), {status:400});
      accepted = body; return {id:"p", url:"https://www.notion.so/p"};
    }
    throw Error("Llamada inesperada " + url);
  });
  try {
    const r = await saveClip("t", DEFAULT_SOURCE, {...specimen, mode:"link", icon:"https://a.org/f.png", cover:"https://a.org/og.jpg"});
    assert.equal(tries, 2); assert.equal(accepted.icon, undefined); assert.equal(r.warnings.length, 1);
  } finally { m.restore(); }
});

test("crea etiquetas nuevas enviando su nombre a Notion", () => {
  const p = makeProperties({...specimen, tags:["existente", "Nueva, con coma"]}, schema);
  assert.deepEqual(p[FIELD.tags].multi_select, [{name:"existente"}, {name:"Nueva  con coma"}]);
});

test("actualiza un documento existente sin borrar nada", async () => {
  assert.deepEqual(mergeProperties({[FIELD.tags]:{multi_select:[{name:"b"}]}, [FIELD.files]:{files:[]}, [FIELD.type]:{select:{name:"Enlace"}}, [FIELD.category]:{select:{name:"Música"}}}, {[FIELD.tags]:{multi_select:[{name:"a"}]}, [FIELD.type]:{select:{name:"Investigación"}}, [FIELD.category]:{select:null}}),
    {[FIELD.tags]:{multi_select:[{name:"a"}, {name:"b"}]}, [FIELD.category]:{select:{name:"Música"}}});
  let patch, appended = [];
  const m = mockFetch((url, opts) => {
    if (url.endsWith("/data_sources/" + DEFAULT_SOURCE)) return {properties:schema};
    if (url.endsWith("/pages/existing") && opts.method === "GET") return {id:"existing", url:"https://www.notion.so/existing", properties:{[FIELD.tags]:{multi_select:[{name:"vieja"}]}, [FIELD.project]:{multi_select:[{name:"Jarana"}]}}};
    if (url.endsWith("/pages/existing") && opts.method === "PATCH") { patch = JSON.parse(opts.body); return {id:"existing"}; }
    if (url.endsWith("/blocks/existing/children")) { appended.push(...JSON.parse(opts.body).children); return {results:[]}; }
    throw Error("Llamada inesperada " + opts.method + " " + url);
  });
  try {
    const r = await updateClip("t", DEFAULT_SOURCE, "existing", {...specimen, icon:"https://a.org/f.png", cover:"https://a.org/og.jpg", pageBlocks:[{t:"p", r:[{text:"Nuevo"}]}]});
    assert.equal(r.updated, true); assert.equal(r.page.url, "https://www.notion.so/existing");
    assert.deepEqual(patch.properties[FIELD.tags].multi_select.map((x) => x.name), ["vieja", "prueba"]);
    assert.deepEqual(patch.properties[FIELD.project].multi_select.map((x) => x.name), ["Jarana", "Ensayos"]);
    assert.equal(patch.icon.external.url, "https://a.org/f.png"); assert.equal(patch.cover.external.url, "https://a.org/og.jpg");
    assert.equal(appended[0].type, "divider");
    assert.match(appended[1].heading_2.rich_text[0].text.content, /^Actualización · /);
    assert.ok(!appended.some((b) => b.type === "paragraph" && b.paragraph.rich_text[0].text.content === "Fuente original: "));
    assert.equal(appended.at(-1).paragraph.rich_text[0].text.content, "Nuevo");
  } finally { m.restore(); }
});
