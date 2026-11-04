const SUPABASE_URL="https://pjdbmpclqjhkdxnkgymd.supabase.co";
const SUPABASE_KEY="sb_publishable_Rph11ekGQmY3VYYGAHTtIA_RRf94wNS";
const CATS=["食費","日用品","趣味・娯楽","交際費","交通費","衣服・美容","健康・医療","自動車","教養・教育","特別な支出","現金・カード"];
const $=id=>document.getElementById(id);
const yen=n=>"¥"+Math.round(n).toLocaleString("ja-JP");
const pad=n=>String(n).padStart(2,"0");
const today=()=>{const t=new Date();return t.getFullYear()+"-"+pad(t.getMonth()+1)+"-"+pad(t.getDate())};
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let names={a:"自分",b:"パートナー"},entries=[],payer="a",month=today().slice(0,7),chan=null,loaded=false;
try{payer=localStorage.getItem("payer")||"a"}catch(e){}
const msg=t=>{$("st").textContent=t||""};

$("cat").innerHTML=CATS.map(c=>`<option>${c}</option>`).join("");
$("d").value=today();

/* ---------- 認証 ---------- */
function show(session){
  $("login").classList.toggle("hide",!!session);
  $("app").classList.toggle("hide",!session);
  if(session&&!loaded){loaded=true;init()}
  if(!session){loaded=false;if(chan){sb.removeChannel(chan);chan=null}}
}
sb.auth.getSession().then(({data})=>show(data.session));
sb.auth.onAuthStateChange((_e,s)=>show(s));
$("li").onclick=async()=>{
  const {error}=await sb.auth.signInWithPassword({email:$("em").value.trim(),password:$("pw").value});
  if(error)alert("ログインできませんでした。メールアドレスとパスワードを確認してください。");
};
$("lo").onclick=()=>sb.auth.signOut();

/* ---------- データ ---------- */
function range(){
  const [y,m]=month.split(" ")[0].split("-").map(Number);
  const nx=m===12?(y+1)+"-01-01":y+"-"+pad(m+1)+"-01";
  return [month+"-01",nx];
}
async function load(){
  const [a,b]=range();
  const {data,error}=await sb.from("entries").select("*").gte("date",a).lt("date",b)
    .order("date",{ascending:false}).order("id",{ascending:false});
  if(error){msg("読み込みに失敗しました: "+error.message);return}
  msg("");entries=data;render();
}
async function loadNames(){
  const {data}=await sb.from("settings").select("*");
  (data||[]).forEach(r=>{if(r.key==="name_a")names.a=r.value;if(r.key==="name_b")names.b=r.value});
  renderPayer();render();
}
async function init(){
  await loadNames();await load();renderPayer();
  chan=sb.channel("kakeibo")
    .on("postgres_changes",{event:"*",schema:"public",table:"entries"},load)
    .on("postgres_changes",{event:"*",schema:"public",table:"settings"},loadNames)
    .subscribe();
}

/* ---------- 操作 ---------- */
function renderPayer(){
  $("payer").innerHTML="";
  ["a","b"].forEach(k=>{
    const b=document.createElement("button");b.textContent=names[k];
    if(payer===k)b.className="on";
    b.onclick=()=>{payer=k;try{localStorage.setItem("payer",k)}catch(e){}renderPayer()};
    $("payer").appendChild(b);
  });
  $("na").value=names.a;$("nb").value=names.b;
}
$("add").onclick=async()=>{
  const amount=Math.round(Number($("amt").value));
  if(!amount||amount<=0){$("amt").focus();return}
  if(!$("d").value){$("d").focus();return}
  const {error}=await sb.from("entries").insert({date:$("d").value,amount,category:$("cat").value,payer,memo:$("memo").value.trim()||null});
  if(error){msg("保存に失敗しました: "+error.message);return}
  $("amt").value="";$("memo").value="";$("d").value=today();
  await load();
};
async function del(id){
  const {error}=await sb.from("entries").delete().eq("id",id);
  if(error)msg("削除に失敗しました: "+error.message);else load();
}
$("sn").onclick=async()=>{
  const a=$("na").value.trim()||"自分",b=$("nb").value.trim()||"パートナー";
  const {error}=await sb.from("settings").upsert([{key:"name_a",value:a},{key:"name_b",value:b}]);
  if(error)msg("名前の保存に失敗しました: "+error.message);else{names={a,b};renderPayer();render()}
};
function shift(n){
  const [y,m]=month.split("-").map(Number);const d=new Date(y,m-1+n,1);
  month=d.getFullYear()+"-"+pad(d.getMonth()+1);load();
}
$("pv").onclick=()=>shift(-1);$("nx").onclick=()=>shift(1);

/* ---------- 表示 ---------- */
function render(){
  const [y,m]=month.split("-");$("ml").textContent=y+"年"+Number(m)+"月";
  let tot=0,pa=0,pb=0;const cs={};
  entries.forEach(e=>{tot+=e.amount;if(e.payer==="a")pa+=e.amount;else pb+=e.amount;cs[e.category]=(cs[e.category]||0)+e.amount});
  $("tot").textContent=yen(tot);
  $("pa").textContent=names.a+" "+yen(pa)+" / "+names.b+" "+yen(pb);
  const cb=$("cb");cb.innerHTML="";
  Object.entries(cs).sort((x,z)=>z[1]-x[1]).forEach(([k,v])=>{
    const r=document.createElement("div");r.style.margin="8px 0";
    const h=document.createElement("div");h.style.cssText="display:flex;justify-content:space-between";
    const n=document.createElement("span");n.textContent=k+" ("+Math.round(v/tot*100)+"%)";
    const b=document.createElement("b");b.textContent=yen(v);h.append(n,b);
    const bar=document.createElement("div");bar.className="bar";bar.style.width=(v/tot*100)+"%";
    r.append(h,bar);cb.appendChild(r);
  });
  const box=$("list");box.innerHTML="";
  if(!entries.length){box.innerHTML='<div class="sub">この月の記録はまだありません</div>';return}
  entries.forEach(e=>{
    const r=document.createElement("div");r.className="it";
    const mm=document.createElement("div");mm.className="m";
    const a=document.createElement("div");a.textContent=e.category+(e.memo?"  "+e.memo:"");
    const t=document.createElement("div");t.className="t";
    t.textContent=e.date.slice(5).replace("-","/")+"  "+(names[e.payer]||"")+"が支払い";
    mm.append(a,t);
    const am=document.createElement("b");am.textContent=yen(e.amount);
    const x=document.createElement("button");x.className="x";x.textContent="✕";x.setAttribute("aria-label","削除");x.onclick=()=>del(e.id);
    r.append(mm,am,x);box.appendChild(r);
  });
}

/* ---------- CSV書き出し(全期間) ---------- */
$("ex").onclick=async()=>{
  let all=[],from=0;
  for(;;){
    const {data,error}=await sb.from("entries").select("*").order("date").order("id").range(from,from+999);
    if(error){msg("書き出しに失敗しました: "+error.message);return}
    all=all.concat(data);if(data.length<1000)break;from+=1000;
  }
  const q=s=>'"'+String(s==null?"":s).replace(/"/g,'""')+'"';
  const rows=[["日付","金額","カテゴリ","払った人","メモ"]].concat(all.map(e=>[e.date,e.amount,e.category,names[e.payer]||"",e.memo]));
  const csv="\ufeff"+rows.map(r=>r.map(q).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  const a=document.createElement("a");a.href=url;a.download="kakeibo-"+today()+".csv";
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
};
