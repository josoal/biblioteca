import {api,readConfig,normalizeId,DEFAULT_SOURCE,getSchema} from "./notion.js";
const $=id=>document.getElementById(id);
const show=(message,kind="")=>{$("result").textContent=message;$("result").className="status "+kind;};
const config=await readConfig();$("token").value=config.token;$("source").value=config.sourceId;
$("options").addEventListener("submit",async e=>{
  e.preventDefault();$("test").disabled=true;show("Comprobando permisos y campos…");
  try{
    const token=$("token").value.trim();let sourceId=normalizeId($("source").value);
    let source;
    try{source=await api(token,"/data_sources/"+sourceId);}catch(e){
      const db=await api(token,"/databases/"+sourceId);
      if(db.data_sources?.length!==1)throw Error("La base tiene varias fuentes. Introduce el ID de la fuente exacta.");
      sourceId=db.data_sources[0].id;
    }
    await getSchema(token,sourceId);
    await chrome.storage.local.setAccessLevel({accessLevel:"TRUSTED_CONTEXTS"});
    await chrome.storage.local.set({token,sourceId});
    $("source").value=sourceId;show("Conexión verificada y guardada. Ya puedes usar el botón de Chrome.","good");
  }catch(err){show(err.message,"error");}finally{$("test").disabled=false;}
});
$("disconnect").addEventListener("click",async()=>{await chrome.storage.local.remove("token");$("token").value="";$("source").value=DEFAULT_SOURCE;show("Conexión eliminada de este navegador. Puedes revocarla también desde Notion.");});
