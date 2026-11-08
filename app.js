const SUPABASE_URL="https://pjdbmpclqjhkdxnkgymd.supabase.co";
const SUPABASE_KEY="sb_publishable_Rph11ekGQmY3VYYGAHTtIA_RRf94wNS";
const DEFAULT_CATS=[
  ["食費","🍴","#e5484d"],["外食","🍣","#d9822b"],["日用品","🪥","#5fb87c"],["お出かけ・娯楽","⭐","#e0508a"],
  ["交際費","👥","#3f6fb5"],["交通費","🚃","#6a4fb3"],["衣服・美容","👕","#f2a93b"],["健康・医療","🏥","#f2735a"],
  ["自動車","🚗","#8a8f98"],["教養・教育","📘","#5b7fc7"],["子ども・育児","🍼","#4fb3c7"],["特別な支出","❗","#9cbf6a"]
].map((c,i)=>({id:null,name:c[0],icon:c[1],color:c[2],sort_order:i+1,hidden:false}));
let cats=DEFAULT_CATS.slice(),catsDb=false;
const $=id=>document.getElementById(id);
const yen=n=>"¥"+Math.round(n).toLocaleString("ja-JP");
const pad=n=>String(n).padStart(2,"0");
const today=()=>{const t=new Date();return t.getFullYear()+"-"+pad(t.getMonth()+1)+"-"+pad(t.getDate())};
const monthAdd=(m,n)=>{const [y,mo]=m.split("-").map(Number);const d=new Date(y,mo-1+n,1);return d.getFullYear()+"-"+pad(d.getMonth()+1)};
const mLabel=m=>Number(m.slice(5))+"月";
const catOf=n=>cats.find(c=>c.name===n)||{name:n,icon:"・",color:"#999999"};
const visibleCats=()=>cats.filter(c=>!c.hidden);
function allCatNames(){const a=cats.map(c=>c.name);rows6.forEach(e=>{if(a.indexOf(e.category)<0)a.push(e.category)});return a}
/* 固定費の日付: 指定日が月の日数を超えるときは月末日にする(31 = 月末) */
function dateFor(m,day){
  const [y,mo]=m.split("-").map(Number);
  const last=new Date(y,mo,0).getDate();
  return m+"-"+pad(Math.min(day,last));
}
const dayLabel=d=>d>=31?"月末":d+"日";
const dayOf=s=>Number((s||"").slice(8,10))||1;
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function icon(name){const c=catOf(name);const s=el("span","ic",c.icon);s.style.background=c.color+"33";return s}
function fillDays(sel){
  sel.innerHTML="";
  for(let i=1;i<=31;i++){const o=el("option",null,dayLabel(i));o.value=String(i);sel.appendChild(o)}
}
const msg=t=>{$("st").textContent=t||""};
const smsg=t=>{$("sh-st").textContent=t||""};
const emsg=t=>{$("re-st").textContent=t||""};
const hidden=id=>$(id).classList.contains("hide");
const lockOn=()=>document.body.classList.add("lock");
const lockOff=()=>{if(hidden("sheet")&&hidden("rsheet")&&hidden("csheet"))document.body.classList.remove("lock")};

/* ライブラリが読めないときは画面に表示する */
if(typeof supabase==="undefined"){
  $("boot").textContent="ライブラリ(supabase.min.js)を読み込めませんでした。ファイルが正しく置かれているか確認してください。";
  throw new Error("supabase.min.js not loaded");
}
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let names={a:"自分",b:"パートナー"},rows6=[],month=today().slice(0,7),chan=null,loaded=false,seq=0;
let tab="breakdown",trendCat="全体";
let editing=null,formCat=DEFAULT_CATS[0].name,formPayer="a",prefPayer="a",dayTouched=false;
try{prefPayer=localStorage.getItem("payer")||"a"}catch(e){}
fillDays($("rday"));fillDays($("rday2"));

/* ---------- 認証 ---------- */
function show(session){
  $("boot").classList.add("hide");
  $("login").classList.toggle("hide",!!session);
  $("app").classList.toggle("hide",!session);
  if(session&&!loaded){loaded=true;init()}
  if(!session){loaded=false;closeCats();closeRules();closeSheet();if(chan){sb.removeChannel(chan);chan=null}}
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
  await loadNames();
  await loadCats();
  await runRecurring();
  await load();
  chan=sb.channel("kakeibo")
    .on("postgres_changes",{event:"*",schema:"public",table:"entries"},load)
    .on("postgres_changes",{event:"*",schema:"public",table:"settings"},loadNames)
    .on("postgres_changes",{event:"*",schema:"public",table:"categories"},loadCats)
    .subscribe();
}
/* 開いたままのアプリに戻ってきたときも、固定費の自動追加を確認する */
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden&&loaded)runRecurring().then(n=>{if(n)load()});
});

/* ---------- 固定費の自動追加 ----------
   ルールごとの「作成済みの月(last_month)」を先に更新できた端末だけが記録を追加する。
   ふたりが同時に開いても二重に作られず、削除した月も復活しない。 */
let genBusy=false;
async function runRecurring(){
  if(genBusy)return 0;
  genBusy=true;
  try{
    const td=today(),cur=td.slice(0,7);
    const {data:rules,error}=await sb.from("recurring").select("*").eq("active",true);
    if(error||!rules)return 0;
    let made=0;
    for(const r of rules){
      let last=r.last_month;
      for(let m=monthAdd(last,1);m<=cur;m=monthAdd(m,1)){
        if(r.end_month&&m>r.end_month)break;
        const date=dateFor(m,r.day);
        if(date>td)break;
        const c=await sb.from("recurring").update({last_month:m}).eq("id",r.id).eq("last_month",last).select("id");
        if(c.error||!c.data||!c.data.length)break;
        last=m;
        const ins=await sb.from("entries").insert({date:date,amount:r.amount,category:r.category,payer:r.payer,memo:r.memo,recurring_id:r.id});
        if(ins.error){
          await sb.from("recurring").update({last_month:monthAdd(m,-1)}).eq("id",r.id).eq("last_month",m);
          msg("固定費の自動追加に失敗しました: "+ins.error.message);
          break;
        }
        made++;
      }
    }
    return made;
  }catch(e){return 0}
  finally{genBusy=false}
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
    const bar=el("div","bar");bar.style.width=(v/tot*100)+"%";bar.style.background=catOf(k).color;
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
  const keys=allCatNames().concat(Object.keys(s).concat(Object.keys(ps)))
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
  ["全体"].concat(allCatNames()).forEach(n=>{const o=el("option",null,n);o.value=n;sel.appendChild(o)});
  sel.value=trendCat;sel.onchange=()=>{trendCat=sel.value;renderPanel()};
  p.appendChild(sel);
  const months=[];for(let i=-5;i<=0;i++)months.push(monthAdd(month,i));
  const vals=months.map(m=>total(inMonth(m).filter(e=>trendCat==="全体"||e.category===trendCat)));
  const max=Math.max.apply(null,vals);
  const ch=el("div","chart");
  months.forEach((m,i)=>{
    const col=el("div","col"+(m===month?" on":""));
    const b=el("div","b");b.style.height=(max?Math.max(2,vals[i]/max*120):2)+"px";
    if(m!==month&&trendCat!=="全体"){b.style.background=catOf(trendCat).color+"66"}
    else if(trendCat!=="全体"){b.style.background=catOf(trendCat).color}
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
    m.append(el("div","ell",e.memo||e.category),
      el("div","t",(e.recurring_id?"🔁 ":"")+e.date.slice(5).replace("-","/")+"  "+(names[e.payer]||"")+"が支払い"));
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
  const list=visibleCats();
  if(!list.some(c=>c.name===formCat))list.push(catOf(formCat));
  list.forEach(c=>{
    const b=el("button",c.name===formCat?"on":"");b.type="button";
    b.setAttribute("aria-pressed",c.name===formCat?"true":"false");
    b.append(icon(c.name),el("span",null,c.name));
    b.onclick=()=>{formCat=c.name;renderCatBtn();closePicker()};
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
/* 「毎月くり返す」スイッチ */
$("rep").onchange=()=>{
  $("repbox").classList.toggle("hide",!$("rep").checked);
  if($("rep").checked&&!dayTouched)$("rday").value=String(dayOf($("d").value));
};
$("d").onchange=()=>{if($("rep").checked&&!dayTouched)$("rday").value=String(dayOf($("d").value))};
$("rday").onchange=()=>{dayTouched=true};

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
  if(!editing&&!visibleCats().some(c=>c.name===formCat)&&visibleCats().length)formCat=visibleCats()[0].name;
  formPayer=editing?editing.payer:prefPayer;
  const fromRule=!!(editing&&editing.recurring_id);
  $("reprow").classList.toggle("hide",fromRule);
  $("repnote").classList.toggle("hide",!fromRule);
  $("rep").checked=false;$("repbox").classList.add("hide");
  $("rend").value="";dayTouched=false;$("rday").value=String(dayOf($("d").value));
  renderCats();renderPayer();
  $("ov").classList.remove("hide");$("sheet").classList.remove("hide");
  lockOn();$("sheet").scrollTop=0;
}
function closeSheet(){
  $("cov").classList.add("hide");$("cpick").classList.add("hide");
  $("ov").classList.add("hide");$("sheet").classList.add("hide");
  lockOff();editing=null;
  if(lastFocus&&lastFocus.focus)lastFocus.focus();lastFocus=null;
}
/* キーボードは自動では出さない。入力欄をタップしたときだけ出て、Enterか欄の外のタップで閉じる */
["amt","memo"].forEach(id=>$(id).addEventListener("keydown",ev=>{if(ev.key==="Enter"){ev.preventDefault();ev.target.blur()}}));
$("sheet").addEventListener("click",ev=>{
  const a=document.activeElement;
  if(a&&a.tagName==="INPUT"&&!ev.target.closest("input,select,label,.amtwrap"))a.blur();
});
$("fab").onclick=()=>openSheet(null);
$("ov").onclick=closeSheet;
$("sh-x").onclick=closeSheet;
document.addEventListener("keydown",ev=>{
  if(ev.key!=="Escape")return;
  if(!hidden("cpick"))closePicker();
  else if(!hidden("cedit"))closeCatEdit();
  else if(!hidden("csheet"))closeCats();
  else if(!hidden("redit"))closeRuleEdit();
  else if(!hidden("rsheet"))closeRules();
  else if(!hidden("sheet"))closeSheet();
});

$("save").onclick=async()=>{
  const amount=Math.round(Number($("amt").value));
  if(!amount||amount<=0){smsg("金額を入力してください");$("amt").focus();return}
  if(!$("d").value){smsg("日付を入力してください");$("d").focus();return}
  const row={date:$("d").value,amount:amount,category:formCat,payer:formPayer,memo:$("memo").value.trim()||null};
  const wantRep=$("rep").checked&&!$("reprow").classList.contains("hide");
  const start=row.date.slice(0,7),end=$("rend").value||null;
  if(wantRep&&end&&end<start){smsg("終了月は、記録の月以降にしてください");return}
  $("save").disabled=true;
  try{
    let ruleId=null;
    if(wantRep){
      const r=await sb.from("recurring").insert({day:Number($("rday").value),amount:amount,category:formCat,payer:formPayer,memo:row.memo,start_month:start,last_month:start,end_month:end,active:true}).select("id").single();
      if(r.error||!r.data){smsg("固定費の登録に失敗しました: "+(r.error?r.error.message:"")+"(データベースの準備が済んでいるか確認してください)");return}
      ruleId=r.data.id;row.recurring_id=ruleId;
    }
    const {error}=editing
      ?await sb.from("entries").update(row).eq("id",editing.id)
      :await sb.from("entries").insert(row);
    if(error){
      if(ruleId)await sb.from("recurring").delete().eq("id",ruleId);
      smsg("保存に失敗しました: "+error.message);return;
    }
    closeSheet();
    month=row.date.slice(0,7);
    await load();
  }finally{$("save").disabled=false}
};
$("del").onclick=async()=>{
  if(!editing)return;
  if(!confirm("この記録を削除しますか?\n"+editing.date+" "+editing.category+" "+yen(editing.amount)+(editing.recurring_id?"\n(固定費の設定は残り、この月の分は再作成されません)":"")))return;
  const {error}=await sb.from("entries").delete().eq("id",editing.id);
  if(error){smsg("削除に失敗しました: "+error.message);return}
  closeSheet();await load();
};

/* ---------- 固定費の管理 ---------- */
let editRule=null;
async function loadRules(){
  const box=$("rlist");box.innerHTML="";
  const {data,error}=await sb.from("recurring").select("*").order("id");
  if(error){box.appendChild(el("div","err","読み込みに失敗しました: "+error.message));return}
  if(!data.length){box.appendChild(el("div","sub","固定費はまだ登録されていません。記録の追加画面で「毎月くり返す」をONにすると登録できます。"));return}
  data.forEach(r=>{
    const row=el("div","it");row.tabIndex=0;row.setAttribute("role","button");
    const m=el("div","m");
    const next=monthAdd(r.last_month,1);
    const fin=r.end_month&&next>r.end_month;
    const info=["毎月"+dayLabel(r.day),names[r.payer]||""];
    if(r.end_month)info.push("〜"+r.end_month);
    info.push(!r.active?"停止中":fin?"終了":"次回 "+dateFor(next,r.day).slice(5).replace("-","/"));
    m.append(el("div","ell",(r.memo||r.category)),el("div","t",info.join(" · ")));
    row.append(icon(r.category),m,el("b",null,yen(r.amount)),el("span","chev","›"));
    row.onclick=()=>openRuleEdit(r);
    row.onkeydown=ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();openRuleEdit(r)}};
    box.appendChild(row);
  });
}
function openRules(){
  lastFocus=document.activeElement;
  $("rov").classList.remove("hide");$("rsheet").classList.remove("hide");
  lockOn();$("rsheet").scrollTop=0;loadRules();
}
function closeRules(){
  closeRuleEdit();
  $("rov").classList.add("hide");$("rsheet").classList.add("hide");
  lockOff();
}
function openRuleEdit(r){
  editRule=r;emsg("");
  $("rinfo").textContent=r.category+" · "+(names[r.payer]||"")+" · "+r.start_month+" から";
  $("ramt").value=r.amount;$("rday2").value=String(r.day);
  $("rend2").value=r.end_month||"";$("rmemo").value=r.memo||"";$("ract").checked=!!r.active;
  $("eov").classList.remove("hide");$("redit").classList.remove("hide");$("redit").scrollTop=0;
}
function closeRuleEdit(){
  $("eov").classList.add("hide");$("redit").classList.add("hide");editRule=null;
}
$("rm").onclick=openRules;
$("rov").onclick=closeRules;
$("rs-x").onclick=closeRules;
$("eov").onclick=closeRuleEdit;
$("re-x").onclick=closeRuleEdit;
$("rsave").onclick=async()=>{
  if(!editRule)return;
  const amount=Math.round(Number($("ramt").value));
  if(!amount||amount<=0){emsg("金額を入力してください");return}
  const end=$("rend2").value||null;
  if(end&&end<editRule.start_month){emsg("終了月は、開始月("+editRule.start_month+")以降にしてください");return}
  const act=$("ract").checked;
  const patch={amount:amount,day:Number($("rday2").value),memo:$("rmemo").value.trim()||null,end_month:end,active:act};
  /* 停止していた固定費を再開したときは、止めていた月をさかのぼって作らない */
  if(act&&!editRule.active){
    const prev=monthAdd(today().slice(0,7),-1);
    if(editRule.last_month<prev)patch.last_month=prev;
  }
  $("rsave").disabled=true;
  try{
    const {error}=await sb.from("recurring").update(patch).eq("id",editRule.id);
    if(error){emsg("保存に失敗しました: "+error.message);return}
    closeRuleEdit();await loadRules();
    if(await runRecurring())await load();
  }finally{$("rsave").disabled=false}
};
$("rdel").onclick=async()=>{
  if(!editRule)return;
  if(!confirm("この固定費を削除しますか?\n過去に作られた記録は、そのまま残ります。"))return;
  const {error}=await sb.from("recurring").delete().eq("id",editRule.id);
  if(error){emsg("削除に失敗しました: "+error.message);return}
  closeRuleEdit();await loadRules();await load();
};

/* ---------- カテゴリ(ふたりで共通。DB未準備のときは初期の12個で動く) ---------- */
async function loadCats(){
  try{
    const {data,error}=await sb.from("categories").select("*").order("sort_order").order("id");
    if(!error&&data&&data.length){cats=data;catsDb=true}else{cats=DEFAULT_CATS.slice();catsDb=false}
  }catch(e){cats=DEFAULT_CATS.slice();catsDb=false}
  render();
  if(!hidden("sheet"))renderCatBtn();
  if(!hidden("csheet"))renderCatList();
}
const SWATCHES=["#e5484d","#f2735a","#d9822b","#f2a93b","#9cbf6a","#5fb87c","#4fb3c7","#5b7fc7","#3f6fb5","#6a4fb3","#e0508a","#8a8f98","#c98a4f"];
const EMOJIS=("🍴 🍚 🍙 🍜 🍣 🍱 🍞 🥗 🍖 🍳 🥛 🍎 🍺 🍷 ☕ 🍰 🍔 🍕 🍦 "+
  "🛒 🪥 🧻 🧴 🧼 🏠 🛋️ 💡 🔌 📺 🧹 🛏️ 🔑 📦 "+
  "🚃 🚌 🚗 ⛽ 🚕 ✈️ 🚲 🛵 🅿️ "+
  "🍼 👶 🧸 🎒 👕 👗 👟 🎈 🎓 📘 ✏️ "+
  "⭐ 🎬 🎮 🎵 🎤 ⚽ ⛳ 🎣 ♨️ 🏖️ 🎡 🎁 🎂 🎉 📷 👥 "+
  "🏥 💊 🦷 💇 💄 🏋️ 🧘 👓 "+
  "💳 💰 🧾 🏦 📈 📱 💻 🐶 🐱 🌱 🔧 ✂️ ❗ 🙏").split(" ");
function firstGlyph(v){
  v=(v||"").trim();if(!v)return"";
  try{for(const x of new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(v))return x.segment}catch(e){}
  return Array.from(v)[0];
}
const cmsg=t=>{$("ce-st").textContent=t||""};
let usage={use:{},ru:{}},usageOk=false,ce=null;
async function countUsage(){
  const use={},ru={};let from=0;
  for(;;){
    const {data,error}=await sb.from("entries").select("category").order("id").range(from,from+999);
    if(error)throw error;
    data.forEach(r=>{use[r.category]=(use[r.category]||0)+1});
    if(data.length<1000)break;from+=1000;
  }
  const r=await sb.from("recurring").select("category");
  (r.data||[]).forEach(x=>{ru[x.category]=(ru[x.category]||0)+1});
  return {use:use,ru:ru};
}
function renderCatList(){
  const box=$("clist");box.innerHTML="";
  $("cadd").classList.toggle("hide",!catsDb);
  if(!catsDb){box.appendChild(el("div","sub","カテゴリを編集するには、データベースの準備(categories.sql の実行)が必要です。"));return}
  cats.forEach((c,i)=>{
    const row=el("div","it");row.tabIndex=0;row.setAttribute("role","button");
    const m=el("div","m");
    const info=[];if(c.hidden)info.push("非表示");
    if(usageOk)info.push((usage.use[c.name]||0)+"件"+(usage.ru[c.name]?" · 固定費"+usage.ru[c.name]:""));
    m.append(el("div","ell",c.name),el("div","t",info.join(" · ")));
    const up=el("button","arr","▲"),dn=el("button","arr","▼");
    up.setAttribute("aria-label",c.name+"を上へ");dn.setAttribute("aria-label",c.name+"を下へ");
    up.disabled=i===0;dn.disabled=i===cats.length-1;
    up.onclick=ev=>{ev.stopPropagation();moveCat(i,-1)};dn.onclick=ev=>{ev.stopPropagation();moveCat(i,1)};
    row.append(icon(c.name),m,up,dn);
    if(c.hidden)row.classList.add("dim");
    row.onclick=()=>openCatEdit(c);
    row.onkeydown=ev=>{if(ev.target===row&&(ev.key==="Enter"||ev.key===" ")){ev.preventDefault();openCatEdit(c)}};
    box.appendChild(row);
  });
}
async function moveCat(i,d){
  const j=i+d;if(j<0||j>=cats.length)return;
  const arr=cats.slice();const t=arr[i];arr[i]=arr[j];arr[j]=t;
  const ups=[];
  arr.forEach((c,k)=>{if(c.sort_order!==k+1)ups.push(sb.from("categories").update({sort_order:k+1}).eq("id",c.id))});
  const res=await Promise.all(ups);
  if(res.some(r=>r.error))msg("並べ替えに失敗しました");
  await loadCats();
}
async function openCats(){
  lastFocus=document.activeElement;
  $("cmov").classList.remove("hide");$("csheet").classList.remove("hide");
  lockOn();$("csheet").scrollTop=0;usageOk=false;renderCatList();
  try{usage=await countUsage();usageOk=true}catch(e){}
  if(!hidden("csheet"))renderCatList();
}
function closeCats(){
  closeCatEdit();
  $("cmov").classList.add("hide");$("csheet").classList.add("hide");lockOff();
}
function renderCePrev(){
  const p=$("cprev");p.innerHTML="";
  const s=el("span","ic",ce.icon);s.style.background=ce.color+"33";
  p.append(s,el("span",null,$("cname").value.trim()||"(名前)"));
}
function renderEmo(){
  const g=$("emo");g.innerHTML="";
  EMOJIS.forEach(x=>{
    const b=el("button",x===ce.icon?"on":"",x);b.type="button";b.setAttribute("aria-label","アイコン "+x);
    b.onclick=()=>{ce.icon=x;$("cicon").value=x;renderEmo();renderCePrev()};g.appendChild(b);
  });
}
function renderSw(){
  const g=$("sw");g.innerHTML="";
  SWATCHES.forEach(x=>{
    const b=el("button",x===ce.color?"on":"");b.type="button";b.style.background=x;b.setAttribute("aria-label","色 "+x);
    b.onclick=()=>{ce.color=x;renderSw();renderCePrev()};g.appendChild(b);
  });
}
function openCatEdit(c){
  ce=c?{id:c.id,name:c.name,icon:c.icon,color:c.color,hidden:c.hidden}:{id:null,name:"",icon:"📦",color:SWATCHES[0],hidden:false};
  cmsg("");
  $("ce-t").textContent=c?"カテゴリを編集":"カテゴリを追加";
  $("cs-save").textContent=c?"保存":"追加";
  $("cname").value=ce.name;$("cicon").value=ce.icon;$("cshow").checked=!ce.hidden;
  $("cshowrow").classList.toggle("hide",!c);$("cmergebox").classList.toggle("hide",!c);$("cdel").classList.toggle("hide",!c);
  $("cmreg").classList.add("hide");
  const sel=$("cmsel");sel.innerHTML="";
  cats.filter(x=>!c||x.id!==c.id).forEach(x=>{const o=el("option",null,x.icon+" "+x.name);o.value=x.name;sel.appendChild(o)});
  renderEmo();renderSw();renderCePrev();
  $("ceov").classList.remove("hide");$("cedit").classList.remove("hide");$("cedit").scrollTop=0;
}
function closeCatEdit(){$("ceov").classList.add("hide");$("cedit").classList.add("hide");ce=null}
$("cicon").addEventListener("input",()=>{const g=firstGlyph($("cicon").value);if(g&&ce){ce.icon=g;renderEmo();renderCePrev()}});
$("cicon").addEventListener("blur",()=>{if(ce)$("cicon").value=ce.icon});
$("cname").addEventListener("input",()=>{if(ce)renderCePrev()});
["cname","cicon"].forEach(id=>$(id).addEventListener("keydown",ev=>{if(ev.key==="Enter"){ev.preventDefault();ev.target.blur()}}));
$("cm").onclick=openCats;$("cmov").onclick=closeCats;$("cs-x").onclick=closeCats;
$("ceov").onclick=closeCatEdit;$("ce-x").onclick=closeCatEdit;
$("cadd").onclick=()=>openCatEdit(null);
$("cmbtn").onclick=()=>$("cmreg").classList.toggle("hide");
async function after(){await loadCats();usage=await countUsage().catch(()=>usage);renderCatList();await load()}
$("cs-save").onclick=async()=>{
  if(!ce)return;
  const name=$("cname").value.trim();
  if(!name){cmsg("名前を入力してください");return}
  if(name.length>20){cmsg("名前は20文字以内にしてください");return}
  if(cats.some(c=>c.name===name&&c.id!==ce.id)){cmsg("同じ名前のカテゴリがあります");return}
  const hide=ce.id!=null&&!$("cshow").checked;
  if(hide&&visibleCats().filter(c=>c.id!==ce.id).length===0){cmsg("すべてのカテゴリを非表示にはできません");return}
  $("cs-save").disabled=true;
  try{
    if(ce.id==null){
      const max=cats.reduce((m,c)=>Math.max(m,c.sort_order||0),0);
      const {error}=await sb.from("categories").insert({name:name,icon:ce.icon,color:ce.color,sort_order:max+1,hidden:false});
      if(error){cmsg("追加に失敗しました: "+error.message);return}
    }else{
      const o=cats.find(c=>c.id===ce.id),old=o?{name:o.name}:null;
      const {error}=await sb.from("categories").update({name:name,icon:ce.icon,color:ce.color,hidden:hide}).eq("id",ce.id);
      if(error){cmsg("保存に失敗しました: "+error.message);return}
      if(old&&old.name!==name){
        /* 過去の記録と固定費も新しい名前にそろえる。失敗したら元に戻す */
        const e1=await sb.from("entries").update({category:name}).eq("category",old.name);
        const e2=e1.error?e1:await sb.from("recurring").update({category:name}).eq("category",old.name);
        if(e1.error||e2.error){
          if(!e1.error)await sb.from("entries").update({category:old.name}).eq("category",name);
          await sb.from("categories").update({name:old.name}).eq("id",ce.id);
          cmsg("名前の変更に失敗しました: "+(e1.error||e2.error).message);return;
        }
        if(formCat===old.name)formCat=name;
        if(trendCat===old.name)trendCat=name;
      }
    }
    closeCatEdit();await after();
  }finally{$("cs-save").disabled=false}
};
$("cmgo").onclick=async()=>{
  if(!ce||ce.id==null)return;
  const from=cats.find(c=>c.id===ce.id),to=$("cmsel").value;
  if(!from||!to)return;
  let n="";try{const u=await countUsage();n=(u.use[from.name]||0)+"件"}catch(e){}
  if(!confirm("「"+from.name+"」の記録"+n+"と固定費を「"+to+"」に移して、「"+from.name+"」を削除しますか?"))return;
  const e1=await sb.from("entries").update({category:to}).eq("category",from.name);
  if(e1.error){cmsg("統合に失敗しました: "+e1.error.message);return}
  const e2=await sb.from("recurring").update({category:to}).eq("category",from.name);
  if(e2.error){cmsg("固定費の移動に失敗しました: "+e2.error.message);return}
  const e3=await sb.from("categories").delete().eq("id",from.id);
  if(e3.error){cmsg("記録は移しましたが、カテゴリの削除に失敗しました: "+e3.error.message);return}
  if(formCat===from.name)formCat=to;
  closeCatEdit();await after();
};
$("cdel").onclick=async()=>{
  if(!ce||ce.id==null)return;
  const c=cats.find(x=>x.id===ce.id);if(!c)return;
  let u;try{u=await countUsage()}catch(e){cmsg("件数の確認に失敗しました");return}
  const n=u.use[c.name]||0,r=u.ru[c.name]||0;
  if(n||r){cmsg("記録"+n+"件・固定費"+r+"件で使われているため削除できません。「非表示」か「統合」を使ってください。");return}
  if(visibleCats().filter(x=>x.id!==c.id).length===0){cmsg("最後のカテゴリは削除できません");return}
  if(!confirm("「"+c.name+"」を削除しますか?"))return;
  const {error}=await sb.from("categories").delete().eq("id",c.id);
  if(error){cmsg("削除に失敗しました: "+error.message);return}
  closeCatEdit();await after();
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
