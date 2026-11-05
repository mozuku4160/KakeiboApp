const SUPABASE_URL="https://pjdbmpclqjhkdxnkgymd.supabase.co";
const SUPABASE_KEY="sb_publishable_Rph11ekGQmY3VYYGAHTtIA_RRf94wNS";
const CATS=[
  {n:"食費",i:"🍴",c:"#e5484d"},
  {n:"外食",i:"🍜",c:"#d9822b"},
  {n:"日用品",i:"🪥",c:"#5fb87c"},
  {n:"趣味・娯楽",i:"⭐",c:"#e0508a"},
  {n:"交際費",i:"👥",c:"#3f6fb5"},
  {n:"交通費",i:"🚃",c:"#6a4fb3"},
  {n:"衣服・美容",i:"👕",c:"#f2a93b"},
  {n:"健康・医療",i:"🏥",c:"#f2735a"},
  {n:"自動車",i:"🚗",c:"#8a8f98"},
  {n:"教養・教育",i:"📘",c:"#5b7fc7"},
  {n:"子ども・育児",i:"🍼",c:"#4fb3c7"},
  {n:"特別な支出",i:"❗",c:"#9cbf6a"},
  {n:"現金・カード",i:"💳",c:"#c98a4f"}
];
const $=id=>document.getElementById(id);
const yen=n=>"¥"+Math.round(n).toLocaleString("ja-JP");
const pad=n=>String(n).padStart(2,"0");
const today=()=>{const t=new Date();return t.getFullYear()+"-"+pad(t.getMonth()+1)+"-"+pad(t.getDate())};
const monthAdd=(m,n)=>{const [y,mo]=m.split("-").map(Number);const d=new Date(y,mo-1+n,1);return d.getFullYear()+"-"+pad(d.getMonth()+1)};
const mLabel=m=>Number(m.slice(5))+"月";
const catOf=n=>CATS.find(c=>c.n===n)||{n:n,i:"・",c:"#999999"};
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function icon(name){const c=catOf(name);const s=el("span","ic",c.i);s.style.background=c.c+"33";return s}
const msg=t=>{$("st").textContent=t||""};
const smsg=t=>{$("sh-st").textContent=t||""};

/* ライブラリが読めないときは画面に表示する */
if(typeof supabase==="undefined"){
  $("boot").textContent="ライブラリ(supabase.min.js)を読み込めませんでした。ファイルが正しく置かれているか確認してください。";
  throw new Error("supabase.min.js not loaded");
}
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let names={a:"自分",b:"パートナー"},rows6=[],month=today().slice(0,7),chan=null,loaded=false,seq=0;
let tab="breakdown",trendCat="全体";
let editing=null,formCat=CATS[0].n,formPayer="a",prefPayer="a";
try{prefPayer=localStorage.getItem("payer")||"a"}catch(e){}

/* ---------- 認証 ---------- */
function show(session){
  $("boot").classList.add("hide");
  $("login").classList.toggle("hide",!!session);
  $("app").classList.toggle("hide",!session);
  if(session&&!loaded){loaded=true;init()}
  if(!session){loaded=false;closeSheet();if(chan){sb.removeChannel(chan);chan=null}}
}
sb.auth.getSession().then(({data})=>show(data.session));
sb.auth.onAuthStateChange((_e,s)=>show(s));
$("li").onclick=async()=>{
  const {error}=await sb.auth.signInWithPassword({email:$("em").value.trim(),password:$("pw").value});
  if(error)alert("ログインできませんでした。メールアドレスとパスワードを確認してください。");
};
$("lo").onclick=()=>sb.auth.signOut();

/* ---------- データ(表示中の月を含む直近6か月分を取得) ---------- */
async function fetchRange(a,b){
  let all=[],from=0;
  for(;;){
    const {data,error}=await sb.from("entries").select("*").gte("date",a).lt("date",b)
      .order("date",{ascending:false}).order("id",{ascending:false}).range(from,from+999);
    if(error)throw error;
    all=all.concat(data);if(data.length<1000)return all;from+=1000;
  }
}
async function load(){
  const my=++seq;
  try{
    const data=await fetchRange(monthAdd(month,-5)+"-01",monthAdd(month,1)+"-01");
    if(my!==seq)return;
    rows6=data;msg("");render();
  }catch(e){if(my===seq)msg("読み込みに失敗しました: "+e.message)}
}
async function loadNames(){
  const {data}=await sb.from("settings").select("*");
  (data||[]).forEach(r=>{if(r.key==="name_a")names.a=r.value;if(r.key==="name_b")names.b=r.value});
  $("na").value=names.a;$("nb").value=names.b;
  renderPayer();render();
}
async function init(){
  render();
  await loadNames();await load();
  chan=sb.channel("kakeibo")
    .on("postgres_changes",{event:"*",schema:"public",table:"entries"},load)
    .on("postgres_changes",{event:"*",schema:"public",table:"settings"},loadNames)
    .subscribe();
}

/* ---------- 月の切り替え・タブ ---------- */
$("pv").onclick=()=>{month=monthAdd(month,-1);render();load()};
$("nx").onclick=()=>{month=monthAdd(month,1);render();load()};
$("tabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{
  tab=b.dataset.t;
  $("tabs").querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));
  renderPanel();
});

/* ---------- 表示 ---------- */
const inMonth=m=>rows6.filter(e=>e.date.startsWith(m));
function sumBy(list){const s={};list.forEach(e=>{s[e.category]=(s[e.category]||0)+e.amount});return s}
const total=list=>list.reduce((t,e)=>t+e.amount,0);

function render(){
  const [y,m]=month.split("-");$("ml").textContent=y+"年"+Number(m)+"月";
  const cur=inMonth(month);
  let pa=0,pb=0;cur.forEach(e=>{if(e.payer==="a")pa+=e.amount;else pb+=e.amount});
  $("tot").textContent=yen(pa+pb);
  $("pa").textContent=names.a+" "+yen(pa)+" / "+names.b+" "+yen(pb);
  renderPanel();renderList(cur);
}

function renderPanel(){
  const p=$("panel");p.innerHTML="";
  if(tab==="breakdown")breakdown(p);else if(tab==="compare")compare(p);else trend(p);
}

function breakdown(p){
  const cur=inMonth(month),tot=total(cur),s=sumBy(cur);
  if(!tot){p.appendChild(el("div","sub","この月の記録はまだありません"));return}
  Object.entries(s).sort((x,z)=>z[1]-x[1]).forEach(([k,v])=>{
    const r=el("div","cr"),m=el("div","m"),nm=el("div","nm");
    nm.append(el("span","ell",k+" ("+Math.round(v/tot*100)+"%)"),el("b",null,yen(v)));
    const bar=el("div","bar");bar.style.width=(v/tot*100)+"%";bar.style.background=catOf(k).c;
    m.append(nm,bar);r.append(icon(k),m);p.appendChild(r);
  });
}

function diffEl(d){
  if(d===0)return el("span","dif","±0");
  return el("span","dif "+(d>0?"up":"down"),(d>0?"▲ +":"▼ -")+yen(Math.abs(d)).slice(1));
}
function compare(p){
  const pm=monthAdd(month,-1),cur=inMonth(month),prev=inMonth(pm);
  const s=sumBy(cur),ps=sumBy(prev),tc=total(cur),tp=total(prev);
  if(!tc&&!tp){p.appendChild(el("div","sub",mLabel(pm)+"・"+mLabel(month)+"ともに記録がありません"));return}
  const head=el("div","cmp-sum nm");
  head.append(el("span",null,mLabel(pm)+" "+yen(tp)+" → "+mLabel(month)+" "+yen(tc)),diffEl(tc-tp));
  p.appendChild(head);
  const keys=CATS.map(c=>c.n).concat(Object.keys(s).concat(Object.keys(ps)).filter(k=>!CATS.some(c=>c.n===k)))
    .filter((k,i,a)=>a.indexOf(k)===i&&(s[k]||ps[k]))
    .sort((x,z)=>(s[z]||0)-(s[x]||0)||(ps[z]||0)-(ps[x]||0));
  keys.forEach(k=>{
    const a=s[k]||0,b=ps[k]||0;
    const r=el("div","cr"),m=el("div","m"),nm=el("div","nm");
    nm.append(el("span","ell",k),el("b",null,yen(a)));
    const sub=el("div","nm");
    sub.append(el("span","sub",mLabel(pm)+" "+yen(b)),diffEl(a-b));
    m.append(nm,sub);r.append(icon(k),m);p.appendChild(r);
  });
}

function shortYen(v){return v>=10000?(Math.round(v/1000)/10)+"万":Math.round(v).toLocaleString("ja-JP")}
function trend(p){
  const sel=el("select");sel.setAttribute("aria-label","カテゴリ");
  ["全体"].concat(CATS.map(c=>c.n)).forEach(n=>{const o=el("option",null,n);o.value=n;sel.appendChild(o)});
  sel.value=trendCat;sel.onchange=()=>{trendCat=sel.value;renderPanel()};
  p.appendChild(sel);
  const months=[];for(let i=-5;i<=0;i++)months.push(monthAdd(month,i));
  const vals=months.map(m=>total(inMonth(m).filter(e=>trendCat==="全体"||e.category===trendCat)));
  const max=Math.max.apply(null,vals);
  const ch=el("div","chart");
  months.forEach((m,i)=>{
    const col=el("div","col"+(m===month?" on":""));
    const b=el("div","b");b.style.height=(max?Math.max(2,vals[i]/max*120):2)+"px";
    if(m!==month&&trendCat!=="全体"){b.style.background=catOf(trendCat).c+"66"}
    else if(trendCat!=="全体"){b.style.background=catOf(trendCat).c}
    col.append(el("div","v",vals[i]?shortYen(vals[i]):"-"),b,el("div","l",mLabel(m)));
    ch.appendChild(col);
  });
  p.appendChild(ch);
  const avg=vals.reduce((a,b)=>a+b,0)/6;
  p.appendChild(el("div","sub mt10","6か月の平均 "+yen(avg)+" / 月"));
}

function renderList(cur){
  const box=$("list");box.innerHTML="";
  if(!cur.length){box.appendChild(el("div","sub","この月の記録はまだありません。右下の「＋」から追加できます"));return}
  cur.forEach(e=>{
    const r=el("div","it");r.tabIndex=0;r.setAttribute("role","button");
    r.setAttribute("aria-label",e.category+" "+yen(e.amount)+" を編集");
    const m=el("div","m");
    m.append(el("div","ell",e.category+(e.memo?"  "+e.memo:"")),
      el("div","t",e.date.slice(5).replace("-","/")+"  "+(names[e.payer]||"")+"が支払い"));
    r.append(icon(e.category),m,el("b",null,yen(e.amount)),el("span","chev","›"));
    r.onclick=()=>openSheet(e);
    r.onkeydown=ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();openSheet(e)}};
    box.appendChild(r);
  });
}

/* ---------- 入力シート(追加・編集) ---------- */
function renderCatBtn(){
  const b=$("catbtn");b.innerHTML="";
  b.append(icon(formCat),el("span","cn",formCat),el("span","chev","›"));
}
function renderCats(){
  const box=$("cats");box.innerHTML="";
  CATS.forEach(c=>{
    const b=el("button",c.n===formCat?"on":"");b.type="button";
    b.setAttribute("aria-pressed",c.n===formCat?"true":"false");
    b.append(icon(c.n),el("span",null,c.n));
    b.onclick=()=>{formCat=c.n;renderCatBtn();closePicker()};
    box.appendChild(b);
  });
  renderCatBtn();
}
function openPicker(){
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  renderCats();
  $("cov").classList.remove("hide");$("cpick").classList.remove("hide");
}
function closePicker(){
  $("cov").classList.add("hide");$("cpick").classList.add("hide");
  $("catbtn").focus();
}
$("catbtn").onclick=openPicker;
$("cov").onclick=closePicker;
$("cp-x").onclick=closePicker;
function renderPayer(){
  const box=$("payer");box.innerHTML="";
  ["a","b"].forEach(k=>{
    const b=el("button",formPayer===k?"on":"",names[k]);b.type="button";
    b.setAttribute("aria-pressed",formPayer===k?"true":"false");
    b.onclick=()=>{formPayer=k;if(!editing){prefPayer=k;try{localStorage.setItem("payer",k)}catch(e){}}renderPayer()};
    box.appendChild(b);
  });
}
let lastFocus=null;
function openSheet(e){
  editing=e||null;lastFocus=document.activeElement;smsg("");
  $("sh-t").textContent=editing?"記録を編集":"記録を追加";
  $("save").textContent=editing?"更新":"追加";
  $("del").classList.toggle("hide",!editing);
  $("amt").value=editing?editing.amount:"";
  $("d").value=editing?editing.date:today();
  $("memo").value=editing&&editing.memo?editing.memo:"";
  formCat=editing?editing.category:formCat;
  formPayer=editing?editing.payer:prefPayer;
  renderCats();renderPayer();
  $("ov").classList.remove("hide");$("sheet").classList.remove("hide");
  document.body.classList.add("lock");$("sheet").scrollTop=0;
  if(!editing)$("amt").focus();
}
function closeSheet(){
  $("cov").classList.add("hide");$("cpick").classList.add("hide");
  $("ov").classList.add("hide");$("sheet").classList.add("hide");
  document.body.classList.remove("lock");editing=null;
  if(lastFocus&&lastFocus.focus)lastFocus.focus();lastFocus=null;
}
$("fab").onclick=()=>openSheet(null);
$("ov").onclick=closeSheet;
$("sh-x").onclick=closeSheet;
document.addEventListener("keydown",ev=>{
  if(ev.key!=="Escape")return;
  if(!$("cpick").classList.contains("hide"))closePicker();
  else if(!$("sheet").classList.contains("hide"))closeSheet();
});

$("save").onclick=async()=>{
  const amount=Math.round(Number($("amt").value));
  if(!amount||amount<=0){smsg("金額を入力してください");$("amt").focus();return}
  if(!$("d").value){smsg("日付を入力してください");$("d").focus();return}
  const row={date:$("d").value,amount:amount,category:formCat,payer:formPayer,memo:$("memo").value.trim()||null};
  $("save").disabled=true;
  const {error}=editing
    ?await sb.from("entries").update(row).eq("id",editing.id)
    :await sb.from("entries").insert(row);
  $("save").disabled=false;
  if(error){smsg("保存に失敗しました: "+error.message);return}
  closeSheet();
  month=row.date.slice(0,7);
  await load();
};
$("del").onclick=async()=>{
  if(!editing)return;
  if(!confirm("この記録を削除しますか?\n"+editing.date+" "+editing.category+" "+yen(editing.amount)))return;
  const {error}=await sb.from("entries").delete().eq("id",editing.id);
  if(error){smsg("削除に失敗しました: "+error.message);return}
  closeSheet();await load();
};

/* ---------- 名前の変更 ---------- */
$("sn").onclick=async()=>{
  const a=$("na").value.trim()||"自分",b=$("nb").value.trim()||"パートナー";
  const {error}=await sb.from("settings").upsert([{key:"name_a",value:a},{key:"name_b",value:b}]);
  if(error)msg("名前の保存に失敗しました: "+error.message);else{names={a:a,b:b};renderPayer();render()}
};

/* ---------- CSV書き出し(全期間) ---------- */
$("ex").onclick=async()=>{
  let all=[],from=0;
  for(;;){
    const {data,error}=await sb.from("entries").select("*").order("date").order("id").range(from,from+999);
    if(error){msg("書き出しに失敗しました: "+error.message);return}
    all=all.concat(data);if(data.length<1000)break;from+=1000;
  }
  const q=s=>'"'+String(s==null?"":s).replace(/"/g,'""')+'"';
  const out=[["日付","金額","カテゴリ","払った人","メモ"]].concat(all.map(e=>[e.date,e.amount,e.category,names[e.payer]||"",e.memo]));
  const csv="﻿"+out.map(r=>r.map(q).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  const a=document.createElement("a");a.href=url;a.download="kakeibo-"+today()+".csv";
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
};
