import {test} from "node:test";
import assert from "node:assert/strict";
import {cleanUrl,isYoutube,normalizeId,chunks,makeBlocks,makeProperties,saveClip,FIELD,DEFAULT_SOURCE} from "./notion.js";
const schema=Object.fromEntries([[FIELD.title,"title"],[FIELD.type,"select"],[FIELD.category,"select"],[FIELD.project,"multi_select"],[FIELD.origin,"multi_select"],[FIELD.url,"url"],[FIELD.tags,"multi_select"],[FIELD.status,"status"],[FIELD.files,"files"]].map(([k,type])=>[k,{type}]));
const specimen={title:"Ejemplo",url:"https://example.org/test?utm_source=x",type:"Investigación",category:"Tecnología",project:["Ensayos"],origin:["Web"],tags:["prueba","prueba"],status:"Pendiente de revisar",mode:"article",notes:"Nota",content:"Prueba de texto"};
test("normaliza identificadores y enlaces",()=>{
  assert.equal(normalizeId("https://notion.so/"+DEFAULT_SOURCE.replaceAll("-","")),DEFAULT_SOURCE);
  assert.equal(cleanUrl(specimen.url),"https://example.org/test");
  assert.equal(cleanUrl("https://youtu.be/dQw4w9WgXcQ?t=60"),"https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=60");
  assert.throws(()=>cleanUrl("javascript:alert(1)"));
  assert.equal(isYoutube("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),true);
  assert.equal(isYoutube("https://youtube.com.evil.test/watch?v=x"),false);
});
test("trocea sin romper emojis y construye propiedades de Notion",()=>{
  assert.deepEqual(chunks("hola😀",3),["hol","a😀"]);
  const p=makeProperties(specimen,schema,"upload-id");
  assert.equal(p[FIELD.title].title[0].text.content,"Ejemplo");
  assert.deepEqual(p[FIELD.tags].multi_select,[{name:"prueba"}]);
  assert.equal(p[FIELD.files].files[0].file_upload.id,"upload-id");
  assert.equal(makeBlocks(specimen).length,5);
  assert.equal(makeBlocks({...specimen,url:"https://youtu.be/dQw4w9WgXcQ"}).at(-1).type,"embed");
});
test("impide duplicados y crea un registro con API simulada",async()=>{
  const calls=[];let duplicate=true;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    calls.push([url,options]);let value;
    if(url.endsWith("/query"))value={results:duplicate?[{object:"page",id:"existing",url:"https://www.notion.so/existing",properties:{[FIELD.title]:{title:[{plain_text:"Existente"}]}}}]:[]};
    else if(url.endsWith("/data_sources/"+DEFAULT_SOURCE))value={properties:schema};
    else if(url.endsWith("/pages"))value={id:"created",url:"https://www.notion.so/created"};
    else if(url.endsWith("/children"))value={results:[]};
    else throw Error("Llamada inesperada "+url);
    return new Response(JSON.stringify(value),{status:200});
  };
  try{
    const a=await saveClip("token-simulado",DEFAULT_SOURCE,{...specimen});
    assert.equal(a.duplicate.length,1);assert.equal(calls.some(x=>x[0].endsWith("/pages")),false);
    duplicate=false;
    const b=await saveClip("token-simulado",DEFAULT_SOURCE,{...specimen,content:"X".repeat(100000)});
    assert.equal(b.page.id,"created");
    const create=calls.find(x=>x[0].endsWith("/pages"));
    assert.equal(JSON.parse(create[1].body).parent.data_source_id,DEFAULT_SOURCE);
    assert.ok(calls.some(x=>x[0].endsWith("/children")));
  }finally{globalThis.fetch=original;}
});
test("prepara y adjunta una captura mediante API simulada",async()=>{
  const original=globalThis.fetch;let attachment=false;
  globalThis.fetch=async(url,opts)=>{
    let value;
    if(url.endsWith("/data_sources/"+DEFAULT_SOURCE))value={properties:schema};
    else if(url.endsWith("/query"))value={results:[]};
    else if(url.endsWith("/file_uploads"))value={id:"up"};
    else if(url.endsWith("/file_uploads/up/send")){
      assert.ok(opts.body instanceof FormData);
      assert.equal(opts.body.get("file").type,"image/jpeg");
      value={status:"uploaded"};
    }else if(url.endsWith("/pages")){
      attachment=JSON.parse(opts.body).properties[FIELD.files].files[0].file_upload.id==="up";
      value={id:"saved",url:"https://example.org/notion"};
    } else throw Error("Petición inesperada");
    return new Response(JSON.stringify(value),{status:200});
  };
  try{const r=await saveClip("mock-secret",DEFAULT_SOURCE,{...specimen,screenshot:"data:image/jpeg;base64,AA=="});assert.equal(r.page.id,"saved");assert.equal(attachment,true);}
  finally{globalThis.fetch=original;}
});
