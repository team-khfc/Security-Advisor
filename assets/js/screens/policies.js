/* 보안길잡이 AI | 화면 전용 코드: policies.js */
'use strict';
function renderPolicy(){
  const rows=policies.map(p=>({...p,s:policyStatus(p)}));
  const live=rows.filter(r=>!r.retired);
  const soon=live.filter(r=>r.s.left>=0&&r.s.left<=published.warnDays).length;
  const exp=live.filter(r=>r.s.left<0).length;
  const idle=live.filter(r=>r.s.idle>=published.idleDays).length;
  let list=rows;
  if(state.pfilter==='attention') list=live.filter(r=>r.s.attention);
  if(state.pfilter==='retire') list=rows.filter(r=>r.retire||r.retired);
  const pills=[['all','전체'],['attention','정리 필요'],['retire','회수 예정·완료']];
  $main.innerHTML=`
  <div class="page-head"><div><h1>정책 수명주기</h1></div></div>
  ${flashHTML()}
  <section aria-labelledby="ps-h"><h2 id="ps-h" class="sr-only">요약</h2><div class="stats">
    ${[['관리 중인 정책',live.length,'회수 완료 제외',I.doc],[`${published.warnDays}일 안에 만료`,soon,'연장 여부 확인 필요',I.clock],['만료 후 남은 정책',exp,'회수 처리 필요',I.warn],[`${published.idleDays}일 넘게 미사용`,idle,'회수 후보',I.users]]
      .map(([l,n,d,ic],i)=>`<button type="button" class="stat" data-act="pf" data-k="${i?'attention':'all'}" aria-pressed="false"><span class="stat-l">${ic}<span>${l}</span></span><span class="stat-num">${n}<small>건</small></span></button>`).join('')}
  </div></section>
  <div class="sec-head"><h2 class="h-sec" id="pl-h">정책 목록</h2></div>
  <div class="toolbar"><div class="pills" role="group" aria-label="정책 거르기">${pills.map(([k,l])=>`<button type="button" class="pill" data-act="pf" data-k="${k}" aria-pressed="${state.pfilter===k}">${l}</button>`).join('')}</div></div>
  <p class="filter-state" role="status">${pills.find(x=>x[0]===state.pfilter)[1]} 결과 ${list.length}건</p>
  ${list.length?`<div class="tbl-wrap"><table class="tbl"><caption class="sr-only">방화벽 정책 목록</caption>
    <thead><tr><th scope="col">정책</th><th scope="col">신청자</th><th scope="col">출발지</th><th scope="col">목적지</th><th scope="col">포트</th><th scope="col">만료일</th><th scope="col">최근 30일 트래픽</th><th scope="col">상태</th><th scope="col">처리</th></tr></thead>
    <tbody>${list.map(r=>`<tr><td><div class="p-id">${r.id}</div><div class="p-name">${esc(r.name)}</div>${r.fresh?'<span class="badge b-info">새로 등록</span>':''}</td>
      <td class="nowrap">${esc(r.owner)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td><td>${esc(r.port)}</td><td>${dot(r.exp)}</td>
      <td class="num">${r.hits?`${r.hits.toLocaleString('ko-KR')}건`:'<span class="help">없음</span>'}<div class="meta">마지막 ${dot(r.last)}</div></td>
      <td>${r.retired?'<span class="badge b-neutral">회수 완료</span>':r.s.tags.map(([c,t])=>`<span class="badge ${c}">${t}</span>`).join(' ')}</td>
      <td>${policyAction(r)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-box">이 조건에 해당하는 정책이 없습니다.</div>'}`;
}
function policyAction(r){
  if(r.retired) return '';
  if(r.s.left<0||r.retire) return `<button type="button" class="btn btn-sm" data-act="pa" data-k="retire" data-id="${r.id}">회수 완료 기록</button>`;
  const b=[];
  if(r.s.left<=published.warnDays) b.push(r.asked?'<span class="badge b-info">연장 여부 문의함</span>':`<button type="button" class="btn btn-sm" data-act="pa" data-k="ask" data-id="${r.id}">연장 여부 묻기</button>`);
  if(r.s.idle>=published.idleDays) b.push(`<button type="button" class="btn btn-sm btn-tertiary" data-act="pa" data-k="mark" data-id="${r.id}">회수 예정으로 표시</button>`);
  return `<div class="btn-row">${b.join('')}</div>`||'';
}

/* ---------- 화면 동작 ---------- */
ACT['pf']=(b,p,e)=>{ state.pfilter=b.dataset.k; renderPolicy(); return;
};
ACT['pa']=(b,p,e)=>{ {const r=policies.find(x=>x.id===b.dataset.id);
      if(b.dataset.k==='ask'){r.asked=true;toast(`${r.owner}님에게 연장 여부를 묻는 알림을 보냈습니다.`);}
      if(b.dataset.k==='mark'){r.retire=true;toast('회수 예정으로 표시했습니다.');}
      if(b.dataset.k==='retire'){r.retired=true;toast('회수 완료를 기록했습니다. 실제 삭제 여부는 방화벽 작업 기록에서 확인해 주세요.');}
      renderPolicy(); return;}
};
VIEWS.policy=renderPolicy;
