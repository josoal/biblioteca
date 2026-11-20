async function extract(tabId) {
  const [{result}]=await chrome.scripting.executeScript({target:{tabId},func:()=>{
    const selection=window.getSelection()?.toString()||"";
    const article=document.querySelector("article")||document.querySelector("main")||document.querySelector('[role="main"]')||document.body;
    const text=article?.innerText||"";
    return {title:document.title,url:location.href,selection,text};
  }});
  return result;
}
chrome.runtime.onInstalled.addListener(async()=>{
  await chrome.contextMenus.removeAll();
  for(const [id,title,contexts] of [["page","Guardar página en Biblioteca",["page"]],["selection","Guardar texto seleccionado en Biblioteca",["selection"]],["link","Guardar enlace en Biblioteca",["link"]],["video","Guardar página del vídeo en Biblioteca",["video"]]]) chrome.contextMenus.create({id,title,contexts});
  await chrome.storage.local.setAccessLevel({accessLevel:"TRUSTED_CONTEXTS"});
});
chrome.contextMenus.onClicked.addListener(async(info,tab)=>{
  try{
    const source=await extract(tab.id).catch(()=>({title:tab.title,url:tab.url,selection:"",text:""}));
    let mode=info.menuItemId==="selection"?"selection":info.menuItemId==="page"?"article":"link";
    if(info.menuItemId==="selection")source.selection=info.selectionText||source.selection;
    if(info.menuItemId==="link"){source.url=info.linkUrl;source.title=info.linkUrl; source.text="";source.selection="";}
    const id=crypto.randomUUID();
    await chrome.storage.session.set({["clip:"+id]:{...source,mode,tabId:tab.id,windowId:tab.windowId}});
    await chrome.windows.create({url:chrome.runtime.getURL("clip.html?id="+id),type:"popup",width:495,height:750});
  }catch(e){console.warn("No se ha podido iniciar el recorte:",e.message);}
});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(msg.kind==="extract")extract(msg.tabId).then(reply).catch(e=>reply({error:e.message}));
  else if(msg.kind==="screenshot"){
    (async()=>{
      const [active]=await chrome.tabs.query({active:true,windowId:msg.windowId});
      if(active?.id!==msg.tabId)throw Error("Vuelve a la pestaña original antes de hacer la captura.");
      return {data:await chrome.tabs.captureVisibleTab(msg.windowId,{format:"jpeg",quality:85})};
    })().then(reply).catch(e=>reply({error:e.message}));
  }else return;
  return true;
});
