/* 보안길잡이 AI | 화면 전용 코드: history.js */
'use strict';
/* ---------- history ---------- */
function histRows(){
  const tag=state.role==='sec'?'(정보보안)':'(ICT인프라)';
  const q=(state.hq||'').trim();
  return projects.flatMap(p=>p.history.filter(h=>h.who.includes(tag)).map(h=>({...h,p}))).filter(h=>!q||(h.p.name+h.p.id+h.what).includes(q)).sort((a,b)=>a.at<b.at?1:-1);
}
function renderHist(){
  const rows=histRows(), ttl=state.role==='sec'?'검토 이력':'처리 이력';
  $main.innerHTML=`<div class="page-head"><div><h1>${ttl}</h1></div>
    ${dlNS&&rows.length?`<button type="button" class="btn" data-act="csv-hist">조회 결과 다운로드 (CSV)</button>`:''}</div>
  <div class="toolbar"><div class="search" role="search"><label for="hq" class="sr-only">사업명·신청번호·내용 검색</label><input id="hq" class="input" type="search" placeholder="사업명·신청번호·내용 검색" value="${esc(state.hq||'')}"><button type="button" class="sbtn" data-act="hsearch" aria-label="검색">${I.search}</button></div></div>
  <p class="filter-state" role="status">기록 ${rows.length}건${state.hq?` <button type="button" class="btn btn-tertiary btn-sm" data-act="hreset">검색 초기화</button>`:''}</p>
  ${rows.length?`<div class="tbl-wrap"><table class="tbl"><caption class="sr-only">${ttl}</caption><thead><tr><th scope="col">일시</th><th scope="col">신청</th><th scope="col">처리 내용</th><th scope="col">처리자</th></tr></thead>
    <tbody>${rows.map(h=>`<tr><td>${esc(h.at)}</td><td><div class="p-id">${h.p.id}</div><a href="request-detail.html?id=${h.p.id}">${esc(h.p.name)}</a></td><td>${esc(h.what)}</td><td>${esc(h.who)}</td></tr>`).join('')}</tbody></table></div>`
    :`<div class="empty-box">${state.hq?'검색 결과가 없습니다. 검색어를 바꾸거나 초기화해 주세요.':'아직 기록이 없습니다.'}</div>`}`;
}
/* ---------- 화면 동작 ---------- */
ACT['csv-hist']=(b,p,e)=>{ saveFile((state.role==='sec'?'검토이력_':'처리이력_')+TODAY_STR+'.csv',csv([['일시','신청번호','사업명','처리 내용','처리자'],...histRows().map(h=>[h.at,h.p.id,h.p.name,h.what,h.who])])); return;
};
ACT['hsearch']=(b,p,e)=>{ state.hq=document.getElementById('hq').value; renderHist(); document.getElementById('hq').focus(); return;
};
ACT['hreset']=(b,p,e)=>{ state.hq=''; renderHist(); document.getElementById('hq').focus(); return;
};
VIEWS.hist=renderHist;
