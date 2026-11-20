export const DEFAULT_SOURCE = "41e5580d-8c90-81bc-8a73-000b8e632220";
export const DEFAULT_DB = "41e5580d-8c90-81e7-ac28-cfc034efd8b0";
export const NOTION_VERSION = "2026-03-11";
export const FIELD = Object.freeze({title:"Título",type:"Tipo",category:"Categoría",project:"Proyecto",origin:"Origen",url:"Fuente original",tags:"Etiquetas",status:"Estado",files:"Archivos adjuntos"});
export function normalizeId(input) {
  const s = String(input || "").trim();
  const match = s.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})(?=[^0-9a-f]|$)/i);
  if (!match) throw Error("Introduce un identificador o enlace de Notion válido.");
  const v = match[1].replace(/-/g,"").toLowerCase();
  return [v.slice(0,8),v.slice(8,12),v.slice(12,16),v.slice(16,20),v.slice(20)].join("-");
}
export function cleanUrl(input) {
  const u = new URL(input);
  if (!["http:","https:"].includes(u.protocol)) throw Error("Solo se admiten enlaces HTTP y HTTPS.");
  u.username=""; u.password="";
  for (const k of [...u.searchParams.keys()]) if (/^(utm_.*|fbclid|gclid|msclkid|mc_cid|mc_eid)$/i.test(k)) u.searchParams.delete(k);
  if (u.hostname === "youtu.be") {
    const id = u.pathname.split("/")[1];
    if (/^[\w-]{11}$/.test(id)) {const y=new URL("https://www.youtube.com/watch");y.searchParams.set("v",id); if(u.searchParams.has("t")) y.searchParams.set("t",u.searchParams.get("t"));return y.href;}
  }
  return u.href;
}
export function isYoutube(url) {
  try {const u=new URL(url); return /(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname) && (/^\/(watch|shorts\/|live\/)/.test(u.pathname)||u.hostname==="youtu.be");} catch {return false;}
}
export function chunks(text, size = 1800) {
  const chars=Array.from(String(text||"")); const res=[];
  for(let i=0;i<chars.length;i+=size) res.push(chars.slice(i,i+size).join(""));
  return res;
}
const rt=(content,link)=>({type:"text",text:{content,...(link?{link:{url:link}}:{})}});
const paragraph=(text)=>({object:"block",type:"paragraph",paragraph:{rich_text:[rt(text)]}});
const heading=(text)=>({object:"block",type:"heading_2",heading_2:{rich_text:[rt(text)]}});
export function textBlocks(label,text) {
  if(!String(text||"").trim())return [];
  const blocks=[heading(label)];
  for (const p of String(text).trim().split(/\n\s*\n/)) for(const c of chunks(p)) if(c.trim()) blocks.push(paragraph(c));
  return blocks;
}
export function makeBlocks(data) {
  const result=[];
  if(data.url) result.push({object:"block",type:"paragraph",paragraph:{rich_text:[rt("Fuente original: "),rt(data.url.slice(0,1800),data.url)]}});
  result.push(...textBlocks("Anotaciones",data.notes));
  if(data.mode==="selection")result.push(...textBlocks("Texto seleccionado",data.content));
  if(data.mode==="article")result.push(...textBlocks("Contenido de la página",data.content));
  if(isYoutube(data.url)) result.push({object:"block",type:"embed",embed:{url:data.url}});
  return result;
}
export function makeProperties(data,schema,uploadId) {
  const p={};
  const put=(key,type,value)=>{if(schema[key]?.type===type)p[key]={[type]:value};};
  put(FIELD.title,"title",chunks(data.title.trim()).map(s=>rt(s)));
  put(FIELD.url,"url",data.url);
  for(const [k,v] of [[FIELD.type,data.type],[FIELD.category,data.category]])if(v)put(k,"select",{name:v});
  if(data.status)put(FIELD.status,"status",{name:data.status});
  for(const [k,v] of [[FIELD.project,data.project],[FIELD.origin,data.origin],[FIELD.tags,data.tags]])if(v?.length)put(k,"multi_select",[...new Set(v)].map(name=>({name})));
  if(uploadId)put(FIELD.files,"files",[{name:"Captura.jpg",type:"file_upload",file_upload:{id:uploadId}}]);
  return p;
}
export async function api(token,path,method="GET",body) {
  if(!token)throw Error("Falta conectar tu integración de Notion.");
  const headers={Authorization:"Bearer "+token,"Notion-Version":NOTION_VERSION};
  const form=body instanceof FormData;
  if(body!==undefined&&!form)headers["Content-Type"]="application/json";
  const response=await fetch("https://api.notion.com/v1"+path,{method,headers,body:body===undefined?undefined:form?body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){
    const hints={401:"Clave de Notion incorrecta o revocada.",403:"La integración no tiene permisos suficientes.",404:"Notion no encuentra la base de datos. Comprueba que has conectado la integración a Documentos · Base maestra.",429:"Notion ha limitado temporalmente las solicitudes. Espera un momento y vuelve a intentarlo."};
    throw Error((hints[response.status]||"Error de Notion ("+response.status+").")+" "+(result.message||""));
  }
  return result;
}
export async function readConfig() {
  const {token="",sourceId=DEFAULT_SOURCE}=await chrome.storage.local.get(["token","sourceId"]);
  return {token,sourceId};
}
export async function getSchema(token,id) {
  const source=await api(token,"/data_sources/"+normalizeId(id));
  const schema=source.properties||{};
  for(const [key,type] of [[FIELD.title,"title"],[FIELD.url,"url"],[FIELD.type,"select"],[FIELD.category,"select"],[FIELD.project,"multi_select"],[FIELD.origin,"multi_select"],[FIELD.tags,"multi_select"],[FIELD.status,"status"],[FIELD.files,"files"]]) {
    if(schema[key]?.type!==type)throw Error('Falta el campo «'+key+'» o tiene un tipo diferente al esperado.');
  }
  return schema;
}
export async function checkDuplicate(token,id,url) {
  const r=await api(token,"/data_sources/"+id+"/query","POST",{filter:{property:FIELD.url,url:{equals:url}},page_size:5});
  return (r.results||[]).filter(x=>x.object==="page").map(x=>({id:x.id,url:x.url,title:x.properties?.[FIELD.title]?.title?.map(t=>t.plain_text||t.text?.content||"").join("")||"Documento existente"}));
}
async function uploadScreenshot(token,dataUrl) {
  if(!/^data:image\/jpeg;base64,/.test(dataUrl))throw Error("Formato de captura no válido.");
  const b64=dataUrl.split(",")[1], bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  const file=new Blob([bytes],{type:"image/jpeg"});
  const upload=await api(token,"/file_uploads","POST",{mode:"single_part",filename:"Captura.jpg",content_type:"image/jpeg"});
  const form=new FormData();form.append("file",file,"Captura.jpg");
  const sent=await api(token,"/file_uploads/"+upload.id+"/send","POST",form);
  if(sent.status!=="uploaded")throw Error("Notion no ha confirmado la subida de la captura.");
  return upload.id;
}
export async function saveClip(token,id,data) {
  const schema=await getSchema(token,id);
  if(!data.title.trim())throw Error("El título es obligatorio.");
  data.url=cleanUrl(data.url);
  if(data.url.length>2000)throw Error("El enlace supera el máximo de Notion.");
  if(!data.allowDuplicate){const dup=await checkDuplicate(token,id,data.url);if(dup.length)return {duplicate:dup};}
  const uploadId=data.screenshot?await uploadScreenshot(token,data.screenshot):null;
  const children=makeBlocks(data);
  const properties=makeProperties(data,schema,uploadId);
  const page=await api(token,"/pages","POST",{parent:{type:"data_source_id",data_source_id:id},properties,children:children.slice(0,40)});
  try{
    for(let i=40;i<children.length;i+=40)await api(token,"/blocks/"+page.id+"/children","PATCH",{children:children.slice(i,i+40)});
  }catch(e){return {page:{id:page.id,url:page.url},partial:true,message:e.message};}
  return {page:{id:page.id,url:page.url}};
}
