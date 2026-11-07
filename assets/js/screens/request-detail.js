/* 보안길잡이 AI | 화면 전용 코드: request-detail.js */
'use strict';
/* ---------- detail ---------- */
const IPRE=/^(\d{1,3})(\.\d{1,3}){3}(\/(\d|[12]\d|3[0-2]))?$/;
const HOSTRE=/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const validIp=v=>IPRE.test(v)&&v.split('/')[0].split('.').every(x=>+x<=255);
function lint(p){
  const out=[], g=published.guards, risky=['21','22','23','3389','445'];
  p.rules.forEach((r,i)=>{
    if(g.noAny&&r.fromIp==='Any'&&r.toIp==='Any') out.push(['danger',`${i+1}번 규칙은 출발지와 목적지가 모두 Any입니다. 기관 기준상 신청할 수 없습니다.`]);
    if(r.fromIp==='Any'&&r.port&&!['80','443'].includes(r.port)) out.push(['danger',`${i+1}번 규칙은 인터넷 전체에서 ${r.port}번 포트로 들어오는 규칙입니다. 출발지 범위를 좁혀 주세요.`]);
    if(r.port&&risky.includes(r.port)&&r.dir.includes('인바운드')) out.push(r.dir.includes('VPN')?['info',`${i+1}번 규칙의 관리용 ${r.port}번 포트는 SSL-VPN을 거치도록 되어 있습니다.`]:['danger',`${i+1}번 규칙은 외부에서 관리용 ${r.port}번 포트를 직접 엽니다.`]);
  });
  if(p.pii&&g.pii) out.push(['info','개인정보를 다루는 사업입니다. 정보보안 담당자의 개인정보 처리 기준 검토가 필요합니다.']);
  const m=missingCount(p); if(m) out.push(['warning',`아직 정해지지 않은 값이 ${m}개 있습니다.`]);
  if(!out.some(o=>o[0]==='danger')) out.unshift(['success','기관 기준 자동 점검에서 걸린 규칙은 없습니다. 자동 점검은 보안 적합 판정이 아닙니다.']);
  return out;
}
function cellVal(r,k,edit,i,p){
  const v=r[k];
  if(v===null){
    if(edit){const id=`f-${i}-${k}`;const lbl=`${i+1}번 규칙 ${k==='port'?r.to+' 포트':(k==='fromIp'?r.from:r.to)+' 주소'}`;
      return `<label for="${id}" class="sr-only">${esc(lbl)}</label><input id="${id}" class="input input-sm" data-ri="${i}" data-k="${k}" inputmode="${k==='port'?'numeric':'text'}" aria-describedby="${id}-e"><p class="ferr" id="${id}-e" hidden></p>`;}
    return '<span class="badge b-warning">담당자 확인 필요</span>';
  }
  if(p&&(RULE_ADDR.includes(k)||k==='biz')) return `${esc(v)}${srcTag(srcOf(p,`r${i}.${k}`))}`;
  return esc(v);
}
/* 기관 추가 질문이 비어 있을 때: 담당 분야 협의가 끝났으면 선택 항목은 '입력 안 함(선택)', 아직이면 '입력 전' */
function emptyExtra(p,q){
  const done=p.stage>=2||(q.role==='infra'?p.infraDone:q.role==='sec'?p.secDone:false);
  if(!done) return `<span class="badge b-neutral">${FIELD[q.role]} 입력 전</span>`;
  return q.required?'<span class="badge b-warning">담당자 확인 필요</span>':'<span class="help">입력 안 함(선택)</span>';
}
/* 값 + 출처 꼬리표 + (AI 추론이면) 근거 */
const srcVal=(p,key,html)=>{const o=srcOf(p,key);return `<span class="src-v">${html}</span>${srcTag(o)}${srcEv(o)}`;};
function rulesTable(p,edit){
  const cols=published.formMap;
  if(!p.rules.length) return '<p class="help">아직 만들어진 규칙이 없습니다. 인터뷰를 마치면 AI가 규칙 초안을 제안합니다.</p>';
  return `<div class="tbl-wrap"><table class="tbl inner-tbl"><caption class="sr-only">방화벽 규칙. 열 이름은 기관 양식(${esc(published.formFile)}) 기준</caption>
    <thead><tr><th scope="col">번호</th>${cols.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${p.rules.map((r,i)=>`<tr><td>${i+1}</td>${cols.map(c=>`<td${c.k==='dir'?' class="nowrap"':''}>${cellVal(r,c.k,edit,i,p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderDetail(){
  const p=projects.find(x=>x.id===state.id);
  const [s,c]=statusOf(p); const t=turns(p); const mine=t.includes(state.role);
  const editInfra=mine&&state.role==='infra'&&p.stage===1;
  const stepper=`<ol class="stepper" aria-label="업무 단계">${STAGES.map((n,i)=>{
    const cls=i<p.stage||p.stage===4?'done':'';const cur=i===p.stage&&p.stage<4;
    return `<li class="${cls}" ${cur?'aria-current="step"':''}><span class="n">${i+1}단계${cls?' 완료':cur?' 진행 중':''}</span>${n}</li>`;}).join('')}</ol>`;
  $main.innerHTML=`
  <nav class="crumb" aria-label="현재 위치"><a href="requests.html">${MENU[state.role][0][1]}</a><span aria-hidden="true">/</span><span>신청 상세</span></nav>
  <div class="page-head" style="margin-bottom:2.4rem"><div><h1>${esc(p.name)}</h1>
    <p class="page-desc">${p.id}, ${esc(p.dept)} ${esc(p.requester)}, 설정 v${p.ver} <span class="badge ${c}" style="margin-left:.8rem">${s}</span></p></div></div>
  ${stepper}
  ${flashHTML()}
  <div class="detail"><div>
    <section class="card" aria-labelledby="d-info"><h2 class="h-panel" id="d-info">사업 정보</h2>
      <p class="help src-help">값 옆 꼬리표는 출처입니다: 사용자 답변, AI 추론(근거 포함), 직접 입력(입력한 담당자), 확인(확인한 담당자). AI 추론은 사람이 확인하기 전까지 확정값이 아닙니다.</p>
      <dl class="dl"><dt>사업 목적</dt><dd>${p.purpose?srcVal(p,'purpose',esc(p.purpose)):'미입력'}</dd>
      <dt>이용 대상</dt><dd>${p.audience?srcVal(p,'audience',esc(p.audience)):'<span class="badge b-warning">답변 필요</span>'}</dd>
      <dt>개인정보</dt><dd>${srcVal(p,'pii',p.pii?'<span class="badge b-info">포함, 정보보안 검토 필요</span>':'포함되지 않음')}</dd>
      <dt>운영 기간</dt><dd>${p.period?srcVal(p,'period',esc(p.period)):'<span class="badge b-warning">담당자 확인 필요</span>'}</dd>
      ${cfgOf(p).qs.filter(q=>q.on&&q.role!=='user').map(q=>`<dt>${esc(q.label)}</dt><dd>${(p.extra||{})[q.key]?srcVal(p,'x.'+q.key,esc(p.extra[q.key])):emptyExtra(p,q)}</dd>`).join('')}
      ${dueOf(p)?`<dt>처리 기한</dt><dd>${dueCell(p)}<span class="help">접수 ${dot(acceptDate(p))}부터 영업일 ${cfgOf(p).slaDays||published.slaDays||5}일</span></dd>`:''}
      ${p.attachments&&p.attachments.length?`<dt>첨부 문서</dt><dd>${p.attachments.map(esc).join(', ')}</dd>`:''}
      <dt>적용 설정</dt><dd>v${p.ver} (${p.cfg.order==='par'?'동시':'순차'} 검토${p.cfg.head?', 부서장 확인':''})</dd>
      ${p.notes&&p.notes.length?`<dt>추가 설명</dt><dd>${p.notes.map(n=>esc(n)).join('<br>')}</dd>`:''}
      ${p.reply?`<dt>보완 답변</dt><dd>${esc(p.reply)}</dd>`:''}</dl></section>
    ${(p.supps||[]).length?`<section class="card" aria-labelledby="d-supp"><div class="card-h"><h2 class="h-panel" id="d-supp">보완 요청과 답변</h2>${openSupps(p).length?`<span class="badge b-warning">미해결 ${openSupps(p).length}건</span>`:'<span class="badge b-success">모두 답변됨</span>'}</div>
      <ul class="thread">${p.supps.map(sp=>`<li><div class="supp-h"><b>${esc(sp.item)}</b>${sp.reply?'<span class="badge b-success">답변 완료</span>':'<span class="badge b-warning">답변 필요</span>'}</div><p style="margin:.4rem 0">${esc(sp.text)}</p><p class="meta" style="margin:0">요청: ${esc(sp.from)} ${esc(sp.at)}, 작성: 신청자</p>${!sp.reply&&state.role==='user'&&waitingUser(p)?`<a class="link-more" href="#sr-${p.id}-${sp.id}" data-act="goto-reply">${I.chev}<span>답변 칸으로 이동</span></a>`:''}${sp.reply?`<div class="reply"><p style="margin:0">${esc(sp.reply)}</p><p class="meta" style="margin:.2rem 0 0">신청자 답변 ${esc(sp.replyAt||'')}</p></div>`:''}</li>`).join('')}</ul></section>`:''}
    <section class="card" aria-labelledby="d-docs"><h2 class="h-panel" id="d-docs">문서</h2>${docCard(p,true)}</section>
    ${p.rules.length?`<section class="card" aria-labelledby="d-flow"><div class="card-h"><h2 class="h-panel" id="d-flow">데이터 흐름도</h2></div>${flowSVG(p.rules,{w:720,id:'d',ip:true})}</section>`:''}
    <section class="card" aria-labelledby="d-rules"><h2 class="h-panel" id="d-rules">방화벽 규칙</h2>
      
      ${rulesTable(p,editInfra)}</section>
    <section class="card" aria-labelledby="d-lint"><h2 class="h-panel" id="d-lint">기관 기준 자동 점검</h2>
      <ul class="chk-list">${lint(p).map(([k,txt])=>`<li><span class="badge b-${k}">${{danger:'위반',warning:'미확정',info:'확인',success:'통과'}[k]}</span><span>${esc(txt)}</span></li>`).join('')}</ul></section>
    <section class="card" aria-labelledby="d-hist"><h2 class="h-panel" id="d-hist">처리 이력</h2>
      <ol class="hist">${p.history.slice().reverse().map(h=>`<li><time>${esc(h.at)}</time><span>${esc(h.who)}: ${esc(h.what)}</span></li>`).join('')}</ol></section>
  </div>
  <aside class="review" aria-labelledby="rv-h"><div class="card">${consultStatus(p)}${reviewPanel(p,mine)}</div></aside></div>`;
  if(p.cellDraft) Object.entries(p.cellDraft).forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.value=v;});
}
function consultStatus(p){
  const st=r=>{const done=r==='infra'?p.infraDone:p.secDone;
    if(p.stage>=2||done) return '<span class="badge b-success">협의 완료</span>';
    if(p.stage===0) return '<span class="badge b-neutral">대기</span>';
    if(waitingUser(p)&&openSupps(p).some(s=>s.from===FIELD[r])) return '<span class="badge b-warning">보완 대기</span>';
    if(r==='infra'&&p.returnedInfra) return '<span class="badge b-warning">보완 요청</span>';
    if(p.cfg.order==='seq'&&r==='sec'&&!p.infraDone) return '<span class="badge b-neutral">검토 대기</span>';
    return '<span class="badge b-info">검토 중</span>';};
  /* 처리 순서(ICT인프라 → 정보보안)대로 표시 */
  return `<div class="consult"><div><span>ICT인프라</span>${st('infra')}</div><div><span>정보보안</span>${st('sec')}</div></div>`;
}
function reviewPanel(p,mine){
  const role=state.role;
  if(!mine){
    const t=turns(p);
    const who=t.length?t.map(r=>ROLES[r].name).join(', '):'';
    const msg=p.stage===4?(p.result==='reject'?'처리 불가로 기록된 신청입니다.':'처리 결과가 기록된 신청입니다. 적용된 정책은 정책 수명주기에서 관리합니다.'):`지금은 ${who} 차례입니다. 처리가 끝나면 다음 담당자에게 넘어갑니다.`;
    return `<h2 class="h-panel" id="rv-h">현재 처리 상황</h2><p>${esc(msg)}</p>`;
  }
  if(p.stage===0) return `<h2 class="h-panel" id="rv-h">인터뷰 이어서 작성</h2><p>필수 질문에 아직 답하지 않았습니다. 이어서 답하면 방화벽 규칙 초안이 만들어집니다.</p><button type="button" class="btn btn-primary btn-block" data-act="resume" data-id="${p.id}">인터뷰 이어서 작성</button><button type="button" class="btn btn-danger btn-block" style="margin-top:.8rem" data-act="del-draft" data-id="${p.id}">작성 중인 신청 삭제</button>`;
  if(waitingUser(p)&&role==='user'){
    return `<h2 class="h-panel" id="rv-h">보완 답변</h2>
    
    ${openSupps(p).map(sp=>suppForm(p,sp,openSupps(p).length===1)).join('')}`;
  }
  if(p.stage===1&&(role==='infra'||role==='sec')){
    const isInfra=role==='infra', d=(p.drafts||{})[role]||{};
    const items=isInfra?['서버·DB 구성과 운영 환경을 확인했습니다','출발지·목적지·프로토콜·포트를 확인했습니다','접속 기간과 운영 책임을 확인했습니다']
      :['개인정보 처리 범위와 보관 기간을 확인했습니다','외부로 나가는 연결과 목적지를 확인했습니다','관리 접속 경로와 위험 포트를 확인했습니다'];
    const xq=cfgOf(p).qs.filter(q=>q.on&&q.role===role);
    const done=items.filter((x,i)=>d.chk&&d.chk[i]).length;
    return `<h2 class="h-panel" id="rv-h">${isInfra?'ICT인프라 검토':'정보보안 검토'}</h2>
    ${p.returnedInfra&&isInfra?`<div class="notice n-warning">${I.warn}<p>정보보안 담당자 요청: ${esc(p.returnedInfra)}</p></div>`:''}
    ${p.cfg.order==='par'&&!isInfra&&!p.infraDone?`<div class="notice n-info">${I.info}<p>동시 협의 중입니다. ICT인프라 담당자의 통신 정보 입력이 아직 끝나지 않았습니다.</p></div>`:''}
    
    ${isInfra&&!p.period?`<fieldset><legend class="legend">운영 기간<span class="req">필수</span></legend>
      <div class="field"><label for="ps">시작일 (YYYY-MM-DD)</label><input id="ps" class="input" inputmode="numeric" aria-describedby="ps-e" value="${esc(d.ps||'')}"><p class="ferr" id="ps-e" hidden></p></div>
      <div class="field" style="margin-bottom:0"><label for="pe">종료일 (YYYY-MM-DD)</label><input id="pe" class="input" inputmode="numeric" aria-describedby="pe-e pe-h" value="${esc(d.pe||'')}"><p class="help" id="pe-h" style="margin:0">${published.guards.maxYear?'기관 기준상 최대 1년까지 입력할 수 있습니다.':''}</p><p class="ferr" id="pe-e" hidden></p></div></fieldset>`:''}
    ${xq.length?`<fieldset><legend class="legend">기관 추가 질문</legend>${xq.map(q=>`<div class="field"><label for="xq-${q.key}">${esc(q.label)}${q.required?'<span class="req">필수</span>':'<span class="opt-tag">선택</span>'}</label><p class="help" id="xq-${q.key}-h" style="margin:0">${esc(q.title)} ${esc(q.help||'')}</p>
      ${q.format==='장문형'?`<textarea id="xq-${q.key}" class="input" data-xq="${q.key}" aria-describedby="xq-${q.key}-h xq-${q.key}-e">${esc((d.xq&&d.xq[q.key])??((p.extra||{})[q.key]||''))}</textarea>`:`<input id="xq-${q.key}" class="input" data-xq="${q.key}" aria-describedby="xq-${q.key}-h xq-${q.key}-e" value="${esc((d.xq&&d.xq[q.key])??((p.extra||{})[q.key]||''))}">`}<p class="ferr" id="xq-${q.key}-e" hidden></p></div>`).join('')}</fieldset>`:''}
    <fieldset><legend class="legend">검토 체크리스트 <span class="help">${done}/${items.length}</span><span class="req">필수</span></legend>
      ${items.map((x,i)=>`<label class="check"><input type="checkbox" data-chk ${d.chk&&d.chk[i]?'checked':''}><span>${x}</span></label>`).join('')}</fieldset>
    <div class="field"><label for="op">검토 의견<span class="opt-tag">보완 요청 시 필수</span></label><p class="help" id="op-h" style="margin:0">확인 근거와 후속 조치를 구체적으로 적어 주세요.</p><textarea id="op" class="input" aria-describedby="op-h op-e">${esc(d.op||'')}</textarea><p class="ferr" id="op-e" hidden></p></div>
    <details class="sub-block"><summary>보완 요청하기</summary>
      <div class="field" style="margin-top:1.2rem"><label for="si">보완 항목<span class="opt-tag">보완 요청 시 필수</span></label><input id="si" class="input" placeholder="예: 개인정보 보유기간" aria-describedby="si-e"><p class="ferr" id="si-e" hidden></p></div>
      <fieldset><legend class="legend">보완 요청 대상</legend><div class="radios">
        <label class="ropt"><input type="radio" name="rt" value="user"><span>신청자</span></label>
        ${isInfra?'':'<label class="ropt"><input type="radio" name="rt" value="infra"><span>ICT인프라 담당</span></label>'}</div></fieldset>
      <button type="button" class="btn" data-act="staff-return" data-id="${p.id}">보완 요청 보내기</button></details>
    <div id="err-sum"></div>
    <div class="btn-row" style="justify-content:flex-end;margin-top:1.6rem"><button type="button" class="btn btn-tertiary" data-act="staff-draft" data-id="${p.id}">검토 초안 저장</button><button type="button" class="btn btn-primary" data-act="staff-done" data-id="${p.id}">사전 협의 완료</button></div>
    
    ${memoBlock(p)}`;
  }
  if(p.stage===2){
    const m=missingCount(p);
    return `<h2 class="h-panel" id="rv-h">최종 제출 확인</h2>
    
    ${m?`<div class="notice n-warning">${I.warn}<p>정해지지 않은 값이 ${m}개 있습니다. 미확정 값은 제출본에 ‘담당자 확인 필요’로 남습니다.</p></div>`:''}
    <fieldset><legend class="legend">제출 확인<span class="req">필수</span></legend>
      <label class="check"><input type="checkbox" data-chk><span>왼쪽의 사업 정보와 방화벽 규칙을 확인했습니다</span></label>
      ${p.cfg.head?'<label class="check"><input type="checkbox" data-chk><span>부서장 확인을 받았습니다</span></label>':''}</fieldset>
    <p class="help">제출하면 제출본 ${(p.rev||0)+1}이 만들어지고 정보보안 담당자가 최종 검토합니다. 제출 뒤 수정은 보완 요청을 통해서만 할 수 있습니다.</p>
    <div id="err-sum"></div>
    <div class="btn-row"><button type="button" class="btn" data-act="doc-preview" data-id="${p.id}">제출본 미리보기</button><button type="button" class="btn btn-primary" data-act="submit" data-id="${p.id}">최종 제출</button></div>`;
  }
  if(p.stage===3){
    return `<h2 class="h-panel" id="rv-h">처리 결과 기록</h2>
    
    <fieldset><legend class="legend">처리 결과<span class="req">필수</span></legend><div class="radios">
      <label class="ropt"><input type="radio" name="res" value="done"><span>처리 완료</span></label>
      <label class="ropt"><input type="radio" name="res" value="reject"><span>처리 불가</span></label></div><p class="ferr" id="res-e" hidden></p></fieldset>
    <div class="field"><label for="ev">처리 근거<span class="req">필수</span></label><p class="help" id="ev-h" style="margin:0">변경 작업 번호나 적용 기록을 적어 주세요. 예: 변경요청 CR-2026-1182</p><input id="ev" class="input" aria-describedby="ev-h ev-e"><p class="ferr" id="ev-e" hidden></p></div>
    <div id="err-sum"></div>
    <button type="button" class="btn btn-primary btn-block" data-act="record" data-id="${p.id}">처리 결과 기록</button>`;
  }
  return '<h2 class="h-panel" id="rv-h">현재 처리 상황</h2><p>처리할 작업이 없습니다.</p>';
}
function collectDraft(p){
  const role=state.role, d={chk:[...$main.querySelectorAll('[data-chk]')].map(c=>c.checked),op:(document.getElementById('op')||{}).value||'',xq:{}};
  $main.querySelectorAll('[data-xq]').forEach(el=>{d.xq[el.dataset.xq]=el.value;});
  const ps=document.getElementById('ps'),pe=document.getElementById('pe'); if(ps){d.ps=ps.value;d.pe=pe.value;}
  p.drafts=p.drafts||{}; p.drafts[role]=d; return d;
}
function staffDraft(p){
  collectDraft(p);
  $main.querySelectorAll('input[data-ri]').forEach(inp=>{p.cellDraft=p.cellDraft||{};p.cellDraft[inp.id]=inp.value;});
  doneFlash(p,'success','검토 초안을 저장했습니다. 협의 완료 전까지 다른 담당자와 신청자에게는 보이지 않습니다.');
  route(false); const n=$main.querySelector('.notice[role=status]'); if(n){n.setAttribute('tabindex','-1');n.focus();}
}
function staffDone(p){
  const role=state.role; clearErrors(); const errs=[]; const d=collectDraft(p);
  const vals=[]; let range=null;
  if(role==='infra'){
    $main.querySelectorAll('input[data-ri]').forEach(inp=>{
      const r=p.rules[+inp.dataset.ri], k=inp.dataset.k, v=inp.value.trim(), lbl=`${+inp.dataset.ri+1}번 규칙`;
      const ok=k==='port'?(/^\d+$/.test(v)&&+v>=1&&+v<=65535):(validIp(v)||(r.dir==='아웃바운드'&&k==='toIp'&&HOSTRE.test(v)));
      if(!ok) errs.push({id:inp.id,msg:k==='port'?`${lbl} ${r.to} 포트를 1~65535 사이 숫자로 입력해 주세요.`:`${lbl} ${k==='fromIp'?r.from:r.to} 주소를 IPv4 주소나 대역으로 입력해 주세요. 예: 10.20.5.11`});
      vals.push([r,k,v,+inp.dataset.ri]);
    });
    if(!p.period){
      const sv=d.ps.trim(), ev=d.pe.trim();
      if(!validDate(sv)) errs.push({id:'ps',msg:'운영 시작일을 YYYY-MM-DD 형식으로 입력해 주세요.'});
      if(!validDate(ev)) errs.push({id:'pe',msg:'운영 종료일을 YYYY-MM-DD 형식으로 입력해 주세요.'});
      else if(validDate(sv)){
        const sd=new Date(sv+'T00:00:00'), ed=new Date(ev+'T00:00:00');
        if(ed<sd) errs.push({id:'pe',msg:'종료일이 시작일보다 앞섭니다. 날짜 순서를 확인해 주세요.'});
        else if(published.guards.maxYear){const lim=new Date(sd);lim.setFullYear(lim.getFullYear()+1);if(ed>=lim) errs.push({id:'pe',msg:'기관 기준상 허용 기간은 최대 1년입니다. 종료일을 앞당겨 주세요.'});}
      }
      range=`${sv} ~ ${ev}`;
    }
  }
  cfgOf(p).qs.filter(q=>q.on&&q.role===role&&q.required).forEach(q=>{ if(!(d.xq[q.key]||'').trim()) errs.push({id:'xq-'+q.key,msg:`${q.label}을(를) 입력해 주세요.`}); });
  const un=d.chk.filter(x=>!x).length; if(un) errs.push({id:null,msg:`검토 체크리스트 ${un}개를 아직 확인하지 않았습니다.`});
  if(errs.length){showErrors(errs);return;}
  const by={k:'staff',by:ROLES[role].person,at:nowStamp()}; p.src=p.src||{};
  vals.forEach(([r,k,v,i])=>{r[k]=v;p.src[`r${i}.${k}`]={...by};});
  /* ICT인프라가 협의를 마치면, 직접 입력하지 않은 기존 주소·포트(AI 제안)는 ICT인프라가 확인한 값으로 기록 */
  if(role==='infra') p.rules.forEach((r,i)=>RULE_ADDR.forEach(k=>{const key=`r${i}.${k}`; if(r[k]!=null&&r[k]!=='Any'&&!p.src[key]) p.src[key]={k:'ai',ok:'staff',okBy:ROLES.infra.person,ev:'규칙 초안의 기본값'};}));
  if(range){p.period=range;p.unknown=(p.unknown||[]).filter(x=>x!=='운영 기간');p.src.period={...by};}
  const xs=Object.entries(d.xq).filter(([,v])=>v.trim());
  p.extra=Object.assign(p.extra||{},Object.fromEntries(xs)); xs.forEach(([k])=>{p.src['x.'+k]={...by};});
  if(role==='infra'){p.infraDone=true;p.returnedInfra=null;} else {p.secDone=true;p.secNote=d.op;}
  delete p.drafts[role];
  p.history.push(H(nowStamp(),ROLE_TAG[role],(role==='infra'?'통신 정보 입력, ':'')+'사전 협의 완료'+(d.op?` (의견: ${d.op})`:'')));
  const both=p.infraDone&&p.secDone; if(both) p.stage=2;
  const other=role==='infra'?'정보보안':'ICT인프라';
  doneFlash(p,'success',both?'사전 협의 완료를 기록했습니다. 두 분야 협의가 끝나 신청자가 최종 제출할 차례입니다.':`사전 협의 완료를 기록했습니다. ${other} 담당자의 협의가 끝나면 신청자 제출 단계로 넘어갑니다.`);
  route(true);
}
function staffReturn(p){
  const role=state.role; clearErrors(); const errs=[]; collectDraft(p);
  const op=document.getElementById('op').value.trim(), item=document.getElementById('si').value.trim();
  const rt=$main.querySelector('input[name=rt]:checked');
  if(!item) errs.push({id:'si',msg:'보완 항목을 짧게 적어 주세요. 예: 개인정보 보유기간'});
  if(!op) errs.push({id:'op',msg:'보완 요청 이유를 검토 의견에 적어 주세요.'});
  if(!rt) errs.push({id:null,msg:'보완 요청 대상을 선택해 주세요.'});
  if(errs.length){ $main.querySelector('details.sub-block').open=true; showErrors(errs);return;}
  if(rt.value==='user'){
    p.supps=p.supps||[]; p.supps.push({id:p.supps.length+1,from:FIELD[role],item,text:op,reply:null,at:nowStamp()});
    if(role==='infra') p.infraDone=false; else p.secDone=false;
    p.history.push(H(nowStamp(),ROLE_TAG[role],`보완 요청 (신청자): ${item}`));
  } else { p.infraDone=false; p.returnedInfra=`${item}: ${op}`; p.history.push(H(nowStamp(),ROLE_TAG[role],`보완 요청 (ICT인프라): ${item}`)); }
  delete p.drafts[role];
  doneFlash(p,'success',`보완을 요청했습니다. ${rt.value==='user'?'신청자':'ICT인프라 담당자'}의 화면과 보완 요청 목록에 표시됩니다.`);
  route(true);
}
function memoBlock(p){
  const ms=p.memos||[];
  return `<details class="sub-block" style="margin-top:1.6rem"><summary>내부 검토 메모 (${ms.length})</summary>
    
    ${ms.map(m=>`<div class="memo"><p style="margin:0">${esc(m.text)}</p><p class="meta" style="margin:.2rem 0 0">${esc(m.who)} ${esc(m.at)}</p></div>`).join('')}
    <div class="field" style="margin-top:1.2rem"><label for="memo">새 메모</label><textarea id="memo" class="input" style="min-height:7.2rem"></textarea></div>
    <button type="button" class="btn btn-tertiary" data-act="memo" data-id="${p.id}">메모 저장</button></details>`;
}
function saveMemo(p){
  const el=document.getElementById('memo'),v=el.value.trim(); if(!v){el.focus();return;}
  collectDraft(p);
  p.memos=p.memos||[]; p.memos.push({who:ROLE_TAG[state.role]||'정해원 (기관 관리자)',at:nowStamp(),text:v});
  doneFlash(p,'success','내부 메모를 저장했습니다.'); route(false);
  const d=$main.querySelector('.memo:last-of-type'); const det=d&&d.closest('details'); if(det){det.open=true;}
}
function submitFinal(p){
  clearErrors(); const errs=[];
  const unchecked=[...$main.querySelectorAll('[data-chk]')].filter(c=>!c.checked).length;
  if(unchecked) errs.push({id:null,msg:`제출 확인 항목 ${unchecked}개를 확인해 주세요.`});
  if(errs.length){showErrors(errs);return;}
  p.rev=(p.rev||0)+1;p.stage=3;p.submittedAt=nowStamp();p.updated=TODAY_STR;
  p.history.push(H(p.submittedAt,ROLE_TAG.user,`제출본 ${p.rev} 제출`));
  go('submitted-'+p.id);
}
function recordResult(p){
  clearErrors(); const errs=[];
  const res=$main.querySelector('input[name=res]:checked'); const ev=document.getElementById('ev').value.trim();
  if(!res) errs.push({id:null,msg:'처리 결과를 선택해 주세요.'});
  if(!ev) errs.push({id:'ev',msg:'처리 근거를 입력해 주세요. 예: 변경요청 번호'});
  if(errs.length){showErrors(errs);return;}
  p.stage=4;p.result=res.value;p.evidence=ev;
  p.history.push(H(nowStamp(),'이서연 (정보보안)',`처리 결과 기록 (${res.value==='done'?'처리 완료':'처리 불가'}, 근거: ${ev})`));
  if(res.value==='done'){
    const exp=(p.period&&p.period.split('~')[1]||'').trim();
    p.rules.forEach((r,i)=>policies.unshift({id:`FW-26-${String(100+policies.length).padStart(4,'0')}`,name:`${p.name} ${i+1}`,owner:p.requester,from:r.fromIp,to:r.toIp,port:r.port,exp:validDate(exp)?exp:addMonths(12),last:TODAY_STR,hits:0,fresh:true}));
  }
  doneFlash(p,'success',res.value==='done'?'처리 결과를 기록했습니다. 실제 적용 여부는 첨부 근거에서 확인해 주세요. 규칙은 정책 수명주기 목록에 등록했습니다.':'처리 불가로 기록했습니다. 신청자에게 사유가 표시됩니다.');
  route(true);
}
/* ---------- 화면 동작 ---------- */
ACT['staff-done']=(b,p,e)=>{ staffDone(p); return;
};
ACT['staff-return']=(b,p,e)=>{ staffReturn(p); return;
};
ACT['staff-draft']=(b,p,e)=>{ staffDraft(p); return;
};
ACT['memo']=(b,p,e)=>{ saveMemo(p); return;
};
ACT['submit']=(b,p,e)=>{ submitFinal(p); return;
};
ACT['record']=(b,p,e)=>{ recordResult(p); return;
};
VIEWS.detail=renderDetail;

/* 본문 보완 요청 카드의 '답변 칸으로 이동': 오른쪽(좁은 화면에서는 아래) 답변 칸으로 이동해 바로 입력 */
ACT['goto-reply']=(b,p,e)=>{ e.preventDefault(); const t=document.getElementById(b.getAttribute('href').slice(1)); if(!t) return;
  t.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); t.focus({preventScroll:true}); };
