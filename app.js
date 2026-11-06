const SUPABASE_URL="https://pjdbmpclqjhkdxnkgymd.supabase.co";
const SUPABASE_KEY="sb_publishable_Rph11ekGQmY3VYYGAHTtIA_RRf94wNS";
const CATS=[
  {n:"食費",i:"🍴",c:"#e5484d"},
  {n:"外食",i:"🍣",c:"#d9822b"},
  {n:"日用品",i:"🪥",c:"#5fb87c"},
  {n:"お出かけ・娯楽",i:"⭐",c:"#e0508a"},
  {n:"交際費",i:"👥",c:"#3f6fb5"},
  {n:"交通費",i:"🚃",c:"#6a4fb3"},
  {n:"衣服・美容",i:"👕",c:"#f2a93b"},
  {n:"健康・医療",i:"🏥",c:"#f2735a"},
  {n:"自動車",i:"🚗",c:"#8a8f98"},
  {n:"教養・教育",i:"📘",c:"#5b7fc7"},
  {n:"子ども・育児",i:"🍼",c:"#4fb3c7"},
  {n:"特別な支出",i:"❗",c:"#9cbf6a"}
];
const $=id=>document.getElementById(id);
const yen=n=>"¥"+Math.round(n).toLocaleString("ja-JP");
const pad=n=>String(n).padStart(2,"0");
const today=()=>{const t=new Date();return t.getFullYear()+"-"+pad(t.getMonth()+1)+"-"+pad(t.getDate())};
const monthAdd=(m,n)=>{const [y,mo]=m.split("-").map(Number);const d=new Date(y,mo-1+n,1);return d.getFullYear()+"-"+pad(d.getMonth()+1)};
const mLabel=m=>Number(m.slice(5))+"月";
const catOf=n=>CATS.find(c=>c.n===n)||{n:n,i:"・",c:"#999999"};
/* 固定費の日付: 指定日が月の日数を超えるときは月末日にする(31 = 月末) */
function dateFor(m,day){
  const [y,mo]=m.split("-").map(Number);
  const last=new Date(y,mo,0).getDate();
  return m+"-"+pad(Math.min(day,last));
}
const dayLabel=d=>d>=31?"月末":d+"日";
const dayOf=s=>Number((s||"").slice(8,10))||1;
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function icon(name){const c=catOf(name);const s=el("span","ic",c.i);s.style.background=c.c+"33";return s}
function fillDays(sel){
  sel.innerHTML="";
  for(let i=1;i<=31;i++){const o=el("option",null,dayLabel(i));o.value=String(i);sel.appendChild(o)}
}
const msg=t=>{$("st").textContent=t||""};
const smsg=t=>{$("sh-st").textContent=t||""};
const emsg=t=>{$("re-st").textContent=t||""};
const hidden=id=>$(id).classList.contains("hide");
const lockOn=()=>document.body.classList.add("lock");
const lockOff=()=>{if(hidden("sheet")&&hidden("rsheet"))document.body.classList.remove("lock")};

/* ライブラリが読めないときは画面に表示する */
if(typeof supabase==="undefined"){
  $("boot").textContent="ライブラリ(supabase.min.js)を読み込めませんでした。ファイルが正しく置かれているか確認してください。";
  throw new Error("supabase.min.js not loaded");
}
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let names={a:"自分",b:"パートナー"},rows6=[],month=today().slice(0,7),chan=null,loaded=false,seq=0;
let tab="breakdown",trendCat="全体";
let editing=null,formCat=CATS[0].n,formPayer="a",prefPayer="a",dayTouched=false;
try{prefPayer=localStorage.getItem("payer")||"a"}catch(e){}
fillDays($("rday"));fillDays($("rday2"));

/* ---------- 認証 ---------- */
function show(session){
  $("boot").classList.add("hide");
  $("login").classList.toggle("hide",!!session);
  $("app").classList.toggle("hide",!session);
  if(session&&!loaded){loaded=true;init()}
  if(!session){loaded=false;closeRules();closeSheet();if(chan){sb.removeChannel(chan);chan=null}}
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
  await runRecurring();
  await load();
  chan=sb.channel("kakeibo")
    .on("postgres_changes",{event:"*",schema:"public",table:"entries"},load)
    .on("postgres_changes",{event:"*",schema:"public",table:"settings"},loadNames)
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
  formPayer=editing?editing.payer:prefPayer;
  const fromRule=!!(editing&&editing.recurring_id);
  $("reprow").classList.toggle("hide",fromRule);
  $("repnote").classList.toggle("hide",!fromRule);
  $("rep").checked=false;$("repbox").classList.add("hide");
  $("rend").value="";dayTouched=false;$("rday").value=String(dayOf($("d").value));
  renderCats();renderPayer();
  $("ov").classList.remove("hide");$("sheet").classList.remove("hide");
  lockOn();$("sheet").scrollTop=0;
  if(!editing)$("amt").focus();
}
function closeSheet(){
  $("cov").classList.add("hide");$("cpick").classList.add("hide");
  $("ov").classList.add("hide");$("sheet").classList.add("hide");
  lockOff();editing=null;
  if(lastFocus&&lastFocus.focus)lastFocus.focus();lastFocus=null;
}
$("fab").onclick=()=>openSheet(null);
$("ov").onclick=closeSheet;
$("sh-x").onclick=closeSheet;
document.addEventListener("keydown",ev=>{
  if(ev.key!=="Escape")return;
  if(!hidden("cpick"))closePicker();
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
