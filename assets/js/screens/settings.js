/* 보안길잡이 AI | 화면 전용 코드: settings.js */
'use strict';
/* ---------- settings ---------- */
const STABS=[['questions','인터뷰 질문'],['workflow','검토 절차'],['form','문서 양식'],['rules','점검 기준·알림'],['versions','설정 버전']];
const QFIELDS=['label','title','help','format','role','when','cond','required','on'];
const ROLE_LBL={user:'신청자',sec:'정보보안',infra:'ICT인프라'};
const COND_LBL={all:'전체',pii:'개인정보 포함 시',ext:'외부 연계 시'};
function diffList(){
  const d=[],a=published,b=draft;
  if(a.order!==b.order) d.push(`사전 협의 방식: ${a.order==='seq'?'순차':'동시'} → ${b.order==='seq'?'순차':'동시'}`);
  if((a.slaDays||5)!==(b.slaDays||5)) d.push(`처리 기한: 영업일 ${a.slaDays||5}일 → ${b.slaDays||5}일`);
  if(a.head!==b.head) d.push(`제출 전 부서장 확인: ${b.head?'추가':'삭제'}`);
  a.qs.forEach(o=>{if(!b.qs.find(x=>x.key===o.key)) d.push(`질문 삭제: ${o.label} (${ROLE_LBL[o.role]})`);});
  b.qs.forEach(q=>{const o=a.qs.find(x=>x.key===q.key);
    if(!o){d.push(`질문 추가: ${q.label} (${ROLE_LBL[q.role]})`);return;}
    const ch=QFIELDS.filter(f=>o[f]!==q[f]); if(ch.length) d.push(`질문 ‘${q.label}’ 변경: ${ch.map(f=>({label:'이름',title:'문구',help:'도움말',format:'응답 형식',role:'작성 역할',when:'필수 시점',cond:'적용 조건',required:'필수 여부',on:'사용 여부'})[f]).join(', ')}`);});
  Object.keys(b.guards).forEach(k=>{if(a.guards[k]!==b.guards[k]) d.push(`점검 기준 ‘${GUARD_LABEL[k]}’: ${b.guards[k]?'사용':'사용 안 함'}`);});
  if(a.warnDays!==b.warnDays) d.push(`만료 알림: ${a.warnDays}일 전 → ${b.warnDays}일 전`);
  if(a.idleDays!==b.idleDays) d.push(`미사용 기준: ${a.idleDays}일 → ${b.idleDays}일`);
  if(a.formFile!==b.formFile) d.push(`양식 파일: ${a.formFile} → ${b.formFile}`);
  b.formMap.forEach((m,i)=>{if(a.formMap[i].label!==m.label) d.push(`양식 칸 ‘${m.std}’: ${a.formMap[i].label} → ${m.label}`);});
  if(JSON.stringify(a.docs)!==JSON.stringify(b.docs)) d.push('참고 지침 목록 변경');
  return d;
}
function radioGroup(name,opts,val,attrs,disabled){
  return `<div class="radios">${opts.map(([v,l])=>`<label class="ropt"><input type="radio" id="${name}-${v}" name="${name}" value="${v}" ${attrs} ${val===v?'checked':''} ${disabled?'disabled':''}><span>${l}</span></label>`).join('')}</div>`;
}
function renderSettings(){
  const changes=diffList(), b=draft, tab=state.stab||'questions';
  $main.innerHTML=`
  <div class="page-head"><div><h1>기관 설정</h1></div></div>
  ${flashHTML()}
  <div class="org-bar">
    <div class="verbar" style="margin:0"><span class="badge b-success">게시본 v${published.version}</span>
      ${changes.length?`<span class="badge b-warning">수정 초안 v${published.version+1}, 변경 ${changes.length}건${draftSaved?' (저장됨)':' (저장 전)'}</span>`:'<span class="badge b-neutral">게시본과 같음</span>'}</div>
    </div>
  <div class="tabs" role="tablist" aria-label="기관 설정 항목">${STABS.map(([k,l])=>`<button type="button" role="tab" id="tab-${k}" aria-controls="tp-${k}" aria-selected="${k===tab}" tabindex="${k===tab?0:-1}" data-act="stab" data-k="${k}">${l}${k==='questions'?` <span class="tcount">${b.qs.filter(q=>q.on).length}</span>`:''}</button>`).join('')}</div>
  <section class="tabpanel" role="tabpanel" id="tp-${tab}" aria-labelledby="tab-${tab}">${({questions:tabQuestions,workflow:tabWorkflow,form:tabForm,rules:tabRules,versions:tabVersions})[tab]()}</section>
  ${tab==='versions'?'':`<div class="actions"><button type="button" class="btn btn-tertiary" data-act="discard" aria-describedby="nochg" ${changes.length?'':'disabled'}>초안 변경 취소</button>
    <span class="help" id="nochg" ${changes.length?'hidden':''}>게시본과 다른 내용이 없어 취소하거나 게시할 내용이 없습니다.</span>
    <div class="btn-row"><button type="button" class="btn" data-act="save-draft">설정 초안 저장</button><button type="button" class="btn btn-primary" data-act="publish" aria-describedby="nochg" ${changes.length?'':'disabled'}>변경 검토·게시</button></div></div>`}`;
}
function tabQuestions(){
  const b=draft, sel=state.selq&&b.qs.find(q=>q.key===state.selq)?state.selq:b.qs[0].key, q=b.qs.find(x=>x.key===sel);
  state.selq=sel;
  const term=(state.qsearch||'').trim();
  const list=b.qs.map((x,i)=>({x,i})).filter(({x})=>!term||(x.label+x.title).includes(term));
  const builtinLock=q.builtin;
  return `<div class="qgrid">
    <div class="qlist-wrap"><div class="field" style="margin-bottom:1.2rem"><label for="qsearch">질문 검색</label><div class="qrow"><input id="qsearch" class="input" type="search" value="${esc(state.qsearch||'')}"><button type="button" class="btn btn-tertiary" data-act="qsearch">검색</button></div></div>
      ${list.length?`<ol class="qlist">${list.map(({x,i})=>`<li><button type="button" data-act="selq" data-k="${x.key}" aria-pressed="${x.key===sel}"><span class="qn">${String(i+1).padStart(2,'0')}</span><span><b>${esc(x.label)}</b><span class="help">${ROLE_LBL[x.role]}, ${x.required?'필수':'선택'}, ${x.on?'사용':'사용 안 함'}${published.qs.find(o=>o.key===x.key)?'':', 새 질문'}</span></span></button></li>`).join('')}</ol>`:'<p class="help">검색 결과가 없습니다. 검색어를 바꿔 보세요.</p>'}
      <button type="button" class="btn btn-block" data-act="addq" style="margin-top:1.2rem">질문 추가</button></div>
    <div class="card" style="margin:0"><div class="card-h"><h2 class="h-panel">질문 설정: ${esc(q.label)}</h2><span class="badge ${published.qs.find(o=>o.key===q.key)?(QFIELDS.some(f=>published.qs.find(o=>o.key===q.key)[f]!==q[f])?'b-warning':'b-neutral'):'b-warning'}">${published.qs.find(o=>o.key===q.key)?(QFIELDS.some(f=>published.qs.find(o=>o.key===q.key)[f]!==q[f])?'수정 초안':'게시본과 같음'):'새 질문 초안'}</span></div>
      <div class="field"><label for="qf-label">목록 이름<span class="req">필수</span></label><input id="qf-label" class="input" data-qf="label" value="${esc(q.label)}" maxlength="30" aria-describedby="qf-label-h"><p class="help" id="qf-label-h" style="margin:0">수집 결과와 신청서 항목명으로 쓰입니다. (최대 30자)</p></div>
      <div class="field"><label for="qf-title">질문 문구<span class="req">필수</span></label><input id="qf-title" class="input" data-qf="title" value="${esc(q.title)}" maxlength="100"></div>
      <div class="field"><label for="qf-key">저장 키</label><input id="qf-key" class="input" value="${esc(q.key)}" readonly aria-describedby="qf-key-h"><p class="help" id="qf-key-h" style="margin:0">저장 키는 답변과 연결되어 바꿀 수 없습니다. 다른 값을 받으려면 새 질문을 추가해 주세요.</p></div>
      <div class="field"><label for="qf-help">도움말<span class="opt-tag">선택</span></label><textarea id="qf-help" class="input" data-qf="help">${esc(q.help||'')}</textarea></div>
      <fieldset><legend class="legend">응답 형식</legend>${radioGroup('qf-format',[['장문형','장문형'],['단답형','단답형'],['선택형','선택형']],q.format,'data-qf="format"',builtinLock)}
        <p class="help">${builtinLock?'기본 질문은 보기와 방화벽 규칙 변환이 연결되어 있어 형식을 바꿀 수 없습니다.':'선택형 보기 편집은 지원하지 않습니다. 장문형이나 단답형을 사용해 주세요.'}</p></fieldset>
      <fieldset><legend class="legend">작성 역할</legend>${radioGroup('qf-role',[['user','신청자'],['sec','정보보안'],['infra','ICT인프라']],q.role,'data-qf="role"',builtinLock)}
        </fieldset>
      <fieldset><legend class="legend">필수 시점</legend>${radioGroup('qf-when',[['최초 신청','최초 신청'],['사전 협의','사전 협의'],['검토 완료 전','검토 완료 전']],q.when,'data-qf="when"',false)}</fieldset>
      <fieldset><legend class="legend">적용 조건</legend>${radioGroup('qf-cond',[['all','전체'],['pii','개인정보 포함 시'],['ext','외부 연계 시']],q.cond,'data-qf="cond"',builtinLock)}
        </fieldset>
      <label class="check"><input type="checkbox" id="qf-required" data-qf="required" ${q.required?'checked':''} ${q.lockReq?'disabled aria-describedby="qf-req-h"':''}><span>필수 질문${q.lockReq?'<br><span class="help" id="qf-req-h">방화벽 신청서 필수 항목이라 선택으로 바꿀 수 없습니다.</span>':''}</span></label>
      <label class="check"><input type="checkbox" id="qf-on" data-qf="on" ${q.on?'checked':''} ${q.lockReq?'disabled':''}><span>질문 사용</span></label>
      <div class="qdel">${q.builtin
        ?`<button type="button" class="btn btn-danger" disabled aria-describedby="qdel-h">질문 삭제</button><p class="help" id="qdel-h" style="margin:0">기본 질문은 방화벽 규칙 변환에 연결되어 있어 삭제할 수 없습니다.${q.lockReq?'':' 더 묻지 않으려면 ‘질문 사용’을 해제해 주세요.'}</p>`
        :`<button type="button" class="btn btn-danger" data-act="delq" data-k="${q.key}">질문 삭제</button>`}</div>
    </div></div>`;
}
function tabWorkflow(){
  const b=draft;
  const flow=b.order==='par'?['작성','정보보안 + ICT인프라 동시 검토','사용자 최종 검토','확정·관리']:['작성','ICT인프라 통신 정보 입력','정보보안 검토','사용자 최종 검토','확정·관리'];
  if(b.head) flow.splice(flow.indexOf('사용자 최종 검토')+1,0,'부서장 확인');
  return `<div class="card" style="margin:0"><h2 class="h-panel" style="margin-bottom:.8rem">기관 검토 절차</h2>
    <p class="help" style="margin-top:0">현재 게시 절차: ${published.order==='par'?'동시':'순차'} 검토${published.head?', 부서장 확인':''}</p>
    <fieldset><legend class="legend">2단계 사전 협의 방식</legend><div class="choice-cards">
      <label class="ccard"><input type="radio" name="order" value="par" data-cfg="order" ${b.order==='par'?'checked':''}><span><b>동시 검토</b>두 담당 분야가 함께 검토하고, 모두 완료하면 신청자 제출 단계로 넘어갑니다.</span></label>
      <label class="ccard"><input type="radio" name="order" value="seq" data-cfg="order" ${b.order==='seq'?'checked':''}><span><b>순차 검토</b>ICT인프라가 통신 정보를 채운 뒤 정보보안이 검토합니다.</span></label></div></fieldset>
    <fieldset><legend class="legend">3단계 추가 확인</legend><label class="check"><input type="checkbox" data-cfg="head" ${b.head?'checked':''}><span>최종 제출 전에 부서장 확인을 받도록 합니다</span></label></fieldset>
    <div class="field" style="max-width:40rem"><label for="sla">처리 기한 (접수일부터 영업일 기준, 일)</label><input id="sla" class="input" type="number" min="1" max="60" data-cfg="sla" value="${b.slaDays||5}" style="max-width:16rem"></div>
    <h3 class="h-panel" style="font-size:1.7rem;margin:0 0 1.2rem">새 신청에 적용할 흐름</h3>
    <ol class="flow">${flow.map(f=>`<li>${esc(f)}</li>`).join('')}</ol>
    </div>`;
}
function tabForm(){
  const b=draft, fs=formScan;
  let status='';
  if(fs&&fs.busy) status=`<div class="notice n-info" role="status">${I.info}<p>${esc(fs.file)}에서 칸 이름을 찾고 있습니다.</p></div>`;
  else if(fs&&fs.err) status=`<div class="notice n-danger" role="alert" tabindex="-1" id="form-res">${I.warn}<p>${esc(fs.err)}</p></div>`;
  else if(fs&&fs.labels){const got=b.formMap.length-fs.miss.length;
    status=`<div class="notice ${fs.miss.length?'n-warning':'n-success'}" role="status" tabindex="-1" id="form-res">${fs.miss.length?I.warn:I.okc}<div><p><b>칸 이름 ${b.formMap.length}개 중 ${got}개를 자동으로 채웠습니다.</b></p>${fs.miss.length?`<p>${fs.miss.map(k=>esc(b.formMap.find(x=>x.k===k).std)).join(', ')}은(는) 직접 입력해 주세요. 입력칸에서 양식의 칸 이름을 골라 넣을 수 있습니다.</p>`:''}</div></div>
      <details class="sub-block"><summary>양식에서 찾은 칸 이름 ${fs.labels.length}개</summary><ul class="found-labels">${fs.labels.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></details>`;}
  const tag=k=>fs&&fs.labels?(fs.auto[k]?' <span class="badge b-info">자동</span>':' <span class="badge b-warning">확인 필요</span>'):'';
  return `<div class="card" style="margin:0"><h2 class="h-panel" style="margin-bottom:1.6rem">문서 양식: 우리 기관 신청서에 맞추기</h2>
    <div class="cols"><div>
      <p style="margin-top:0">현재 양식 파일</p><p><span class="badge b-neutral">${esc(b.formFile)}</span></p>
      <div class="field" style="margin-bottom:1.2rem"><button type="button" class="btn" data-act="form-pick" aria-describedby="form-h" ${fs&&fs.busy?'disabled':''}>양식 파일 업로드</button>
        <p class="help" id="form-h" style="margin:0">HWPX, DOCX, XLSX 파일, 10MB 이하</p></div>
      <input type="file" id="form-file" accept=".hwpx,.docx,.xlsx,.hwp,.pdf" hidden>
      ${status}</div>
      <div class="mapgrid"><span class="help">표준 항목</span><span class="help">우리 양식의 칸 이름</span>
      ${b.formMap.map((m,i)=>`<label for="map-${i}">${esc(m.std)}${tag(m.k)}</label><input id="map-${i}" class="input" data-cfg="map" data-i="${i}" value="${esc(m.label)}" ${fs&&fs.labels?'list="form-labels"':''}>`).join('')}</div></div>
    ${fs&&fs.labels?`<datalist id="form-labels">${fs.labels.map(t=>`<option value="${esc(t)}"></option>`).join('')}</datalist>`:''}</div>`;
}

/* form file analysis */
let formScan=null;
const FORM_EXT=['hwpx','docx','xlsx'];
async function extractLabels(ext,buf){
  let cells=[];
  if(ext==='xlsx'){
    await loadScript(SHEETJS_URL); const wb=window.XLSX.read(buf,{type:'array'});
    wb.SheetNames.forEach(n=>window.XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:''}).forEach(r=>r.forEach(c=>{if(c!=null&&c!=='')cells.push(String(c));})));
  } else {
    await loadScript(JSZIP_URL); const zip=await window.JSZip.loadAsync(buf);
    const names=Object.keys(zip.files).filter(f=>ext==='docx'?f==='word/document.xml':/^Contents\/section\d+\.xml$/i.test(f)).sort();
    if(!names.length) throw new Error('nocontent');
    for(const f of names){
      const doc=new DOMParser().parseFromString(await zip.file(f).async('string'),'application/xml');
      const all=[...doc.getElementsByTagName('*')];
      const tcs=all.filter(e=>e.localName==='tc'), src=tcs.length?tcs:all.filter(e=>e.localName==='p');
      src.forEach(el=>{ if(tcs.length&&[...el.getElementsByTagName('*')].some(x=>x.localName==='tc')) return;
        cells.push([...el.getElementsByTagName('*')].filter(x=>x.localName==='t').map(x=>x.textContent).join('')); });
    }
  }
  const seen=new Set(), out=[];
  cells.forEach(c=>{ const t=c.replace(/\s+/g,' ').replace(/^[\s※*·:\-]+|[\s:*]+$/g,'').trim();
    if(t&&t.length<=20&&!/^[\d\s.,:\-\/]+$/.test(t)&&!seen.has(t)){seen.add(t);out.push(t);} });
  return out;
}
const FIELD_RULES=[
  ['fromIp',{all:[/출발|소스|source|송신|src/i,/ip|주소|address|대역/i]}],
  ['toIp',{all:[/목적지|도착|destination|수신|dst/i,/ip|주소|address|대역/i]}],
  ['from',{all:[/출발|소스|source|송신|src/i],not:/ip|주소|address|대역|포트|port/i}],
  ['to',{all:[/목적지|도착|destination|수신|dst/i],not:/ip|주소|address|대역|포트|port/i}],
  ['port',{all:[/포트|port/i],not:/ip|주소/i}],
  ['proto',{all:[/프로토콜|protocol|tcp|udp/i]}],
  ['dir',{rank:[/방향|direction/i,/in\s*\/\s*out|인\s*\/\s*아웃|인바운드|아웃바운드/i,/^구분$/]}],
  ['biz',{rank:[/신청\s*사유|요청\s*사유/,/사유/,/용도|목적(?!지)/,/업무\s*(내용|설명)|서비스\s*명|내용/],not:/출발|목적지|도착|ip|포트|port|주소/i}]
];
function matchLabels(labels){
  const used=new Set(), out={};
  FIELD_RULES.forEach(([k,r])=>{
    let best=null,bs=1e9;
    labels.forEach(t=>{ if(used.has(t)||(r.not&&r.not.test(t))) return;
      let sc=null;
      if(r.all){ if(r.all.every(re=>re.test(t))) sc=t.length; }
      else { const i=r.rank.findIndex(re=>re.test(t)); if(i>=0) sc=i*100+t.length; }
      if(sc!==null&&sc<bs){bs=sc;best=t;} });
    if(best){out[k]=best;used.add(best);} });
  return out;
}
async function handleFormFile(f){
  const ext=(f.name.split('.').pop()||'').toLowerCase();
  const fail=msg=>{formScan={file:f.name,err:msg};renderSettings();const r=document.getElementById('form-res');if(r)r.focus();};
  if(ext==='hwp'||ext==='pdf') return fail(`${ext.toUpperCase()} 파일에서는 칸 이름을 읽을 수 없습니다. 한글에서 HWPX로, 또는 DOCX로 저장해 다시 올려 주세요.`);
  if(!FORM_EXT.includes(ext)) return fail(`${f.name}은(는) 지원하지 않는 형식입니다. HWPX, DOCX, XLSX 파일을 올려 주세요.`);
  if(f.size>10*1048576) return fail('10MB를 넘는 파일입니다. 신청서 양식 부분만 따로 저장해 다시 올려 주세요.');
  formScan={file:f.name,busy:true}; renderSettings();
  try{
    const labels=await extractLabels(ext,await f.arrayBuffer());
    if(!labels.length) throw new Error('empty');
    const m=matchLabels(labels), auto={}, miss=[];
    draft.formMap.forEach(x=>{ if(m[x.k]){x.label=m[x.k];auto[x.k]=true;} else {x.label=x.std;miss.push(x.k);} });
    draft.formFile=f.name; draftSaved=false;
    formScan={file:f.name,labels,auto,miss};
    renderSettings(); const r=document.getElementById('form-res'); if(r) r.focus();
  }catch(e){
    fail(e&&e.message==='load'?'양식 분석 도구를 불러오지 못했습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.'
      :(e&&(e.message==='empty'||e.message==='nocontent'))?'양식에서 칸 이름을 찾지 못했습니다. 표가 들어 있는 신청서 양식인지 확인해 주세요.'
      :'파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인하고 다시 올려 주세요.');
  }
}
$main.addEventListener('change',e=>{ if(e.target.id==='form-file'){const f=e.target.files[0]; e.target.value=''; if(f) handleFormFile(f);} });

function tabRules(){
  const b=draft;
  return `<div class="cols"><div class="card" style="margin:0"><h2 class="h-panel" style="margin-bottom:1.2rem">자동 점검 기준</h2>
      ${Object.keys(GUARD_LABEL).map(k=>`<label class="check"><input type="checkbox" data-cfg="g" data-k="${k}" ${b.guards[k]?'checked':''}><span>${GUARD_LABEL[k]}</span></label>`).join('')}
      <h2 class="h-panel" style="margin:2.4rem 0 1.2rem">수명주기 알림</h2>
      <div class="field"><label for="wd">만료 며칠 전에 연장 여부를 물을까요 (일)</label><input id="wd" class="input" type="number" min="1" max="180" data-cfg="warn" value="${b.warnDays}" style="max-width:16rem"></div>
      <div class="field" style="margin-bottom:0"><label for="idd">며칠 동안 트래픽이 없으면 회수 후보로 표시할까요 (일)</label><input id="idd" class="input" type="number" min="7" max="365" data-cfg="idle" value="${b.idleDays}" style="max-width:16rem"></div></div>
    <div class="card" style="margin:0"><h2 class="h-panel" style="margin-bottom:1.2rem">AI가 참고하는 기관 지침</h2>
      <ul class="doclist">${b.docs.map((d,i)=>`<li><span>${esc(d)}</span><button type="button" class="btn btn-tertiary btn-sm" data-act="del-doc" data-i="${i}" aria-label="${esc(d)} 빼기">빼기</button></li>`).join('')}</ul>
      <div class="field" style="margin-bottom:.8rem"><label for="nd">추가할 지침 이름</label><div class="qrow"><input id="nd" class="input"><button type="button" class="btn" data-act="add-doc">지침 추가</button></div></div></div></div>`;
}
function tabVersions(){
  const ch=diffList();
  const rows=versions.slice().reverse().map(v=>{const c=v.cfg;const n=projects.filter(p=>p.ver===v.version).length;
    return `<tr><td><b>v${v.version}</b></td><td>${v.version===published.version?'<span class="badge b-success">현재 게시본</span>':'<span class="badge b-neutral">이전 게시본</span>'}</td><td>${esc(v.publishedAt)}</td>
      <td class="num">${c.qs.filter(q=>q.on&&q.role==='user').length}개 / ${c.qs.filter(q=>q.on&&q.role!=='user').length}개</td><td>${c.order==='par'?'동시':'순차'} 검토${c.head?', 부서장 확인':''}</td><td>${esc(v.note||'')}</td><td class="num">${n}건</td></tr>`;}).join('');
  return `<div class="card" style="margin:0"><h2 class="h-panel" style="margin-bottom:1.2rem">게시 이력</h2>
    <div class="tbl-wrap"><table class="tbl"><caption class="sr-only">기관 설정 게시 버전</caption>
    <thead><tr><th scope="col">버전</th><th scope="col">상태</th><th scope="col">게시 시각</th><th scope="col">질문 (신청자 / 담당자)</th><th scope="col">검토 절차</th><th scope="col">변경 요약</th><th scope="col">이 버전으로 만든 신청</th></tr></thead>
    <tbody>${ch.length?`<tr><td><b>v${published.version+1}</b></td><td><span class="badge b-warning">수정 초안</span></td><td>게시 전</td><td class="num">${draft.qs.filter(q=>q.on&&q.role==='user').length}개 / ${draft.qs.filter(q=>q.on&&q.role!=='user').length}개</td><td>${draft.order==='par'?'동시':'순차'} 검토${draft.head?', 부서장 확인':''}</td><td>변경 ${ch.length}건</td><td class="num">-</td></tr>`:''}${rows}</tbody></table></div></div>`;
}
/* 게시본과 다른 내용이 있을 때만 '초안 변경 취소'·'변경 검토·게시'를 켠다 */
function syncActions(n){
  $main.querySelectorAll('[data-act=discard],[data-act=publish]').forEach(b=>{b.disabled=!n;});
  const h=document.getElementById('nochg'); if(h) h.hidden=!!n;
}
function settingsChange(t){
  const k=t.dataset.cfg, fid=t.id;
  if(t.dataset.qf){const q=draft.qs.find(x=>x.key===state.selq);const f=t.dataset.qf;
    q[f]=t.type==='checkbox'?t.checked:(f==='label'||f==='title'?(t.value.trim()||q[f]):t.value);
    if(f==='role'&&t.value!=='user'&&q.when==='최초 신청') q.when='사전 협의';}
  if(k==='map') draft.formMap[+t.dataset.i].label=t.value.trim()||draft.formMap[+t.dataset.i].std;
  if(k==='order') draft.order=t.value;
  if(k==='head') draft.head=t.checked;
  if(k==='sla') draft.slaDays=Math.min(60,Math.max(1,+t.value||5));
  if(k==='g') draft.guards[t.dataset.k]=t.checked;
  if(k==='warn') draft.warnDays=Math.min(180,Math.max(1,+t.value||30));
  if(k==='idle') draft.idleDays=Math.min(365,Math.max(7,+t.value||90));
  draftSaved=false;
  if(['text','textarea','number','search'].includes(t.type)||t.tagName==='TEXTAREA'){
    const n=diffList().length, vb=$main.querySelector('.org-bar .verbar');
    if(vb) vb.lastElementChild.outerHTML=n?`<span class="badge b-warning">수정 초안 v${published.version+1}, 변경 ${n}건 (저장 전)</span>`:'<span class="badge b-neutral">게시본과 같음</span>';
    syncActions(n);
    return;
  }
  renderSettings();
  const el=fid&&document.getElementById(fid); if(el) el.focus();
}
function publishDraft(){
  const d=diffList();
  if(!d.length){state.flash={kind:'warning',text:'게시본과 달라진 내용이 없어 게시할 수 없습니다.'};renderSettings();return;}
  const v=published.version+1;
  openDialog(`설정 v${v}를 게시할까요?`,`<p style="margin-top:0">대상 기관: 한국주택금융공사</p><p>바뀌는 내용 ${d.length}건</p><ul>${d.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="help">게시 뒤 새로 시작하는 신청부터 적용됩니다. 진행 중인 신청 ${projects.filter(p=>p.stage<4).length}건은 기존 버전을 유지합니다.</p>`,
    [{label:'취소',cls:'btn-tertiary'},{label:'설정 게시',cls:'btn-primary',fn:()=>{
      const at=nowStamp(); published=clone(draft); published.version=v; published.publishedAt=at;
      versions.push({version:v,publishedAt:at,note:d.slice(0,2).join(', ')+(d.length>2?` 외 ${d.length-2}건`:''),cfg:clone(published)});
      draft=clone(published); draftSaved=false; formScan=null;
      state.flash={kind:'success',text:`설정 v${v}를 게시했습니다. 새 신청부터 적용됩니다.`};
      renderSettings(); }}]);
}
/* ---------- 화면 동작 ---------- */
ACT['stab']=(b,p,e)=>{ state.stab=b.dataset.k; state.flash=null; renderSettings(); document.getElementById('tab-'+state.stab).focus(); return;
};
ACT['selq']=(b,p,e)=>{ state.selq=b.dataset.k; renderSettings(); { const nb=$main.querySelector(`[data-act=selq][data-k="${state.selq}"]`); if(nb) nb.focus(); } return;
};
ACT['qsearch']=(b,p,e)=>{ state.qsearch=document.getElementById('qsearch').value; renderSettings(); document.getElementById('qsearch').focus(); return;
};
ACT['delq']=(b,p,e)=>{ {const q=draft.qs.find(x=>x.key===b.dataset.k); if(!q||q.builtin) return;
      const pub=published.qs.find(x=>x.key===q.key), used=projects.filter(p=>p.extra&&p.extra[q.key]).length;
      openDialog(`‘${q.label}’ 질문을 삭제할까요?`,`<p style="margin-top:0">${pub?`게시본 v${published.version}에 있는 질문입니다. 삭제는 수정 초안에 반영되고, 게시하면 새 신청부터 이 질문을 묻지 않습니다.`:'아직 게시하지 않은 새 질문입니다. 초안에서 바로 사라집니다.'}</p>${used?`<p>이 질문에 답한 기존 신청 ${used}건의 답변은 그대로 남습니다.</p>`:''}<p class="help">저장 키 ${esc(q.key)}는 다시 쓸 수 없습니다. 같은 내용이 필요하면 새 질문을 추가해 주세요.</p>`,
        [{label:'취소',cls:'btn-tertiary'},{label:'질문 삭제',cls:'btn-danger',fn:()=>{
          const i=draft.qs.indexOf(q); draft.qs.splice(i,1); draftSaved=false; state.selq=(draft.qs[i]||draft.qs[i-1]||draft.qs[0]).key;
          state.flash={kind:'success',text:`‘${q.label}’ 질문을 초안에서 삭제했습니다.${pub?' 게시하면 새 신청부터 적용됩니다.':''}`};
          renderSettings(); opener=$main.querySelector(`[data-act=selq][data-k="${state.selq}"]`); }}]); return;}
};
ACT['addq']=(b,p,e)=>{ {const n=draft.qs.filter(q=>!q.builtin).length+1; const key='custom_'+Date.now().toString(36);
      draft.qs.push({key,builtin:false,role:'user',label:`새 질문 ${n}`,title:'질문 문구를 입력해 주세요.',help:'',format:'장문형',when:'최초 신청',cond:'all',required:false,on:true});
      state.selq=key; state.qsearch=''; draftSaved=false; renderSettings(); document.getElementById('qf-label').focus(); document.getElementById('qf-label').select(); return;}
};
ACT['del-doc']=(b,p,e)=>{ draft.docs.splice(+b.dataset.i,1); draftSaved=false; renderSettings(); return;
};
ACT['add-doc']=(b,p,e)=>{ {const v=document.getElementById('nd').value.trim(); if(!v){document.getElementById('nd').focus();return;} draft.docs.push(v); draftSaved=false; renderSettings(); document.getElementById('nd').focus(); return;}
};
ACT['discard']=(b,p,e)=>{ openDialog('초안 변경을 취소할까요?',`<p>게시본 v${published.version}과 다른 ${diffList().length}건의 수정 내용이 사라집니다.</p>`,
      [{label:'계속 수정',cls:'btn-tertiary'},{label:'변경 취소',cls:'btn-danger',fn:()=>{draft=clone(published);draftSaved=false;formScan=null;state.flash={kind:'info',text:'초안 변경을 취소했습니다. 게시본과 같은 상태입니다.'};renderSettings();}}]); return;
};
ACT['save-draft']=(b,p,e)=>{ draftSaved=true; state.flash={kind:'success',text:'설정 초안을 저장했습니다. 게시하면 새 신청부터 적용됩니다.'}; renderSettings(); {const n=$main.querySelector('.notice[role=status]'); n.setAttribute('tabindex','-1'); n.focus();} return;
};
ACT['publish']=(b,p,e)=>{ publishDraft(); return;
};
ACT['form-pick']=(b,p,e)=>{ document.getElementById('form-file').click(); return;
};
$main.addEventListener('change',e=>{if(state.view==='settings'&&(e.target.dataset.cfg||e.target.dataset.qf)) settingsChange(e.target);});
/* 글자를 입력하는 동안에도 버튼 상태를 바로 바꾼다 (change는 입력칸을 떠날 때만 일어남) */
$main.addEventListener('input',e=>{const t=e.target; if(state.view==='settings'&&(t.dataset.cfg||t.dataset.qf)&&(['text','textarea','number','search'].includes(t.type)||t.tagName==='TEXTAREA')) settingsChange(t);});
VIEWS.settings=renderSettings;
