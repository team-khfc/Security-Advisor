/* 보안길잡이 AI | 화면 전용 코드: requests.js */
'use strict';
/* ---------- dashboard ---------- */
function bars(p){
  const done=p.stage===4, n=Math.min(p.stage+1,4);
  const label=done?'4단계 / 4단계 완료':`${n}단계 / 4단계`;
  return `<div class="prog-l">${label}</div><div class="bars ${done?'done':''}" aria-hidden="true">${[0,1,2,3].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')}</div><span class="sr-only">현재 ${esc(STAGES[Math.min(p.stage,3)])} 단계</span>`;
}
function inStat(p,k){
  if(k==='mine') return myTurn(p);
  if(k==='staff') return staffTurn(p);
  if(k==='done') return p.stage===4;
  return true;
}
function renderDash(){
  const all=scoped(), mine=all.filter(myTurn), staff=all.filter(staffTurn), done=all.filter(p=>p.stage===4);
  const statDefs=[
    ['mine','내가 할 일',I.pencil,mine.length,state.role==='user'?'보완·확인 진행 중':'내 차례인 협의·검토'],
    ['staff','담당자 확인 중',I.users,staff.length,'담당자 작업 필요'],
    ['done','처리 완료',I.check,done.length,'검토·처리 기록 완료'],
    ['all',state.role==='user'?'내 신청 전체':'전체 신청',I.doc,all.length,state.role==='user'?'본인이 신청한 건':'현재 선택한 기관 기준']];
  const pillDefs=[['all','전체'],['mine','내가 할 일'],['staff','담당자 확인 중'],['done','완료']];
  const q=state.q.trim().toLowerCase();
  let list=all.filter(p=>inStat(p,state.filter));
  if(state.role==='infra'||state.role==='sec') list=list.slice().sort((a,b)=>{const x=dueOf(a),y=dueOf(b); if(x===y) return 0; if(!x) return 1; if(!y) return -1; return x<y?-1:1;});
  const per=state.per||'all', pr=periodRange();
  if(pr) list=list.filter(p=>{const d=regDate(p);return d>=pr[0]&&d<=pr[1];});
  if(q) list=list.filter(p=>(p.name+p.dept+p.id+p.requester).toLowerCase().includes(q));
  /* 신청자는 본인 신청만 보므로 담당부서·신청자 열을 숨긴다 */
  const showWho=state.role!=='user';
  const cols=showWho?[['사업명','32%'],['담당부서·신청자','16%'],['진행 단계','18%'],['상태','18%'],['처리 기한','16%']]
    :[['사업명','30%'],['담당자','22%'],['진행 단계','16%'],['상태','16%'],['처리 기한','16%']];
  const sqLabel=showWho?'사업명·부서·신청자 검색':'사업명·신청번호 검색';
  const PER=5, pages=Math.max(1,Math.ceil(list.length/PER)); state.page=Math.min(Math.max(1,state.page||1),pages); const pg=state.page;
  const attention=policies.filter(p=>!p.retired&&policyStatus(p).attention).length;
  const head={user:['신청 현황','신청한 사업이 어느 단계에 있고 다음에 무엇을 해야 하는지 확인합니다.'],
    infra:['협의 요청함','통신 정보 입력이 필요한 신청과 협의 진행 상황을 확인합니다.'],
    sec:['협의 요청함','정보보안 검토와 처리 결과 기록이 필요한 신청을 확인합니다.'],
    admin:['신청 현황','기관 전체 신청의 진행 상황을 확인합니다.']}[state.role];
  $main.innerHTML=`
  <div class="page-head"><div><h1>${head[0]}</h1></div>
    ${state.role==='user'?`<a class="btn btn-primary" href="new-request.html">새 신청 시작</a>`:''}</div>
  ${flashHTML()}
  ${(state.role==='infra'||state.role==='sec')&&attention?`<div class="notice n-warning">${I.warn}<p>만료가 다가오거나 오래 쓰지 않은 방화벽 정책이 ${attention}건 있습니다. <a href="policies.html">정책 수명주기에서 확인하기</a></p></div>`:''}
  <section aria-labelledby="sum-h"><h2 id="sum-h" class="sr-only">요약</h2>
  <div class="stats">${statDefs.map(([k,l,ic,n,d])=>`<button type="button" class="stat" data-act="stat" data-k="${k}" aria-pressed="${state.filter===k}">
    <span class="stat-l">${ic}<span>${l}</span></span><span class="stat-num">${n}<small>건</small></span></button>`).join('')}</div></section>
  <section aria-labelledby="list-h">
    <div class="sec-head"><h2 class="h-sec" id="list-h">신청 내역<span class="count">${all.length}</span></h2><ul class="st-legend" aria-label="진행 단계 색상">${STAGES.map((n,i)=>`<li><i style="background:var(--st${i+1})" aria-hidden="true"></i>${i+1}. ${n}</li>`).join('')}</ul></div>
    <div class="toolbar">
      <div class="pills" role="group" aria-label="상태로 거르기">${pillDefs.map(([k,l])=>`<button type="button" class="pill" data-act="stat" data-k="${k}" aria-pressed="${state.filter===k}">${l}</button>`).join('')}</div>
      <div class="dfilter">
        <div class="per"><label for="per">접수 기간</label><select id="per" class="input">${[['all','전체 기간'],['7','최근 1주'],['30','최근 1개월'],['90','최근 3개월'],['custom','직접 입력']].map(([k,l])=>`<option value="${k}" ${per===k?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="pdates" id="pdates" ${per==='custom'?'':'hidden'}>
          <label for="pf-from">시작일</label><input type="date" id="pf-from" class="input" value="${esc(state.from||'')}" max="${TODAY_STR}" aria-describedby="pf-e">
          <span aria-hidden="true">~</span>
          <label for="pf-to">종료일</label><input type="date" id="pf-to" class="input" value="${esc(state.to||'')}" max="${TODAY_STR}" aria-describedby="pf-e">
        </div>
        <div class="search" role="search"><label for="sq" class="sr-only">${sqLabel}</label>
          <input id="sq" class="input" type="search" placeholder="${sqLabel}" value="${esc(state.q)}">
          <button type="button" class="sbtn" data-act="search" aria-label="검색">${I.search}</button></div>
      </div>
    </div>
    <p class="ferr" id="pf-e" hidden></p>
    <p class="filter-state" role="status">${pillDefs.find(x=>x[0]===state.filter)[1]} ${q?`, 검색어 “${esc(state.q)}”`:''}${pr?`, 접수 기간 ${pr[0]==='0000-00-00'?'처음':dot(pr[0])} ~ ${pr[1]==='9999-12-31'?'오늘':dot(pr[1])}`:''} 결과 ${list.length}건${pages>1?`, ${pg} / ${pages}페이지`:''}
      ${(state.filter!=='all'||q||pr)?'<button type="button" class="btn btn-tertiary btn-sm" data-act="reset-filter">조건 초기화</button>':''}</p>
    ${list.length?`<div class="tbl-wrap"><table class="tbl rows-link"><caption class="sr-only">신청 내역 목록. 행을 누르면 신청 상세로 이동합니다.</caption>
      <colgroup>${cols.map(([,w])=>`<col style="width:${w}">`).join('')}</colgroup>
      <thead><tr>${cols.map(([l])=>`<th scope="col">${l}</th>`).join('')}</tr></thead>
      <tbody>${list.slice((pg-1)*PER,pg*PER).map(rowHTML).join('')}</tbody></table></div>${pager(pg,pages)}`
      :`<div class="empty-box">${q?'검색 결과가 없습니다. 검색어를 바꾸거나 조건을 초기화해 주세요.':'이 조건에 해당하는 신청이 없습니다.'}</div>`}
  </section>`;
}
function taskCard(p){
  const [s,c]=statusOf(p);
  const when=dueOf(p)?`처리 기한 ${dot(dueOf(p))}`:`최근 변경 ${dot(p.updated)}`;
  const href=p.stage===0&&state.role==='user'?'new-request.html':'request-detail.html?id='+p.id;
  return `<article class="task"><div class="task-top"><span class="badge ${c}">${s}</span><span class="id">${p.id}</span></div>
    <h3>${esc(p.name)}</h3><p class="help" style="margin:0">${esc(p.dept)}, ${esc(nextTodo(p))}</p>
    <div class="task-foot"><span class="when">${I.clock}${when}</span>
      <a class="btn" href="${href}" data-resume="${p.stage===0?p.id:''}" aria-label="${esc(p.name)} 작업 이어가기">${I.arrow}작업 이어가기</a></div></article>`;
}
/* 신청자 화면의 담당자 열: ICT인프라 → 정보보안 순서로 배정된 담당자와 분야별 진행 */
function fieldState(p,r){
  const done=r==='infra'?p.infraDone:p.secDone;
  if(p.stage===3&&r==='sec') return ['now','최종 검토 중'];
  if(p.stage>=2||done) return ['done','완료'];
  if(waitingUser(p)&&openSupps(p).some(s=>s.from===FIELD[r])) return ['warn','보완 요청'];
  if(r==='infra'&&p.returnedInfra) return ['warn','보완 요청'];
  if(p.cfg.order==='seq'&&r==='sec'&&!p.infraDone) return ['wait','대기'];
  return ['now',r==='infra'?'입력 중':'검토 중'];
}
function assignCell(p){
  if(p.stage===0) return '<span class="asg-none">협의 요청 후 배정</span>';
  return `<ul class="asg">${['infra','sec'].map(r=>{const [k,t]=fieldState(p,r);
    return `<li><span class="asg-f">${FIELD[r]}</span><span class="asg-n">${esc(ROLES[r].person)}</span><span class="asg-s s-${k}">${t}</span></li>`;}).join('')}</ul>`;
}
/* 상태 아래 한 줄: 지금 누구 차례인지 (다음 할 일 열 대신) */
function turnLine(p){
  const t=turns(p); if(!t.length) return '';
  if(t.includes(state.role)) return `<span class="turn me">${esc(nextTodo(p))}</span>`;
  if(state.role==='user') return ''; /* 신청자는 담당자 열에서 분야별 진행을 보므로 생략 */
  const txt=p.stage===1&&!waitingUser(p)?t.map(r=>r==='infra'?'ICT인프라 통신 정보 입력 중':'정보보안 검토 중').join(', ')
    :p.stage===3?'정보보안 최종 검토 중':p.stage===0?'신청자 작성 중':waitingUser(p)?'신청자 보완 답변 대기':'신청자 최종 제출 대기';
  return `<span class="turn">${txt}</span>`;
}
function rowHTML(p){
  const [s,c]=statusOf(p);
  const over=(dueLeft(p)??1)<0;
  return `<tr class="${over?'overdue':''}"><td><div class="p-id">${p.id}</div><div class="p-name"><a href="request-detail.html?id=${p.id}">${esc(p.name)}</a></div><div class="p-meta">접수일 ${dot(regDate(p))}</div></td>
    ${state.role!=='user'?`<td><div>${esc(p.dept)}</div><div class="p-meta">${esc(p.requester)}</div></td>`:`<td>${assignCell(p)}</td>`}
    <td>${bars(p)}</td><td><span class="badge ${c}">${s}</span>${turnLine(p)}</td><td>${dueCell(p)}</td></tr>`;
}


/* pagination */
function pager(pg,pages){
  if(pages<=1) return '';
  let start=Math.max(1,pg-4), end=Math.min(pages,start+9); start=Math.max(1,end-9);
  const nums=[]; for(let i=start;i<=end;i++) nums.push(i);
  const btn=(k,label,txt,dis)=>`<button type="button" data-act="page" data-k="${k}" aria-label="${label}" ${dis?'disabled':''}>${txt}</button>`;
  return `<nav class="pager" aria-label="신청 내역 페이지">${btn(1,'처음 페이지','«',pg===1)}${btn(pg-1,'이전 페이지','‹ 이전',pg===1)}
    ${nums.map(n=>`<button type="button" data-act="page" data-k="${n}" aria-label="${n}페이지" ${n===pg?'aria-current="page"':''}>${n}</button>`).join('')}
    ${btn(pg+1,'다음 페이지','다음 ›',pg===pages)}${btn(pages,'마지막 페이지','»',pg===pages)}</nav>`;
}

/* dashboard period filter */
function periodRange(){
  const k=state.per||'all'; if(k==='all') return null;
  if(k==='custom') return (state.from||state.to)?[state.from||'0000-00-00',state.to||'9999-12-31']:null;
  return [fmt(new Date(TODAY.getTime()-(+k-1)*DAY)),TODAY_STR];
}
function applyDashFilter(focusId){
  const per=document.getElementById('per').value, f=document.getElementById('pf-from').value.trim(), t=document.getElementById('pf-to').value.trim(), err=document.getElementById('pf-e');
  ['pf-from','pf-to'].forEach(id=>document.getElementById(id).removeAttribute('aria-invalid')); err.hidden=true;
  if(per==='custom'){
    let m='', bad='pf-from';
    if(!f&&!t) m='시작일이나 종료일 중 하나 이상을 입력해 주세요.';
    else if(f&&!validDate(f)) m='시작일을 YYYY-MM-DD 형식으로 입력해 주세요. 예: 2026-10-01';
    else if(t&&!validDate(t)){m='종료일을 YYYY-MM-DD 형식으로 입력해 주세요. 예: 2026-11-05';bad='pf-to';}
    else if(f&&t&&f>t){m='시작일이 종료일보다 늦습니다. 날짜 순서를 확인해 주세요.';bad='pf-to';}
    if(m){err.textContent=m;err.hidden=false;const el=document.getElementById(bad);el.setAttribute('aria-invalid','true');el.focus();return;}
  }
  state.q=document.getElementById('sq').value; state.per=per; state.from=per==='custom'?f:''; state.to=per==='custom'?t:''; state.page=1;
  renderDash(); const el=document.getElementById(focusId||'sq'); if(el) el.focus();
}
$main.addEventListener('change',e=>{
  if(e.target.id!=='per') return;
  const custom=e.target.value==='custom';
  document.getElementById('pdates').hidden=!custom;
  if(custom) document.getElementById('pf-from').focus(); else applyDashFilter('per');
});

/* ---------- 화면 동작 ---------- */
ACT['page']=(b,p,e)=>{ state.page=+b.dataset.k; renderDash(); { const nb=$main.querySelector('.pager [aria-current="page"]'); if(nb) nb.focus(); } return;
};
ACT['stat']=(b,p,e)=>{ state.filter=b.dataset.k; state.page=1; renderDash(); { const nb=$main.querySelector(`[data-act=stat][data-k="${state.filter}"]${b.classList.contains('pill')?'.pill':'.stat'}`); if(nb) nb.focus(); } return;
};
ACT['search']=(b,p,e)=>{ applyDashFilter('sq'); return;
};
ACT['reset-filter']=(b,p,e)=>{ state.filter='all'; state.q=''; state.per='all'; state.from=''; state.to=''; state.page=1; renderDash(); document.getElementById('sq').focus(); return;
};
VIEWS.dash=renderDash;
