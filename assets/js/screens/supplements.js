/* 보안길잡이 AI | 화면 전용 코드: supplements.js */
'use strict';
/* ---------- supplements ---------- */
function renderSupp(){
  const mine=scoped();
  const open=mine.filter(waitingUser);
  /* 페이지 전체에 답변할 요청이 하나뿐이면 그 등록 버튼을 주요 버튼으로 (한 화면 주요 버튼 1개 규칙) */
  const onlyOne=open.reduce((n,p)=>n+openSupps(p).length,0)===1;
  const done=mine.flatMap(p=>(p.supps||[]).filter(s=>s.reply).map(s=>({p,s})));
  $main.innerHTML=`<div class="page-head"><div><h1>보완 요청</h1></div></div>
  ${flashHTML()}
  <section aria-labelledby="so-h"><div class="sec-head" style="margin-top:0"><h2 class="h-sec" id="so-h">답변이 필요한 요청<span class="count">${open.reduce((n,p)=>n+openSupps(p).length,0)}</span></h2></div>
    ${open.length?open.map(p=>`<article class="card"><div class="card-h"><div><span class="p-id">${p.id}</span><h3 class="h-panel" style="margin:0"><a class="plain" href="request-detail.html?id=${p.id}">${esc(p.name)}</a></h3></div><span class="badge b-warning">보완 요청</span></div>
      ${openSupps(p).map(sp=>suppForm(p,sp,onlyOne)).join('')}</article>`).join(''):'<div class="empty-box">답변이 필요한 보완 요청이 없습니다.</div>'}</section>
  <section aria-labelledby="sd-h"><div class="sec-head"><h2 class="h-sec" id="sd-h">답변한 요청</h2></div>
    ${done.length?`<div class="tbl-wrap"><table class="tbl"><caption class="sr-only">답변한 보완 요청</caption><thead><tr><th scope="col">신청</th><th scope="col">요청 항목</th><th scope="col">요청 분야</th><th scope="col">답변</th><th scope="col">답변 일시</th></tr></thead>
      <tbody>${done.map(({p,s})=>`<tr><td><div class="p-id">${p.id}</div><a href="request-detail.html?id=${p.id}">${esc(p.name)}</a></td><td>${esc(s.item)}</td><td>${esc(s.from)}</td><td>${esc(s.reply)}</td><td>${esc(s.replyAt||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-box">아직 답변한 요청이 없습니다.</div>'}</section>`;
}

VIEWS.supp=renderSupp;
