/* 보안길잡이 AI | 화면 전용 코드: new-request.js */
'use strict';
/* ---------- chat ---------- */
let chat;
const emptyInfo=()=>Object.fromEntries(published.qs.filter(q=>q.role==='user').map(q=>[q.key,{v:null,status:'empty',src:null}]));
function condOK(id){const q=published.qs.find(x=>x.key===id); if(!q||q.cond==='all') return true;
  if(q.cond==='pii') return (chat.info.data.v||'').startsWith('포함돼');
  if(q.cond==='ext') return (chat.info.external.v||'').startsWith('외부 연계 있음'); return true;}
const candQs=()=>published.qs.filter(q=>q.on&&q.role==='user'&&chat.info[q.key]).map(q=>q.key);
const activeQs=()=>candQs().filter(condOK);
function newChat(p){
  chat={pid:p?p.id:null,name:p?p.name:'',fileState:'none',file:null,fileErr:'',full:false,msgs:[],info:emptyInfo(),queue:[],cur:null,total:0,
        mode:'start',reqErr:[],notes:[],busy:false,period:null,docs:[],pending:[],conflicts:[],hints:[],astep:0,afile:''};
  if(p&&p.purpose) chat.info.purpose={v:p.purpose,status:'user',src:null};
  const snap=p&&p.chatSnap;
  if(snap){
    Object.keys(snap.info).forEach(k=>{ if(chat.info[k]) chat.info[k]=JSON.parse(JSON.stringify(snap.info[k])); });
    chat.notes=snap.notes.slice(); chat.period=snap.period; chat.name=snap.name||p.name;
    chat.docs=(snap.docs||[]).map(d=>({...d})); chat.hints=(snap.hints||[]).map(h=>({...h})); chat.nameSrc=snap.nameSrc||'user';
    chat.msgs=snap.msgs.map(m=>({...m}));
    chat.msgs.push({who:'ai',html:`<b>${esc(chat.name)}</b> 신청을 이어서 작성합니다. 남은 질문에 답해 주세요.`});
    startQuestions();
    return;
  }
  chat.msgs.push({who:'ai',html:p?`<b>${esc(p.name)}</b> 신청을 이어서 작성합니다. 이전에 답한 사업 목적을 불러왔어요. 남은 질문에 답해 주세요.`
    :'방화벽 신청에 필요한 보안정보를 함께 정리해 드릴게요. 문서가 있으면 위에 끌어다 놓아 주세요. 찾은 정보로 먼저 채우고, 부족한 것만 여쭤볼게요.'});
}
newChat(null);
function saveChatDraft(){
  if(!chat||chat.mode==='requested'||state.role!=='user') return;
  const answered=Object.values(chat.info).some(x=>['user','confirmed','doc','unknown','skip'].includes(x.status));
  if(!answered) return;
  let p=chat.pid&&projects.find(x=>x.id===chat.pid);
  if(!p){
    const n=Math.max(...projects.map(x=>+x.id.slice(-3)))+1;
    p={id:'SF-2026-'+String(n).padStart(3,'0'),requester:'김민지',dept:'주택연금부',history:[],ver:published.version,cfg:{order:published.order,head:published.head},
       stage:0,infraDone:false,secDone:false,pii:false,period:null,unknown:[],due:null,rules:[]};
    projects.unshift(p); p.history.push(H(nowStamp(),'김민지 (신청자)','인터뷰 작성 시작'));
  }
  p.name=chat.name||((chat.info.purpose.v||'새 신청').slice(0,24));
  p.purpose=chat.info.purpose.v; p.audience=chat.info.audience.v; p.updated=TODAY_STR;
  p.chatSnap=JSON.parse(JSON.stringify({info:chat.info,notes:chat.notes,period:chat.period,name:p.name,nameSrc:chat.nameSrc||'user',msgs:chat.msgs.filter(m=>!m.typing).map(m=>({...m,chips:null})),
    docs:chat.docs.filter(d=>d.state==='done'||d.state==='error').map(d=>({name:d.name,size:d.size,ext:d.ext,state:d.state,found:d.found,err:d.err})),hints:chat.hints}));
  chat.pid=p.id;
  toast(`작성 중이던 신청을 ${p.id}로 임시 저장했습니다. 신청 현황에서 이어서 작성할 수 있습니다.`);
}
function buildRules(info){
  const a=info.audience.v||'', g=published.guards, rules=[];
  const pub=a.startsWith('국민'), inn=a.startsWith('직원')||a.startsWith('국민과');
  if(pub) rules.push(R('국민이 인터넷으로 접속','인터넷 이용자','Any','서비스 웹서버(DMZ)',null,'443','인바운드'));
  if(inn) rules.push(R('직원이 내부망에서 접속','내부 업무망','10.10.0.0/16',pub?'서비스 웹서버(DMZ)':'서비스 서버',null,'443','내부'));
  const srv=pub?'서비스 웹서버(DMZ)':'서비스 서버';
  if(/챗봇|AI|인공지능|상담|검색|요약|자동|판독/i.test(info.purpose.v||'')) rules.push(R('기관 내부 AI로 답변 생성',srv,null,'내부 LLM 서버',null,null,'내부'));
  if((info.data.v||'').startsWith('포함돼')) rules.push(R('업무 데이터 조회',srv,null,'업무 DB',null,null,'내부'));
  if((info.external.v||'').startsWith('외부 연계 있음')) rules.push(R('외부 기관 연계 (본인인증·알림)',srv,null,'외부 연계 기관',null,'443','아웃바운드'));
  const m=info.maint.v||'';
  if(m.startsWith('기관 밖')) rules.push(g.vpn?R('유지보수 업체 원격 점검','SSL-VPN 사용자','172.16.90.0/24',srv,null,'22','인바운드(VPN 경유)'):R('유지보수 업체 원격 점검','유지보수 업체',null,srv,null,'22','인바운드'));
  if(m.startsWith('기관 안')) rules.push(R('내부 관리자 점검','내부 관리자 PC',null,srv,null,'22','내부'));
  return rules;
}
const ruleKey=r=>r.biz+'|'+r.from+'|'+r.to;
const ruleLine=r=>`${esc(r.from)} → ${esc(r.to)}, TCP ${r.port?esc(r.port):'포트 확인 필요'} (${esc(r.dir)})`;

/* ---------- document intake ---------- */
const DOC_EXT=['pdf','hwpx','docx','xlsx','txt','md'];
const MAX_DOCS=5, MAX_MB=20;
const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const fsize=n=>n>1048576?(n/1048576).toFixed(1)+'MB':Math.max(1,Math.round(n/1024))+'KB';
const josa=(w,a,b)=>{const c=w.charCodeAt(w.length-1); if(c>=0xAC00&&c<=0xD7A3) return (c-0xAC00)%28?a:b; return /[LMNRlmnr136780]$/.test(w)?a:b;};
const UPLOAD_ICON='<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4"/></svg>';
function addPending(files){
  const errs=[];
  [...files].forEach(f=>{
    const ext=(f.name.split('.').pop()||'').toLowerCase();
    if(chat.docs.length+chat.pending.length>=MAX_DOCS){errs.push(`문서는 최대 ${MAX_DOCS}개까지 올릴 수 있습니다.`);return;}
    if(ext==='hwp'){errs.push(`${f.name}: HWP 파일은 읽을 수 없습니다. 한글에서 HWPX나 PDF로 저장해 올려 주세요.`);return;}
    if(!DOC_EXT.includes(ext)){errs.push(`${f.name}: 지원하지 않는 형식입니다. PDF, HWPX, DOCX, XLSX, TXT 파일을 올려 주세요.`);return;}
    if(!f.size){errs.push(`${f.name}: 빈 파일입니다.`);return;}
    if(f.size>MAX_MB*1048576){errs.push(`${f.name}: ${MAX_MB}MB를 넘는 파일입니다.`);return;}
    if([...chat.docs,...chat.pending].some(d=>d.name===f.name&&d.size===f.size)){errs.push(`${f.name}: 이미 올린 파일입니다.`);return;}
    chat.pending.push({name:f.name,size:f.size,ext,file:f});
  });
  chat.fileErr=[...new Set(errs)].join(' ');
}
function rerenderIntake(){ if(document.getElementById('dropzone')) renderChat(); else renderFileBar(); }
async function readDoc(d){
  const buf=await d.file.arrayBuffer(), chunks=[];
  if(d.ext==='pdf'){
    await loadScript(PDFJS_URL); const lib=window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
    const pdf=await lib.getDocument({data:new Uint8Array(buf),isEvalSupported:false}).promise;
    for(let i=1;i<=Math.min(pdf.numPages,80);i++){
      const tc=await (await pdf.getPage(i)).getTextContent();
      tc.items.map(x=>x.str+(x.hasEOL?'\n':'')).join('').split(/\n+/).forEach(l=>{l=l.replace(/\s+/g,' ').trim(); if(l) chunks.push({t:l,loc:`${i}쪽`});});
    }
  } else if(d.ext==='docx'||d.ext==='hwpx'){
    await loadScript(JSZIP_URL); const zip=await window.JSZip.loadAsync(buf);
    const names=Object.keys(zip.files).filter(f=>d.ext==='docx'?f==='word/document.xml':/^Contents\/section\d+\.xml$/i.test(f)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if(!names.length) throw new Error('empty');
    let n=0;
    for(const f of names){
      const doc=new DOMParser().parseFromString(await zip.file(f).async('string'),'application/xml');
      [...doc.getElementsByTagName('*')].filter(e=>e.localName==='p').forEach(p=>{
        const desc=[...p.getElementsByTagName('*')];
        if(desc.some(x=>x.localName==='p')) return;
        const t=desc.filter(x=>x.localName==='t').map(x=>x.textContent).join('').replace(/\s+/g,' ').trim();
        if(t){n++;chunks.push({t,loc:`${n}번째 문단`});}
      });
    }
  } else if(d.ext==='xlsx'){
    await loadScript(SHEETJS_URL); const wb=window.XLSX.read(buf,{type:'array'});
    wb.SheetNames.forEach(sn=>window.XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,defval:''}).forEach((r,i)=>{const t=r.filter(x=>String(x).trim()).join(' / ').trim(); if(t) chunks.push({t,loc:`${sn} 시트 ${i+1}행`});}));
  } else {
    new TextDecoder('utf-8').decode(buf).split(/\r?\n/).forEach((l,i)=>{l=l.trim(); if(l) chunks.push({t:l,loc:`${i+1}행`});});
  }
  if(!chunks.length) throw new Error(d.ext==='pdf'?'scan':'empty');
  return chunks;
}
function docErr(e,d){
  const m=e&&(e.name||e.message||'');
  if(m==='load'||(e&&e.message==='load')) return '분석 도구를 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 올려 주세요.';
  if(e&&e.message==='scan') return '글자를 읽을 수 없는 PDF입니다. 스캔본이라면 글자 인식(OCR)된 PDF로 올려 주세요.';
  if(e&&e.message==='empty') return '문서에서 글자를 찾지 못했습니다.';
  if(/Password/i.test(m)) return '암호가 걸린 파일입니다. 암호를 해제해 올려 주세요.';
  return '파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.';
}
/* rule-based extraction (internal LLM extraction will replace this) */
const near=(t,i)=>{const s=Math.max(0,i-16), e=Math.min(t.length,s+60); return (s>0?'…':'')+t.slice(s,e)+(e<t.length?'…':'');};
const cutSentence=t=>{t=t.replace(/^[\s:：\-–·]+/,'').trim(); const m=t.match(/^(.+?(?:다|함|임|음)\.?)(?:\s|$)/); let v=(m?m[1]:t).replace(/\.$/,''); return v.length>90?v.slice(0,88)+'…':v;};
function findIn(chunks,re){for(let i=0;i<chunks.length;i++){const m=chunks[i].t.match(re); if(m) return {c:chunks[i],m,i,at:m.index};} return null;}
function extractFields(file,chunks){
  const F={}, ev=(h,v,conf,extra)=>({v,conf,file,loc:h.c.loc,quote:near(h.c.t,h.at),...(extra||{})});
  let h=findIn(chunks.slice(0,40),/(?:사업명|과제명|서비스명|시스템명)\s*[:：]?\s*(.{2,40})/);
  if(h) F.title=ev(h,h.m[1].replace(/[|]+$/,'').trim(),'high');
  else { const i=chunks.slice(0,6).findIndex(c=>/(계획서|기획서|추진\s*계획|제안서|구축\s*방안)/.test(c.t)&&c.t.length<=60);
    if(i>=0){const c=chunks[i]; F.title={v:c.t.replace(/\s*(\(안\))?\s*(사업\s*)?(계획서|기획서|추진\s*계획|제안서)\s*(\(안\))?\s*$/,'').trim()||c.t,conf:'low',file,loc:c.loc,quote:near(c.t,0)};} }
  const head=/^\s*(?:\d+[.)]\s*|[가-하][.)]\s*|[□■○●▶◦◆\-*]\s*)?(?:사업|추진|도입|구축)?\s*목적(?!지)\s*[:：]?\s*(.*)$/;
  h=findIn(chunks,head);
  if(h){ let v=h.m[1].trim(), src=h; if(v.length<8&&chunks[h.i+1]&&chunks[h.i+1].t.length>=8){src={c:chunks[h.i+1],at:0};v=chunks[h.i+1].t;}
    if(v.length>=8) F.purpose=ev(src,cutSentence(v),'high'); }
  if(!F.purpose){ h=findIn(chunks,/(하기\s*위(해|하여)|을\s*목적으로|를\s*목적으로)/); if(h&&h.c.t.length>=12) F.purpose=ev({c:h.c,at:0},cutSentence(h.c.t),'low'); }
  const sP=findIn(chunks,/대국민|일반\s*국민|국민\s*(누구나|대상)|고객\s*대상|민원인|외부\s*이용자/), sS=findIn(chunks,/(직원|임직원)\s*(전용|대상|용)|내부\s*직원|업무망에서|내부망에서|사내\s*(서비스|시스템)/);
  const wP=findIn(chunks,/국민|고객|이용자|시민|홈페이지|모바일\s*앱|인터넷/), wS=findIn(chunks,/직원|임직원|업무망|내부망|사내/);
  if(sP&&sS) F.audience=ev(sP,'국민과 직원 모두','high');
  else if(sP) F.audience=ev(sP,'국민 (인터넷으로 접속)','high');
  else if(sS) F.audience=ev(sS,'직원 (기관 내부망)','high');
  else if(wP&&wS) F.audience=ev(wP,'국민과 직원 모두','low');
  else if(wP) F.audience=ev(wP,'국민 (인터넷으로 접속)','low');
  else if(wS) F.audience=ev(wS,'직원 (기관 내부망)','low');
  const nE=findIn(chunks,/외부\s*연계\s*(없|불필요|하지\s*않)|폐쇄망|인터넷\s*연결\s*(없|불가)/);
  const sE=findIn(chunks,/본인\s*인증|휴대폰\s*인증|공동\s*인증서|간편\s*인증|알림톡|카카오|문자\s*(발송|전송|알림)|SMS|외부\s*API|오픈\s*API|Open\s*API|행정정보\s*공동이용|결제\s*(대행|모듈)|PG사/i);
  const wE=findIn(chunks,/외부\s*(기관|시스템)|타\s*기관|연계/);
  if(nE) F.external=ev(nE,'외부 연계 없음','high'); else if(sE) F.external=ev(sE,'외부 연계 있음 (본인인증·알림 등)','high'); else if(wE) F.external=ev(wE,'외부 연계 있음 (본인인증·알림 등)','low');
  const nD=findIn(chunks,/개인정보\s*(는|를|가)?\s*(수집하지|처리하지|포함하지|포함되지|없음|미수집|미포함)/);
  const sD=findIn(chunks,/개인정보|주민등록번호|고유식별정보|민감정보/)||findIn(chunks,/가입자\s*정보|고객\s*정보|계좌\s*번호/), wD=findIn(chunks,/성명|연락처|전화번호|휴대전화|이메일|주소/);
  if(nD) F.data=ev(nD,'포함되지 않아요','high'); else if(sD) F.data=ev(sD,'포함돼요','high'); else if(wD) F.data=ev(wD,'포함돼요','low');
  const sR=findIn(chunks,/원격\s*(접속|지원|점검|유지\s*보수)|재택|외부에서\s*접속|VPN/i), sO=findIn(chunks,/상주|방문\s*(점검|지원)|현장\s*점검|기관\s*내(에서|부에서)\s*(유지\s*보수|점검)/);
  if(sR) F.maint=ev(sR,'기관 밖에서 원격으로',/VPN|원격\s*접속/i.test(sR.m[0])?'high':'low'); else if(sO) F.maint=ev(sO,'기관 안에서만','high');
  const DR=/(20\d{2})\s*[.\-년\/]\s*(\d{1,2})\s*[.\-월\/]?\s*(?:(\d{1,2})\s*일?)?\s*[~∼～\-–]\s*(?:(20\d{2})\s*[.\-년\/]\s*)?(\d{1,2})\s*[.\-월\/]?\s*(?:(\d{1,2})\s*일?)?/;
  let pr=null; for(const c of chunks){ const m=c.t.match(DR); if(m&&/운영|서비스|오픈|적용|사용\s*기간|사업\s*기간|기간/.test(c.t)){pr={c,m,at:m.index,ctx:true};break;} }
  if(!pr){ const x=findIn(chunks,DR); if(x) pr={...x,ctx:false}; }
  if(pr){ const m=pr.m, y1=+m[1], m1=+m[2], d1=+(m[3]||1), y2=+(m[4]||m[1]), m2=+m[5];
    const last=new Date(y2,m2,0).getDate(), d2=+(m[6]||last);
    const s=new Date(y1,m1-1,d1), e=new Date(y2,m2-1,Math.min(d2,last));
    if(e>s){ const months=(e-s)/DAY/30.4; const opt=months<=4.2?'시범운영 3개월':months<=12.5?'1년':'상시 운영';
      F.period=ev(pr,opt,pr.ctx?'high':'low',{range:`${fmt(s)} ~ ${fmt(e)}`}); } }
  if(!F.period){ const k=findIn(chunks,/시범\s*운영|파일럿|PoC/i)||null, k2=findIn(chunks,/상시\s*운영|지속\s*운영|계속\s*운영|연중\s*운영/);
    if(k2) F.period=ev(k2,'상시 운영','low'); else if(k) F.period=ev(k,'시범운영 3개월','low'); }
  const hints=[], seen=new Set();
  chunks.forEach(c=>{
    (c.t.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g)||[]).forEach(v=>{if(!seen.has('IP'+v)){seen.add('IP'+v);hints.push({kind:'IP',v,file,loc:c.loc});}});
    const re=/(?:포트|port|TCP|UDP)\s*[:：]?\s*(\d{2,5})/ig; let m; while((m=re.exec(c.t))){ if(+m[1]<=65535&&!seen.has('P'+m[1])){seen.add('P'+m[1]);hints.push({kind:'포트',v:m[1],file,loc:c.loc});} }
    (c.t.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:go\.kr|or\.kr|co\.kr|kr|com|net)\b/ig)||[]).forEach(v=>{if(!seen.has('D'+v)){seen.add('D'+v);hints.push({kind:'도메인',v,file,loc:c.loc});}});
  });
  return {file,fields:F,hints:hints.slice(0,20)};
}
function periodFromRange(range){
  if(!range) return null; let [s,e]=range.split(' ~ ');
  if(published.guards.maxYear){ const lim=new Date(s+'T00:00:00'); lim.setFullYear(lim.getFullYear()+1); lim.setDate(lim.getDate()-1); if(new Date(e+'T00:00:00')>lim) e=fmt(lim); }
  return `${s} ~ ${e}`;
}
function setDocValue(k,f,status){
  const x={v:f.v,status,src:`${f.file} ${f.loc}`,quote:f.quote,conf:f.conf};
  if(k==='period'){ const r=periodFromRange(f.range); chat.period=r||periodFor(f.v); if(chat.period) x.v=`${f.v} (${chat.period})`; }
  chat.info[k]=x;
}
function mergeFindings(results){
  const rank=f=>f.conf==='high'?2:1, best={}, changes=[], conflicts=[];
  results.forEach(r=>Object.entries(r.fields).forEach(([k,f])=>{ if(!best[k]||rank(f)>rank(best[k])) best[k]=f; }));
  if(best.title&&chat.nameSrc!=='user'){ chat.name=cleanTitle(best.title.v); chat.nameSrc='doc'; chat.nameEv=`${best.title.file} ${best.title.loc}`; }
  else if(!chat.name&&best.purpose){ chat.name=makeTitle(best.purpose.v); chat.nameSrc='purpose'; }
  Object.entries(best).forEach(([k,f])=>{
    if(k==='title'||!chat.info[k]) return;
    const cur=chat.info[k];
    if(['empty','skip','unknown'].includes(cur.status)||(cur.status==='doc'&&rank(f)>=(cur.conf==='high'?2:1))){ setDocValue(k,f,'doc'); changes.push(k); }
    else if(['user','confirmed'].includes(cur.status)&&!(cur.v||'').startsWith(f.v)&&!chat.conflicts.some(c=>c.k===k)) conflicts.push({k,f});
  });
  results.forEach(r=>r.hints.forEach(h=>{ if(!chat.hints.some(x=>x.kind===h.kind&&x.v===h.v)) chat.hints.push(h); }));
  return {changes,conflicts};
}
async function analyzeDocs(){
  if(!chat.pending.length||chat.busy) return;
  const batch=chat.pending.splice(0); chat.fileErr='';
  batch.forEach(d=>{d.state='reading';chat.docs.push(d);});
  chat.mode='analyzing'; chat.astep=1; chat.afile=''; chat.busy=true;
  renderChat();
  me(`${batch.map(d=>d.name).join(', ')} 분석 요청`);
  for(const d of batch){ chat.afile=d.name; renderQCard();
    try{ d.chunks=await readDoc(d); d.state='read'; }catch(e){ d.state='error'; d.err=docErr(e,d); }
    delete d.file; renderFileBar(); }
  chat.astep=2; renderQCard(); await sleep(500);
  const results=[];
  batch.filter(d=>d.state==='read').forEach(d=>{ const r=extractFields(d.name,d.chunks); d.found=Object.keys(r.fields).filter(k=>k!=='title'&&chat.info[k]).length; d.state='done'; delete d.chunks; results.push(r); });
  const {changes,conflicts}=mergeFindings(results); chat.conflicts.push(...conflicts);
  chat.astep=3; renderQCard(); renderInfo(); {const h1=$main.querySelector('h1'); if(h1&&chat.name) h1.textContent=chat.name;} await sleep(500);
  chat.astep=4; renderFileBar();
  const ok=batch.filter(d=>d.state==='done'), bad=batch.filter(d=>d.state==='error');
  const hi=changes.filter(k=>chat.info[k].conf==='high').length, lo=changes.length-hi;
  const missing=activeQs().filter(id=>chat.info[id].status==='empty').map(id=>QD(id).label);
  let msg='';
  if(ok.length){
    msg=changes.length?`문서 ${ok.length}개에서 보안정보 ${changes.length}개를 찾았어요. 확실한 항목 ${hi}개, 확인이 필요한 항목 ${lo}개예요. 오른쪽에서 항목별로 확인하거나 ‘확실한 항목 모두 확인’을 눌러 주세요.`
      :`문서 ${ok.length}개를 읽었지만 새로 찾은 보안정보는 없어요.`;
    if(chat.hints.length) msg+=` 서버 주소나 포트 같은 기술 단서 ${chat.hints.length}개는 담당자 참고 정보로 넘길게요.`;
    if(conflicts.length) msg+=`<div class="wr-box">이미 답한 값과 다른 내용이 ${conflicts.length}개 있어요. 어느 값을 쓸지 먼저 여쭤볼게요.</div>`;
    if(missing.length) msg+=`<div style="margin-top:.6rem">문서에서 찾지 못한 ${esc(missing.join(', '))}은(는) 이어서 여쭤볼게요.</div>`;
  }
  if(bad.length) msg+=`<div class="wr-box">${bad.map(d=>`${esc(d.name)}: ${esc(d.err)}`).join('<br>')}</div>`;
  await aiSay(msg||'문서를 읽지 못했어요.',ok.length?{src:ok.map(d=>d.name).join(', ')}:{});
  chat.busy=false; nextQ();
}
function confirmItem(k){ const x=chat.info[k]; if(!x||x.status!=='doc') return; x.status='confirmed'; renderInfo();
  const b=document.querySelector(`[data-act=edit-info][data-k="${k}"]`); if(b) b.focus();
  if(chat.cur===k&&chat.mode==='q'&&!chat.busy) nextQ(); }
function confirmAll(){ const ks=activeQs().filter(k=>chat.info[k].status==='doc'&&chat.info[k].conf==='high'); ks.forEach(k=>{chat.info[k].status='confirmed';});
  renderInfo(); toast(`확실한 항목 ${ks.length}개를 확인했습니다.`); const h=document.getElementById('info-h'); if(h){h.setAttribute('tabindex','-1');h.focus();}
  if(chat.mode==='q'&&ks.includes(chat.cur)&&!chat.busy) nextQ(); }
function viewDoc(){
  const body=chat.docs.map(d=>{
    const fs=activeQs().filter(k=>chat.info[k].src&&chat.info[k].src.startsWith(d.name+' '));
    return `<section style="margin-bottom:1.6rem"><h3 class="h-panel" style="font-size:1.6rem;margin:0 0 .6rem">${esc(d.name)} <span class="badge ${d.state==='error'?'b-danger':'b-neutral'}">${d.state==='error'?'읽지 못함':`${d.found||0}개 찾음`}</span></h3>
      ${d.state==='error'?`<p class="help">${esc(d.err)}</p>`:fs.length?`<ul class="evi-list">${fs.map(k=>`<li><b>${esc(QD(k).label)}</b>: ${esc(chat.info[k].v)}<br><span class="meta">${esc(chat.info[k].src)} “${esc(chat.info[k].quote||'')}”</span></li>`).join('')}</ul>`:'<p class="help">이 문서에서 채운 항목이 없습니다.</p>'}</section>`;}).join('');
  const hints=chat.hints.length?`<h3 class="h-panel" style="font-size:1.6rem;margin:0 0 .6rem">기술 단서</h3><ul class="evi-list">${chat.hints.map(h=>`<li>${esc(h.kind)} ${esc(h.v)} <span class="meta">${esc(h.file)} ${esc(h.loc)}</span></li>`).join('')}</ul>`:'';
  openDialog('문서 분석 근거',body+hints,[{label:'닫기',cls:'btn-tertiary'}]);
}


/* ---------- project title ---------- */
const TITLE_HEADS=['챗봇','시스템','서비스','플랫폼','포털','앱','대시보드','도구','솔루션','자동화','알림톡','알림','검색','분석','관리','예약','발송','심사','상담','조회','연계','요약','API'];
const stripJ=w=>w.replace(/[(),.·]+$/,'').replace(/(으로써|에서|까지|부터|으로|을|를|이|가|은|는|의|에|과|와|로|도|만)$/,'');
const VERBY=/(하는|해|하여|하고|한|할|된|되는|되어|하기|위한|위해|답하는|돕는|보조|줄인다|만들어요|만든다|합니다|해요)$/;
function makeTitle(text){
  let t=String(text||'').replace(/[“”"']/g,'').replace(/\s+/g,' ').trim();
  t=t.replace(/\s*(을|를)?\s*(만들|구축|개발|도입|추진|운영)\S*(\s.*)?$/,'').replace(/[.。]$/,'').trim();
  if(t&&t.length<=16&&!VERBY.test(t)) return t;
  const tk=t.split(' ').map(stripJ).filter(Boolean);
  if(!tk.length) return '새 신청';
  let hi=-1; tk.forEach((w,i)=>{ if(TITLE_HEADS.some(h=>w===h||w.endsWith(h))) hi=i; });
  let parts;
  if(hi>=0){
    let prev=null; for(let j=hi-1;j>0&&j>=hi-3;j--){ if(!VERBY.test(tk[j])&&tk[j].length<=6){prev=tk[j];break;} }
    parts=[tk[0],prev,tk[hi]];
    if(/(보조|지원)/.test(t.slice(t.lastIndexOf(tk[hi])))) parts.push('지원');
  } else parts=tk.filter(w=>!VERBY.test(w)).slice(0,3);
  const out=[]; parts.forEach(w=>{ if(w&&!out.includes(w)&&!out.some(o=>o.endsWith(w))) out.push(w); });
  const name=out.join(' ');
  return name.length>24?name.slice(0,24):name;
}
function cleanTitle(v){ const c=v.replace(/\s*(구축|도입|개발|고도화)?\s*(사업)?\s*$/,'').trim(); return (c||v).slice(0,40); }
function nameRow(){
  if(!chat.name&&chat.mode!=='q'&&chat.mode!=='done') return '';
  const srcL={doc:'기획서 제목',purpose:'사업 목적에서 생성',user:'직접 입력'}[chat.nameSrc]||'';
  if(chat.editing==='__name') return `<div class="irow editing namerow"><label class="k" for="ie-__name">사업명</label><div class="ie"><input id="ie-__name" class="input input-sm" value="${esc(chat.name||'')}" maxlength="40" aria-describedby="ie-__name-e"><p class="ferr" id="ie-__name-e" hidden></p>
    <div class="btn-row"><button type="button" class="btn btn-sm" data-act="edit-save" data-k="__name">저장</button><button type="button" class="btn btn-sm btn-tertiary" data-act="edit-cancel">취소</button></div></div></div>`;
  const can=!['requested','analyzing'].includes(chat.mode);
  return `<div class="irow namerow"><span class="k">사업명</span><span>${chat.name?`<b>${esc(chat.name)}</b>`:'<span class="v empty">사업 목적을 답하면 만들어져요</span>'}${srcL?`<br><span class="src">${srcL}${chat.nameSrc==='doc'&&chat.nameEv?`, ${esc(chat.nameEv)}`:''}</span>`:''}</span><span></span>${can?`<button type="button" class="iedit-btn" data-act="edit-info" data-k="__name" aria-label="사업명 수정" title="수정">${I.pencil}</button>`:'<span></span>'}</div>`;
}


/* ---------- delete draft ---------- */
const chatHasProgress=()=>Object.values(chat.info).some(x=>x.status!=='empty')||chat.docs.length>0;
/* ---------- chat views ---------- */
function renderChat(){
  if(chat.mode==='start'&&!chat.docs.length&&!chat.pid) return renderLanding();
  $main.innerHTML=`
  <div class="page-head" style="margin-bottom:2.4rem"><div><h1>${chat.pid||chat.name?esc(chat.name||'새 신청')+(chat.pid?' 이어서 작성':''):'새 신청'}</h1></div>
    ${chat.mode!=='requested'?'<button type="button" class="btn btn-danger btn-sm" data-act="del-draft">작성 중인 신청 삭제</button>':''}</div>
  ${flashHTML()}
  <section class="docbar" id="filebar" aria-label="첨부 문서"></section>
  <div class="work" id="work" style="--info-w:${state.infoW}px">
    <section class="chatp" aria-labelledby="chat-h">
      <div class="chatp-h"><div class="ttl"><span class="av" aria-hidden="true">AI</span><h2 class="h-panel" id="chat-h">보안정보 도우미</h2></div>
        <span class="meta">AI 답변은 제안이며 확정 전 확인이 필요합니다</span></div>
      <div class="msgs" id="msgs" role="log" aria-live="polite" aria-label="대화 내용" tabindex="0"></div>
      <div class="qcard" id="qcard"></div>
    </section>
    <div class="splitter" id="split" role="separator" tabindex="0" aria-orientation="vertical" aria-controls="infop" aria-label="보안정보 도우미와 수집된 보안정보의 너비 조절" aria-valuemin="${SPLIT_MIN}" aria-valuemax="${SPLIT_MAX}" aria-valuenow="${state.infoW}" aria-valuetext="수집된 보안정보 너비 ${state.infoW}픽셀" title="끌어서 너비 조절, 두 번 누르면 기본값"><span aria-hidden="true"></span></div>
    <aside class="infop" aria-labelledby="info-h" id="infop"></aside>
  </div>`;
  renderFileBar();renderMsgs();renderQCard();renderInfo();bindSplit();
}
function pendingList(){
  if(!chat.pending.length) return '';
  return `<ul class="pend" aria-label="분석 전 파일">${chat.pending.map((d,i)=>`<li>${I.clip}<span class="pn">${esc(d.name)}</span><span class="help">${esc(d.ext.toUpperCase())}, ${fsize(d.size)}</span><span class="badge b-neutral">분석 전</span><button type="button" class="iedit-btn" data-act="remove-pending" data-i="${i}" aria-label="${esc(d.name)} 빼기" title="빼기">${I.x}</button></li>`).join('')}</ul>`;
}
function renderLanding(){
  $main.innerHTML=`
  <div class="page-head" style="margin-bottom:2.4rem"><div><h1>새 신청</h1></div></div>
  ${flashHTML()}
  <section class="intake" aria-labelledby="in-h">
    <div class="dropzone" id="dropzone">
      <span class="dz-ic">${UPLOAD_ICON}</span>
      <h2 class="h-panel" id="in-h">기획서를 끌어다 놓으세요</h2>
      <p class="help" style="margin:0">기획서, 구성도, 요구사항 정의서를 함께 올릴 수 있습니다.</p>
      <button type="button" class="btn" data-act="pick-file" aria-describedby="fhelp">파일 선택</button>
      <p class="help" id="fhelp" style="margin:0">PDF, HWPX, DOCX, XLSX, TXT 파일, 파일당 ${MAX_MB}MB, 최대 ${MAX_DOCS}개</p>
      ${chat.fileErr?`<p class="ferr" role="alert" style="margin:0">${esc(chat.fileErr)}</p>`:''}
      ${pendingList()}
    </div>
    <div class="intake-actions">
      <button type="button" class="btn btn-tertiary" data-act="start-q">기획서 없이 대화로 시작</button>
      ${chat.pending.length?`<button type="button" class="btn btn-primary" data-act="analyze">선택한 파일 분석 시작 (${chat.pending.length})</button>`:''}
    </div>
  </section>`;
}
function renderFileBar(){
  const el=document.getElementById('filebar'); if(!el||document.getElementById('dropzone')) return;
  const st=d=>d.state==='error'?['읽지 못함','b-danger']:d.state==='done'?[`${d.found||0}개 찾음`,'b-success']:['분석 중','b-info'];
  const can=chat.mode!=='requested'&&!chat.busy;
  el.innerHTML=`<div class="docbar-in">
    <div class="dchips">${chat.docs.length||chat.pending.length?'':`<span class="help">${I.clip} 첨부 문서 없음. 문서를 끌어다 놓거나 추가하면 찾은 정보로 채워집니다.</span>`}
      ${chat.docs.map(d=>{const [l,c]=st(d);return `<span class="dchip" title="${esc(d.err||d.name)}">${I.clip}<span class="dn">${esc(d.name)}</span><span class="badge ${c}">${l}</span></span>`;}).join('')}</div>
    <div class="btn-row">${chat.docs.some(d=>d.state==='done')?'<button type="button" class="btn btn-tertiary btn-sm" data-act="view-doc">분석 근거 보기</button>':''}
      ${can?'<button type="button" class="btn btn-sm" data-act="pick-file">문서 추가</button>':''}</div></div>
    ${pendingList()}
    ${chat.pending.length&&can?`<div class="btn-row" style="justify-content:flex-end;margin-top:.8rem"><button type="button" class="btn btn-sm" data-act="analyze">선택한 파일 분석 (${chat.pending.length})</button></div>`:''}
    ${chat.fileErr?`<p class="ferr" role="alert" style="margin:.8rem 0 0">${esc(chat.fileErr)}</p>`:''}`;
}
function renderMsgs(){
  const box=document.getElementById('msgs'); if(!box) return;
  box.innerHTML=chat.msgs.map(m=>{
    if(m.typing) return `<div class="m-ai"><span class="av" aria-hidden="true">AI</span><div class="bubble typing" aria-label="답변 작성 중"><i></i><i></i><i></i></div></div>`;
    if(m.who==='me') return `<div class="m-me"><span class="sr-only">내 답변: </span>${m.html}</div>`;
    return `<div class="m-ai"><span class="av" aria-hidden="true">AI</span><div class="body"><div class="bubble"><span class="sr-only">AI: </span>${m.html}</div>
      ${m.src?`<div class="m-src">${I.page}${esc(m.src)}</div>`:''}${m.ok?`<div class="m-ok">${I.okc}${esc(m.ok)}</div>`:''}</div></div>`;
  }).join('');
  box.scrollTop=box.scrollHeight;
}
function optsFor(id){
  const d=QD(id); if(!d.opts) return [];
  return [...d.opts.map(o=>o[0]),unknownLabel(id)];
}
const hasDocs=()=>chat.docs.some(d=>d.state==='done');
function renderQCard(focusInput){
  const el=document.getElementById('qcard'); if(!el) return;
  const m=chat.mode;
  if(m==='start'){
    el.innerHTML=`<p class="qnum">이어서 작성</p><h3 class="qtitle" id="qt">남은 질문에 답해 주세요</h3>
      <button type="button" class="btn btn-primary" data-act="start-q">질문 이어서 답하기</button>`;
  } else if(m==='analyzing'){
    const s=i=>chat.astep>i?'done':chat.astep===i?'now':'';
    el.innerHTML=`<p class="qnum">문서 분석 중</p><ol class="asteps" role="status" aria-live="polite">
      <li class="${s(1)}"><span class="ai-dot" aria-hidden="true"></span>문서 읽는 중${chat.astep===1&&chat.afile?` <span class="help">${esc(chat.afile)}</span>`:''}</li>
      <li class="${s(2)}"><span class="ai-dot" aria-hidden="true"></span>보안정보 찾는 중</li>
      <li class="${s(3)}"><span class="ai-dot" aria-hidden="true"></span>방화벽 규칙 초안 만드는 중</li></ol>`;
  } else if(m==='conflict'){
    const c=chat.conflicts[0], d=QD(c.k), cur=chat.info[c.k];
    const title=`${c.f.file}에서는 ${d.label}${josa(d.label,'을','를')} ‘${c.f.v}’로 봤어요`;
    el.innerHTML=`<p class="qnum">값 확인</p><h3 class="qtitle" id="qt">${esc(title)}</h3>
      <p class="qhelp" id="qh">지금 값은 ‘${esc(cur.v||'')}’예요. 근거: ${esc(c.f.loc)} “${esc(c.f.quote)}”</p>
      <div class="qchips" role="group" aria-label="어느 값을 쓸지 선택, 누르면 바로 반영됩니다" aria-describedby="qh">
        <button type="button" class="qchip" data-act="pick-opt" data-v="keep">지금 값 유지</button>
        <button type="button" class="qchip" data-act="pick-opt" data-v="doc">문서 값으로 바꾸기</button></div>`;
  } else if(m==='q'){
    const id=chat.cur, d=QD(id), x=chat.info[id];
    let title=d.title, help=d.help, opts=optsFor(id);
    if(hasDocs()){
      if(x.status==='doc'){ title=`문서에서 ${d.label}${josa(d.label,'을','를')} 찾았지만 확실하지 않아요. ${d.title}`; help=`찾은 값: ${x.v} (${x.src}) “${x.quote||''}”`; opts=[`__confirm__`,...opts]; }
      else title=`문서에서 ${d.label}${josa(d.label,'을','를')} 찾지 못했어요. ${d.title}`;
    }
    const left=activeQs().filter(k=>chat.info[k].status==='empty'||(chat.info[k].status==='doc'&&chat.info[k].conf==='low')).length;
    const isText=d.type==='text';
    el.innerHTML=`<p class="qnum">남은 질문 ${left}개</p><h3 class="qtitle" id="qt">${esc(title)}</h3><p class="qhelp" id="qh">${esc(help)}</p>
      ${opts.length?`<div class="qchips" role="group" aria-label="${esc(d.title)} 보기, 누르면 바로 답변됩니다" aria-describedby="qh">${opts.map(o=>o==='__confirm__'?`<button type="button" class="qchip strong" data-act="pick-opt" data-v="__confirm__">찾은 값이 맞아요</button>`:`<button type="button" class="qchip" data-act="pick-opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`:''}
      <div class="field"><label for="qtext">${isText?(id==='purpose'?'사업 설명':esc(d.label))+(d.required?'<span class="req">필수</span>':'<span class="opt-tag">선택, 비워 두면 건너뜀</span>'):'보기에 없으면 직접 입력<span class="opt-tag">선택</span>'}</label>
        <div class="qrow"><input id="qtext" class="input" autocomplete="off" aria-describedby="qh qtext-e" value="${isText&&x.status==='doc'?esc(x.v):''}"><button type="button" class="btn btn-primary" data-act="save-answer" ${chat.busy?'disabled':''}>${isText?'답변 저장':'보내기'}</button></div>
        <p class="ferr" id="qtext-e" hidden></p></div>`;
  } else if(m==='done'){
    el.innerHTML=`<p class="qnum">질문 완료</p><h3 class="qtitle" id="qt">필요한 정보를 모두 모았어요</h3>
      <p class="qhelp" style="margin:0">오른쪽 내용을 확인하고 기술정보 확인 요청을 보내 주세요. 문서를 더 추가할 수도 있습니다.</p>`;
  } else if(m==='requested'){
    el.innerHTML=`<p class="qnum">요청 완료</p><h3 class="qtitle" id="qt">기술정보 확인을 요청했어요</h3>
      <p class="qhelp">담당자 협의 단계로 넘어갔습니다.</p>
      <div class="btn-row"><a class="btn btn-primary" href="request-detail.html?id=${chat.pid}">신청 상세 보기</a><button type="button" class="btn btn-tertiary" data-act="new-chat">다른 신청 시작</button></div>`;
  }
  if(focusInput){const t=document.getElementById('qtext')||el.querySelector('.qchip');if(t)t.focus({preventScroll:true});}
}
function renderInfo(){
  const el=document.getElementById('infop'); if(!el) return;
  const qs=activeQs(), info=chat.info;
  const got=qs.filter(id=>['confirmed','user'].includes(info[id].status)||(info[id].status==='doc'&&info[id].conf==='high')).length;
  const fromDoc=qs.filter(id=>info[id].src), fromTalk=qs.filter(id=>!info[id].src);
  const rules=buildRules(info);
  const ipNull=rules.reduce((n,r)=>n+[r.fromIp,r.toIp].filter(v=>v===null).length,0);
  const portNull=rules.filter(r=>r.port===null).length;
  const valCell=(id)=>{const x=info[id];
    if(x.status==='empty') return '<span class="v empty">미입력</span>';
    if(x.status==='unknown') return `<span class="v">${id==='period'?'아직 미정':'잘 모름'}</span>`;
    if(x.status==='skip') return '<span class="v empty">건너뜀</span>';
    return `<span class="v">${esc(x.v)}</span>`;};
  const badge=(id)=>{const x=info[id];
    if(x.status==='empty') return '<span class="badge b-warning">답변 필요</span>';
    if(x.status==='unknown') return '<span class="badge b-warning">담당자 확인 필요</span>';
    if(id==='data'&&(x.v||'').startsWith('포함돼')&&published.guards.pii) return '<span class="badge b-info">정보보안 검토 필요</span>';
    return '';};
  const editable=id=>!['requested','analyzing','start'].includes(chat.mode)&&info[id].status!=='empty';
  const pencil=id=>editable(id)?`<button type="button" class="iedit-btn" data-act="edit-info" data-k="${id}" aria-label="${esc(QD(id).label)} 수정" title="수정">${I.pencil}</button>`:'';
  const row=id=>chat.editing===id?editorRow(id):`<div class="irow"><span class="k">${QD(id).label}</span><span>${valCell(id)}</span>${badge(id)||'<span></span>'}${pencil(id)||'<span></span>'}</div>`;
  const docRow=id=>{ if(chat.editing===id) return editorRow(id); const x=info[id];
    const st=x.status==='confirmed'?'<span class="badge b-success">확인됨</span>':`<span class="badge ${x.conf==='high'?'b-info':'b-warning'}">${x.conf==='high'?'확실':'확인 필요'}</span>`;
    return `<div class="drow"><div class="drow-top"><span class="k">${QD(id).label}</span>${st}</div>
      <div class="drow-v">${valCell(id)}</div>
      <p class="evi">${I.page}<span>${esc(x.src)}: “${esc(x.quote||'')}”</span></p>
      ${x.status==='doc'||editable(id)?`<div class="drow-act">${x.status==='doc'&&chat.mode!=='requested'?`<button type="button" class="btn btn-sm" data-act="confirm-item" data-k="${id}" aria-label="${esc(QD(id).label)} 확인">확인</button>`:''}${pencil(id)}</div>`:''}</div>`;};
  const hiN=fromDoc.filter(id=>info[id].status==='doc'&&info[id].conf==='high').length;
  const staffRows=[];
  if(ipNull) staffRows.push(['서버·통신 구간',`ICT인프라 확인 필요 (${ipNull}칸)`,'담당자 입력']);
  if(portNull) staffRows.push(['포트·프로토콜',`ICT인프라 확인 필요 (${portNull}칸)`,'담당자 입력']);
  if(info.period.status==='unknown') staffRows.push(['운영 기간','ICT인프라 확인 필요','담당자 입력']);
  if((info.data.v||'').startsWith('포함돼')&&published.guards.pii) staffRows.push(['개인정보 처리','정보보안 확인 필요','담당자 검토']);
  const reqPrimary=chat.mode==='done';
  el.innerHTML=`<div class="infop-h"><div class="row"><h2 class="h-panel" id="info-h">수집된 보안정보</h2><span class="help">필수정보 ${got} / ${qs.length}</span></div>
      <div class="prog" role="progressbar" aria-label="필수정보 수집" aria-valuemin="0" aria-valuemax="${qs.length}" aria-valuenow="${got}"><i style="width:${qs.length?got/qs.length*100:0}%"></i></div></div>
    <div class="infop-b">
      ${nameRow()}
      ${fromDoc.length?`<h3 class="grp"><span>문서에서 찾은 정보</span>${hiN&&chat.mode!=='requested'?`<button type="button" class="btn btn-sm" data-act="confirm-all">확실한 항목 모두 확인 (${hiN})</button>`:''}</h3>${fromDoc.map(docRow).join('')}`:''}
      ${fromTalk.length?`<h3 class="grp">대화로 확인</h3>${fromTalk.map(row).join('')}`:''}
      ${rules.length?`<h3 class="grp"><span>데이터 흐름도</span><span class="badge b-info">AI 제안</span></h3>${flowSVG(rules,{w:360,id:'c'})}`:''}
      <h3 class="grp"><span>방화벽 규칙 초안</span><span class="badge b-info">AI 제안</span></h3>
      ${rules.length?rules.map((r,i)=>`<div class="rrow"><div class="biz"><span class="rn" aria-hidden="true">${i+1}</span>${i+1}번 업무 표현: ${esc(r.biz)}</div><div class="flow">${esc(r.from)} → ${esc(r.to)}</div>
        <div>TCP ${r.port?esc(r.port):'<span class="need">포트 확인 필요</span>'}, ${esc(r.dir)}${(r.fromIp===null||r.toIp===null)?', <span class="need">주소 확인 필요</span>':''}</div></div>`).join('')
        :'<p class="help">문서를 분석하거나 질문에 답하면 방화벽 규칙이 여기에 쌓입니다.</p>'}
      ${chat.hints.length?`<h3 class="grp"><span>문서의 기술 단서</span><span class="badge b-outline">담당자 참고</span></h3><ul class="hints">${chat.hints.slice(0,8).map(h=>`<li><b>${esc(h.kind)}</b> ${esc(h.v)}<span class="meta">${esc(h.file)} ${esc(h.loc)}</span></li>`).join('')}</ul>`:''}
      <h3 class="grp">담당자 확인 항목</h3>
      ${staffRows.length?staffRows.map(([k,v,b])=>`<div class="irow"><span class="k">${k}</span><span>${v}</span><span class="badge b-outline">${b}</span><span></span></div>`).join(''):'<p class="help">아직 담당자 확인이 필요한 항목이 없습니다.</p>'}
    </div>
    <div class="infop-f">
      ${chat.reqErr.length?`<div class="notice n-danger" role="alert" style="margin-bottom:1.2rem">${I.warn}<div><p><b>요청 전에 확인할 항목이 있어요</b></p><ul>${chat.reqErr.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div></div>`:''}
      ${chat.mode==='requested'?'<p class="help" style="margin:0">기술정보 확인 요청을 보냈습니다.</p>'
        :`<button type="button" class="btn ${reqPrimary?'btn-primary':''} btn-block" data-act="request" ${chat.mode==='analyzing'?'disabled':''}>기술정보 확인 요청</button>`}
      </div>`;
}
async function aiSay(html,extra={}){
  chat.msgs.push({typing:true}); renderMsgs();
  await sleep(450);
  chat.msgs.pop(); chat.msgs.push({who:'ai',html,...extra}); renderMsgs();
}
function me(text){chat.msgs.push({who:'me',html:esc(text)});renderMsgs();}
function startQuestions(){ chat.reqErr=[]; nextQ(); }
async function nextQ(){
  if(chat.conflicts.length){ chat.mode='conflict'; chat.cur=chat.conflicts[0].k; renderQCard(true); renderInfo(); return; }
  const list=activeQs().filter(k=>chat.info[k].status==='empty'||(chat.info[k].status==='doc'&&chat.info[k].conf==='low'));
  if(!list.length){ const was=chat.mode; chat.mode='done'; chat.cur=null; renderQCard(); renderInfo();
    if(was!=='done') await aiSay('필요한 정보를 모두 모았어요. 오른쪽의 데이터 흐름도와 수집된 내용을 확인하고 기술정보 확인을 요청해 주세요. 잘못된 값은 연필 버튼으로 바로 고칠 수 있어요.'); return; }
  chat.cur=list[0]; chat.mode='q'; renderQCard(true); renderInfo();
}
function matchOpt(id,text){
  if(UNKNOWN_KEYS.some(k=>text.includes(k))) return unknownLabel(id);
  const d=QD(id); const hit=d.opts.find(o=>o[1].some(k=>text.includes(k)));
  return hit?hit[0]:null;
}
async function saveAnswer(pick){
  if(chat.busy) return;
  const err=document.getElementById('qtext-e'), inp=document.getElementById('qtext');
  const text=inp?inp.value.trim():''; const sel=typeof pick==='string'?pick:undefined;
  const fail=msg=>{if(!inp)return;inp.setAttribute('aria-invalid','true');err.hidden=false;err.textContent=msg;inp.focus();};
  if(chat.mode==='conflict'){
    if(!sel) return;
    const c=chat.conflicts.shift(), d=QD(c.k); chat.busy=true;
    me(sel==='doc'?'문서 값으로 바꾸기':'지금 값 유지');
    if(sel==='doc'){ const before=buildRules(chat.info), bk=before.map(ruleKey);
      setDocValue(c.k,c.f,'confirmed'); renderInfo();
      const after=buildRules(chat.info), ak=after.map(ruleKey), added=after.filter(r=>!bk.includes(ruleKey(r))), removed=before.filter(r=>!ak.includes(ruleKey(r)));
      await aiSay(`${esc(d.label)}${josa(d.label,'을','를')} 문서 값으로 바꿨어요.${added.length?`<div class="tr-box"><b>새로 생긴 규칙</b>${added.map(ruleLine).join('<br>')}</div>`:''}${removed.length?`<div class="wr-box">빠진 규칙<br>${removed.map(ruleLine).join('<br>')}</div>`:''}`,{ok:`${d.label} 값이 바뀌었습니다.`}); }
    else { chat.notes.push(`${d.label}: 신청자 답변 ‘${chat.info[c.k].v}’, ${c.f.file} ${c.f.loc}에는 ‘${c.f.v}’`);
      await aiSay('지금 값을 그대로 둘게요. 문서와 다른 값이라 담당자에게 함께 알려 드릴게요.'); }
    chat.busy=false; nextQ(); return;
  }
  const id=chat.cur, d=QD(id);
  if(sel==='__confirm__'){ chat.busy=true; me('찾은 값이 맞아요'); chat.info[id].status='confirmed'; renderInfo();
    await aiSay(`${esc(d.label)}${josa(d.label,'을','를')} 문서에서 찾은 값으로 확인했어요.`,{ok:`${d.label} 값이 확인되었습니다.`}); chat.busy=false; nextQ(); return; }
  if(d.type==='text'&&id!=='purpose'){
    if(!text&&d.required){fail(`${d.label}${josa(d.label,'을','를')} 입력해 주세요.`);return;}
    chat.busy=true; me(text||'(건너뜀)');
    chat.info[id]=text?{v:text,status:'user',src:null}:{v:null,status:'skip',src:null};
    renderInfo();
    await aiSay(text?`${esc(d.label)} 답변을 기록했어요. 담당자 협의 때 함께 전달할게요.`:`${esc(d.label)} 질문은 건너뛰었어요. 필요하면 담당자가 다시 요청할 수 있어요.`,text?{ok:`${d.label} 답변이 반영되었습니다.`}:{});
    chat.busy=false; nextQ(); return;
  }
  if(d.type==='text'){
    if(!text){fail('사업 목적을 한두 문장으로 입력해 주세요.');return;}
    chat.busy=true; me(text);
    const before=buildRules(chat.info).map(ruleKey);
    chat.info.purpose={v:text,status:'user',src:null};
    let named='';
    if(!chat.name||chat.nameSrc==='purpose'){ chat.name=makeTitle(text); chat.nameSrc='purpose'; named=chat.name; const h1=$main.querySelector('h1'); if(h1) h1.textContent=chat.name; }
    const added=buildRules(chat.info).filter(r=>!before.includes(ruleKey(r)));
    renderInfo();
    await aiSay(`사업 목적을 기록했어요.${named?` 사업명은 ‘${esc(named)}’로 정했어요. 오른쪽 위에서 바꿀 수 있어요.`:''}${added.length?`<div class="tr-box"><b>보안 언어로 바꾸면</b>${added.map(ruleLine).join('<br>')}</div><div style="margin-top:.8rem">AI를 쓰는 서비스라 기관 내부 LLM 서버로 가는 연결을 넣었어요.</div>`:''}`,{ok:'사업 목적이 반영되었습니다.'});
    chat.busy=false; nextQ(); return;
  }
  let ans=sel||null;
  if(!ans&&text) ans=matchOpt(id,text);
  if(!ans&&!text){fail('보기에서 답을 고르거나 직접 입력해 주세요.');return;}
  chat.busy=true;
  me(sel&&text?`${sel} (${text})`:(sel||text));
  if(text&&(sel||!ans)) chat.notes.push(`${d.label}: ${text}`);
  if(!ans){
    await aiSay('추가 설명을 기록했어요. 담당자 협의 때 함께 전달할게요. 위 보기 중 가장 가까운 답을 골라 주세요.');
    chat.busy=false; renderQCard(true); return;
  }
  const before=buildRules(chat.info).map(ruleKey);
  const unknown=ans===unknownLabel(id);
  chat.info[id]={v:unknown?null:ans,status:unknown?'unknown':'user',src:null};
  let extra='', ok=`${d.label} 답변이 반영되었습니다.`, lead='확인했어요.';
  if(unknown){lead=id==='period'?'운영 기간은 아직 미정으로 기록했어요. 추정한 날짜를 넣지 않고 담당자가 확인하도록 표시할게요.':'담당자 확인이 필요한 항목으로 표시했어요.';ok=null;}
  if(id==='data'&&!unknown&&ans.startsWith('포함돼')&&published.guards.pii){lead='확인했어요. 정보보안 담당자가 개인정보 처리 기준을 검토할 수 있도록 표시할게요.';ok='개인정보 포함 여부가 반영되었습니다.';}
  if(id==='maint'&&ans.startsWith('기관 밖')&&published.guards.vpn) extra+='<div class="wr-box">기관 기준상 외부에서 관리 포트(22)를 직접 열 수 없어요. SSL-VPN을 거쳐 들어오는 방식으로 제안했어요.</div>';
  if(id==='period'&&!unknown){
    chat.period=periodFor(ans);
    if(ans.startsWith('상시')&&published.guards.maxYear) extra+=`<div class="wr-box">기관 기준상 방화벽 허용 기간은 최대 1년이에요. 1년 단위로 제안하고, 만료 ${published.warnDays}일 전에 연장 여부를 여쭤볼게요.</div>`;
    if(chat.period) chat.info.period.v=`${ans} (${chat.period}, 제안)`;
  }
  const added=buildRules(chat.info).filter(r=>!before.includes(ruleKey(r)));
  renderInfo();
  await aiSay(`${lead}${added.length?`<div class="tr-box"><b>보안 언어로 바꾸면</b>${added.map(ruleLine).join('<br>')}</div>`:''}${extra}`,ok?{ok}:{});
  chat.busy=false; nextQ();
}
function requestTech(){
  const qs=activeQs(), errs=[];
  qs.forEach(id=>{const s=chat.info[id].status;
    if(s==='empty') errs.push(`${QD(id).label}: 아직 답하지 않았습니다.`);
    if(s==='doc') errs.push(`${QD(id).label}: 문서에서 찾은 값을 확인해 주세요.`);});
  if(chat.conflicts.length) errs.push(`문서와 다른 값 ${chat.conflicts.length}개를 먼저 정해 주세요.`);
  chat.reqErr=errs;
  if(errs.length){renderInfo();const a=document.querySelector('#infop [role=alert]');if(a){a.setAttribute('tabindex','-1');a.focus();}return;}
  renderInfo();
  const rules=buildRules(chat.info), unk=qs.filter(id=>chat.info[id].status==='unknown').map(id=>QD(id).label);
  const miss=rules.reduce((n,r)=>n+[r.fromIp,r.toIp,r.port].filter(v=>v===null).length,0);
  openDialog('기술정보 확인 요청 전 최종 확인',`
    <dl class="dl" style="margin-bottom:1.6rem"><dt>사업명</dt><dd>${esc(chat.name||'새 신청')}</dd><dt>사업 목적</dt><dd>${esc(chat.info.purpose.v||'')}</dd>
      ${chat.docs.some(d=>d.state==='done')?`<dt>첨부 문서</dt><dd>${chat.docs.filter(d=>d.state==='done').map(d=>esc(d.name)).join(', ')}</dd>`:''}</dl>
    ${rules.length?flowSVG(rules,{w:560,id:'r'}):''}
    <h3 class="h-panel" style="font-size:1.6rem;margin:1.6rem 0 .8rem">방화벽 규칙 초안 ${rules.length}개</h3>
    <ol class="rv-rules">${rules.map(r=>`<li>${ruleLine(r)}<br><span class="meta">${esc(r.biz)}</span></li>`).join('')}</ol>
    <p class="help">담당자가 채울 값 ${miss}칸${unk.length?`, 담당자 확인 필요 항목: ${esc(unk.join(', '))}`:''}${chat.hints.length?`, 문서의 기술 단서 ${chat.hints.length}개 전달`:''}</p>
    <div class="field" style="margin:1.6rem 0 0"><label for="rv-memo">담당자에게 남길 메모<span class="opt-tag">선택</span></label><textarea id="rv-memo" class="input"></textarea></div>`,
    [{label:'계속 수정',cls:'btn-tertiary'},{label:'요청 보내기',cls:'btn-primary',fn:()=>{const m=document.getElementById('rv-memo').value.trim(); if(m) chat.notes.push(`신청자 메모: ${m}`); doRequest(); }}]);
}
function doRequest(){
  const qs=activeQs(), info=chat.info, rules=buildRules(info);
  let p=chat.pid&&projects.find(x=>x.id===chat.pid);
  if(!p){
    const n=Math.max(...projects.map(x=>+x.id.slice(-3)))+1;
    p={id:'SF-2026-'+String(n).padStart(3,'0'),requester:'김민지',dept:'주택연금부',history:[]};
    projects.unshift(p);
  }
  const unknown=qs.filter(id=>info[id].status==='unknown').map(id=>QD(id).label);
  const hintNote=chat.hints.length?[`문서의 기술 단서: ${chat.hints.map(h=>`${h.kind} ${h.v} (${h.file} ${h.loc})`).join(', ')}`]:[];
  Object.assign(p,{name:chat.name||(info.purpose.v||'새 신청').slice(0,24),ver:published.version,cfg:{order:published.order,head:published.head},stage:1,infraDone:false,secDone:false,
    purpose:info.purpose.v,audience:info.audience.v,pii:(info.data.v||'').startsWith('포함돼'),period:info.period.status==='unknown'?null:chat.period,
    unknown,notes:chat.notes.slice().concat(qs.filter(id=>!QDEFS[id]&&info[id].v).map(id=>`${QD(id).label}: ${info[id].v}`)).concat(hintNote),rules,due:'2026-11-10',updated:TODAY_STR,
    attachments:chat.docs.filter(d=>d.state==='done').map(d=>d.name)});
  const infoSrc=x=>!x||!x.v?null:x.status==='doc'?{k:'ai',ev:`${x.src} “${x.quote||''}”`}:x.status==='confirmed'?{k:'ai',ok:'user',ev:`${x.src} “${x.quote||''}”`}:{k:'user'};
  p.src=Object.fromEntries([['purpose','purpose'],['audience','audience'],['pii','data'],['period','period']].map(([k,id])=>[k,infoSrc(info[id])]).filter(([,v])=>v));
  p.history.push(H(nowStamp(),'김민지 (신청자)','인터뷰 완료, 기술정보 확인 요청'));
  chat.pid=p.id; delete p.chatSnap; chat.mode='requested'; chat.reqErr=[];
  renderFileBar(); renderQCard(); renderInfo();
  aiSay(`기술정보 확인을 요청했어요. 신청번호는 <b>${p.id}</b>입니다. ICT인프라 담당자가 서버 주소와 포트를 입력하면 정보보안 담당자가 검토합니다.`);
  const h=document.getElementById('qt'); if(h){h.setAttribute('tabindex','-1');h.focus();}
}
const fileInput=document.getElementById('file');
fileInput.multiple=true; fileInput.accept='.pdf,.hwpx,.docx,.xlsx,.txt,.md,.hwp';
fileInput.addEventListener('change',()=>{ const fs=[...fileInput.files]; fileInput.value=''; if(!fs.length) return; addPending(fs); rerenderIntake();
  const b=document.querySelector('[data-act=analyze]'); if(b) b.focus(); });
$main.addEventListener('dragover',e=>{ const z=e.target.closest('#dropzone,#filebar'); if(!z||state.view!=='chat'||chat.mode==='requested'||chat.busy) return; e.preventDefault(); z.classList.add('drag'); });
$main.addEventListener('dragleave',e=>{ const z=e.target.closest('#dropzone,#filebar'); if(z&&!z.contains(e.relatedTarget)) z.classList.remove('drag'); });
$main.addEventListener('drop',e=>{ const z=e.target.closest('#dropzone,#filebar'); if(!z||state.view!=='chat') return; e.preventDefault(); z.classList.remove('drag');
  if(chat.mode==='requested'||chat.busy) return; addPending(e.dataTransfer.files); rerenderIntake(); const b=document.querySelector('[data-act=analyze]'); if(b) b.focus(); });
window.addEventListener('dragover',e=>{ if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
window.addEventListener('drop',e=>{ if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')) e.preventDefault(); });

/* resizable split */
const SPLIT_MIN=300, SPLIT_MAX=760, SPLIT_DEF=380;
state.infoW=SPLIT_DEF; try{const v=+localStorage.getItem('sf-infow'); if(v>=SPLIT_MIN&&v<=SPLIT_MAX) state.infoW=v;}catch(e){}
function setInfoW(v,save){
  const work=document.getElementById('work'), sp=document.getElementById('split'); if(!work) return;
  const max=Math.max(SPLIT_MIN,Math.min(SPLIT_MAX,work.clientWidth-400-30));
  state.infoW=Math.round(Math.min(max,Math.max(SPLIT_MIN,v)));
  work.style.setProperty('--info-w',state.infoW+'px');
  sp.setAttribute('aria-valuenow',state.infoW); sp.setAttribute('aria-valuemax',max); sp.setAttribute('aria-valuetext',`수집된 보안정보 너비 ${state.infoW}픽셀`);
  if(save){try{localStorage.setItem('sf-infow',state.infoW);}catch(e){}}
}
function bindSplit(){
  const sp=document.getElementById('split'), work=document.getElementById('work'); if(!sp) return;
  sp.addEventListener('pointerdown',e=>{
    e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('drag'); document.body.classList.add('resizing');
    const right=work.getBoundingClientRect().right, z=(work.getBoundingClientRect().width/work.offsetWidth)||1;
    const move=ev=>setInfoW((right-ev.clientX)/z-4,false);
    const up=ev=>{sp.releasePointerCapture(e.pointerId);sp.classList.remove('drag');document.body.classList.remove('resizing');sp.removeEventListener('pointermove',move);sp.removeEventListener('pointerup',up);sp.removeEventListener('pointercancel',up);setInfoW(state.infoW,true);};
    sp.addEventListener('pointermove',move); sp.addEventListener('pointerup',up); sp.addEventListener('pointercancel',up);
  });
  sp.addEventListener('keydown',e=>{
    const step=e.shiftKey?60:20; let v=null;
    if(e.key==='ArrowLeft') v=state.infoW+step; else if(e.key==='ArrowRight') v=state.infoW-step;
    else if(e.key==='Home') v=SPLIT_MAX; else if(e.key==='End') v=SPLIT_MIN;
    if(v!==null){e.preventDefault();setInfoW(v,true);}
  });
  sp.addEventListener('dblclick',()=>setInfoW(SPLIT_DEF,true));
  setInfoW(state.infoW,false);
}
window.addEventListener('resize',()=>{if(state.view==='chat') setInfoW(state.infoW,false);});

/* inline edit of collected info */
function editorRow(id){
  const d=QD(id), x=chat.info[id], opts=optsFor(id);
  const cur=x.status==='unknown'?unknownLabel(id):(opts.find(o=>(x.v||'').startsWith(o))||x.v||'');
  return `<div class="irow editing"><label class="k" for="ie-${id}">${esc(d.label)}</label><div class="ie">
    ${opts.length?`<select id="ie-${id}" class="input input-sm">${opts.map(o=>`<option value="${esc(o)}" ${o===cur?'selected':''}>${esc(o)}</option>`).join('')}</select>`
      :`<input id="ie-${id}" class="input input-sm" value="${esc(cur)}" aria-describedby="ie-${id}-e"><p class="ferr" id="ie-${id}-e" hidden></p>`}
    <div class="btn-row"><button type="button" class="btn btn-sm" data-act="edit-save" data-k="${id}">저장</button><button type="button" class="btn btn-sm btn-tertiary" data-act="edit-cancel">취소</button></div></div></div>`;
}
function cancelEdit(){ const k=chat.editing; chat.editing=null; renderInfo(); const b=document.querySelector(`[data-act=edit-info][data-k="${k}"]`); if(b) b.focus(); }
function periodFor(ans){ if(ans.startsWith('시범')) return `${TODAY_STR} ~ ${addMonths(3)}`; if(ans==='1년'||(ans.startsWith('상시')&&published.guards.maxYear)) return `${TODAY_STR} ~ ${addMonths(12)}`; return null; }
async function applyEdit(id){
  if(chat.busy) return;
  if(id==='__name'){ const el=document.getElementById('ie-__name'), v=el.value.trim();
    if(!v){ el.setAttribute('aria-invalid','true'); const m=document.getElementById('ie-__name-e'); if(m){m.hidden=false;m.textContent='사업명을 입력해 주세요.';} el.focus(); return; }
    chat.name=v.slice(0,40); chat.nameSrc='user'; chat.editing=null; renderInfo();
    const h1=$main.querySelector('h1'); if(h1) h1.textContent=chat.name;
    const b=document.querySelector('[data-act=edit-info][data-k="__name"]'); if(b) b.focus(); return; }
  const el=document.getElementById('ie-'+id), val=el.value.trim(), d=QD(id), opts=optsFor(id);
  if(!val&&d.required){ el.setAttribute('aria-invalid','true'); const m=document.getElementById('ie-'+id+'-e'); if(m){m.hidden=false;m.textContent=`${d.label}을(를) 입력해 주세요.`;} el.focus(); return; }
  const before=buildRules(chat.info), bk=before.map(ruleKey);
  if(id==='purpose'&&val&&chat.nameSrc==='purpose'){ chat.name=makeTitle(val); const h1=$main.querySelector('h1'); if(h1) h1.textContent=chat.name; }
  if(!opts.length){ chat.info[id]=val?{v:val,status:'user',src:null}:{v:null,status:'skip',src:null}; }
  else { const unk=val===unknownLabel(id); chat.info[id]={v:unk?null:val,status:unk?'unknown':'user',src:null};
    if(id==='period'){ chat.period=unk?null:periodFor(val); if(chat.period) chat.info.period.v=`${val} (${chat.period}, 제안)`; } }
  chat.editing=null; chat.reqErr=[];
  const after=buildRules(chat.info), ak=after.map(ruleKey);
  const added=after.filter(r=>!bk.includes(ruleKey(r))), removed=before.filter(r=>!ak.includes(ruleKey(r)));
  renderInfo(); const b=document.querySelector(`[data-act=edit-info][data-k="${id}"]`); if(b) b.focus();
  chat.busy=true; me(`${d.label} 수정: ${val||'(건너뜀)'}`);
  await aiSay(`수정한 내용을 반영했어요.${added.length?`<div class="tr-box"><b>새로 생긴 규칙</b>${added.map(ruleLine).join('<br>')}</div>`:''}${removed.length?`<div class="wr-box">빠진 규칙<br>${removed.map(ruleLine).join('<br>')}</div>`:''}${!added.length&&!removed.length?'<div style="margin-top:.6rem">방화벽 규칙은 바뀌지 않았어요.</div>':''}`,{ok:`${d.label} 값이 바뀌었습니다.`});
  chat.busy=false;
}
$main.addEventListener('keydown',e=>{
  if(!e.target.id||!e.target.id.startsWith('ie-')||e.isComposing||e.keyCode===229) return;
  if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();applyEdit(e.target.id.slice(3));}
  else if(e.key==='Escape'){e.preventDefault();cancelEdit();}
});

/* ---------- 화면 동작 ---------- */
ACT['pick-file']=(b,p,e)=>{ fileInput.click(); return;
};
ACT['remove-pending']=(b,p,e)=>{ chat.pending.splice(+b.dataset.i,1); chat.fileErr=''; rerenderIntake(); {const n=document.querySelector('[data-act=remove-pending]')||document.querySelector('[data-act=pick-file]'); if(n) n.focus();} return;
};
ACT['analyze']=(b,p,e)=>{ analyzeDocs(); return;
};
ACT['confirm-item']=(b,p,e)=>{ confirmItem(b.dataset.k); return;
};
ACT['confirm-all']=(b,p,e)=>{ confirmAll(); return;
};
ACT['view-doc']=(b,p,e)=>{ viewDoc(); return;
};
ACT['start-q']=(b,p,e)=>{ chat.pending=[]; chat.fileErr=''; chat.mode='boot'; chat.cur=null; renderChat(); startQuestions(); return;
};
ACT['save-answer']=(b,p,e)=>{ saveAnswer(); return;
};
ACT['pick-opt']=(b,p,e)=>{ saveAnswer(b.dataset.v); return;
};
ACT['edit-info']=(b,p,e)=>{ if(chat.busy) return; chat.editing=b.dataset.k; renderInfo(); {const el=document.getElementById('ie-'+chat.editing); if(el) el.focus();} return;
};
ACT['edit-save']=(b,p,e)=>{ applyEdit(b.dataset.k); return;
};
ACT['edit-cancel']=(b,p,e)=>{ cancelEdit(); return;
};
ACT['request']=(b,p,e)=>{ requestTech(); return;
};
ACT['new-chat']=(b,p,e)=>{ newChat(null); renderChat(); $main.querySelector('h1').focus(); return;
};
VIEWS.chat=renderChat;
