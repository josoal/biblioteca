import {readConfig,getSchema,saveClip,FIELD,cleanUrl,isYoutube} from "./notion.js";
const $=id=>document.getElementById(id);
let source={},config={},schema={},screenshot=null,override=false;
const status=(s,kind="")=>{$("message").textContent=s;$("message").className="status "+kind;};
const options=(id,list,value)=>{$(id).replaceChildren();for(const v of list){const o=new Option(v||"Sin asignar",v);$(id).add(o);}$(id).value=value||"";};
function checks(id,list,initial=[]){$(id).replaceChildren();for(const v of list){const label=document.createElement("label"),c=document.createElement("input");c.type="checkbox";c.value=v;c.checked=initial.includes(v);label.append(c,document.createTextNode(v));$(id).append(label);}}
const chosen=id=>[...$(id).querySelectorAll("input:checked")].map(x=>x.value);
function opts(key,type){return (schema[key]?.[type]?.options||[]).map(x=>x.name);}
function mode(){return document.querySelector('input[name="mode"]:checked').value;}
function setMode(v){document.querySelector('input[name="mode"][value="'+v+'"]').checked=true;updateContent();}
function updateContent(){const m=mode();$("contentField").hidden=m==="link";$("content").value=m==="selection"?source.selection||"":m==="article"?source.text||"":"";updateCount();}
function updateCount(){$("count").textContent=$("content").value.length.toLocaleString("es-ES")+" caracteres";}
async function loadSource(){
  const id=new URLSearchParams(location.search).get("id");
  if(id){const key="clip:"+id;const entry=(await chrome.storage.session.get(key))[key];if(entry)return entry;throw Error("La captura ya no está disponible. Vuelve a iniciarla desde la página web.");}
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.url||!/^https?:/.test(tab.url))throw Error("Abre una página web antes de usar la extensión.");
  const response=await chrome.runtime.sendMessage({kind:"extract",tabId:tab.id}).catch(()=>null);
  return {...(response?.error?{}:response),title:response?.title||tab.title,url:response?.url||tab.url,tabId:tab.id,windowId:tab.windowId};
}
function openSettings(){chrome.runtime.openOptionsPage();}
$("settings").addEventListener("click",openSettings);$("configure").addEventListener("click",openSettings);
document.querySelectorAll('input[name="mode"]').forEach(el=>el.addEventListener("change",updateContent));
$("content").addEventListener("input",updateCount);
$("capture").addEventListener("click",async()=>{
  $("capture").disabled=true;
  try{const r=await chrome.runtime.sendMessage({kind:"screenshot",tabId:source.tabId,windowId:source.windowId});if(r.error)throw Error(r.error);screenshot=r.data;$("screenshotPreview").src=screenshot;$("screenshotPreview").hidden=false;$("remove").hidden=false;status("Captura preparada. Se subirá al guardar.");}catch(e){status(e.message,"error");}finally{$("capture").disabled=false;}
});
$("remove").addEventListener("click",()=>{screenshot=null;$("screenshotPreview").removeAttribute("src");$("screenshotPreview").hidden=true;$("remove").hidden=true;});
$("url").addEventListener("input",()=>{override=false;$("duplicate").hidden=true;});
$("form").addEventListener("submit",async e=>{
  e.preventDefault();const save=$("save");save.disabled=true;status("Guardando…");$("openPage").hidden=true;
  try{
    const tags=$("tags").value.split(",").map(x=>x.trim()).filter(Boolean);
    const data={title:$("title").value,url:cleanUrl($("url").value),mode:mode(),content:$("content").value,notes:$("notes").value,type:$("type").value,category:$("category").value,status:$("status").value,project:chosen("project"),origin:chosen("origin"),tags,screenshot,allowDuplicate:override};
    if(data.mode!=="link"&&!data.content.trim())throw Error("No hay texto para guardar. Selecciona texto o cambia a Enlace.");
    const result=await saveClip(config.token,config.sourceId,data);
    if(result.duplicate){
      const box=$("duplicate");box.replaceChildren();const p=document.createElement("p");p.textContent="Ya hay un registro con esta dirección. Puedes abrirlo o guardar otro intencionadamente.";box.append(p);
      for(const d of result.duplicate){const a=document.createElement("a");a.href=d.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=d.title;box.append(a);}
      const b=document.createElement("button");b.type="button";b.textContent="Guardar de todos modos";b.addEventListener("click",()=>{override=true;box.hidden=true;$("form").requestSubmit();});box.append(b);box.hidden=false;status("No se ha creado ningún duplicado.","error");return;
    }
    $("duplicate").hidden=true;$("openPage").href=result.page.url;$("openPage").hidden=false;save.hidden=true;
    status(result.partial?"Documento creado, pero no se pudo añadir todo el contenido. Abre el documento para comprobarlo. "+result.message:"¡Documento guardado correctamente!",result.partial?"error":"good");
  }catch(e){status(e.message,"error");}finally{save.disabled=false;}
});
async function init(){
  try{
    config=await readConfig();if(!config.token){$("connection").textContent="Sin conectar";$("unconfigured").hidden=false;return;}
    [source,schema]=await Promise.all([loadSource(),getSchema(config.token,config.sourceId)]);
    $("title").value=source.title||"";
    $("url").value=cleanUrl(source.url);
    const types=opts(FIELD.type,"select"),categories=opts(FIELD.category,"select"),statuses=opts(FIELD.status,"status");
    let initial=source.mode||(source.selection?"selection":"link");
    const defaultType=initial==="link"?"Enlace":initial==="selection"?"Anotación":"Investigación";
    options("type",["",...types],types.includes(defaultType)?defaultType:"");options("category",["",...categories],"");options("status",["",...statuses],statuses.includes("Pendiente de revisar")?"Pendiente de revisar":"");
    checks("project",opts(FIELD.project,"multi_select"));const origins=opts(FIELD.origin,"multi_select");checks("origin",origins,origins.includes("Web")?["Web"]:[]);
    for(const tag of opts(FIELD.tags,"multi_select")){$("tagOptions").append(new Option(tag,tag));}
    setMode(initial);$("connection").textContent=isYoutube(source.url)?"Conectado · vídeo de YouTube":"Conectado a Notion";$("form").hidden=false;
    if(isYoutube(source.url))status("El vídeo quedará enlazado dentro del documento.");
  }catch(e){$("connection").textContent="No se ha podido conectar";status(e.message,"error");$("unconfigured").hidden=false;}
}
init();
