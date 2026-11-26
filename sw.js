/* 画面のファイルだけをスマホに保存する。家計のデータ(Supabaseとの通信)には一切触れない。
   版を上げるときは CACHE の番号を index.html の ?v= とそろえる(自動チェックあり)。 */
const CACHE="kakeibo-v24";
const FILES=["./","./index.html","./style.css?v=24","./app.js?v=24","./supabase.min.js","./manifest.json",
  "./icons/icon-v2-192.png","./icons/icon-v2-512.png","./icons/icon-v2-apple-180.png","./img/loading-v1.webp","./img/loading-hojihoji-v1.webp","./img/loading-daikon-v2.webp"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

function timeout(ms){return new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),ms))}
async function put(req,res){
  if(res&&res.ok){const c=await caches.open(CACHE);await c.put(req,res.clone())}
  return res;
}

self.addEventListener("fetch",e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=="GET"||url.origin!==self.location.origin)return; /* Supabaseなど外部は素通し */
  const isPage=req.mode==="navigate"||url.pathname.endsWith("/")||url.pathname.endsWith("/index.html");
  if(isPage){
    /* 画面の骨組みは新しいものを優先(3秒で来なければ保存済みを表示)。更新がすぐ反映される */
    e.respondWith(
      Promise.race([fetch(req).then(r=>put("./index.html",r)),timeout(3000)])
        .catch(()=>caches.match("./index.html").then(r=>r||fetch(req)))
    );
    return;
  }
  /* 版番号つきのファイルは保存済みを優先。なければ取りに行って保存 */
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(x=>put(req,x))));
});
