/* 보안길잡이 AI | 화면 전용 코드: documents.js */
'use strict';
function renderDocs(){
  dqOpen=false;
  const scope=state.role==='user'?projects.filter(p=>p.requester==='김민지'):projects;
  const q=(state.dq||'').trim(), kind=state.dk||'all';
  let list=scope.filter(p=>docKind(p));
  if(kind!=='all') list=list.filter(p=>(docKind(p).final?'final':'draft')===kind);
  if(q) list=list.filter(p=>(p.name+p.id).includes(q));
  $main.innerHTML=`<div class="page-head"><div><h1>문서함</h1></div></div>
  ${flashHTML()}
  
  <div class="filter-box">
    <div class="field"><label for="dq">사업명·신청번호</label><div class="dq-wrap"><input id="dq" class="input" type="search" value="${esc(q)}" placeholder="입력하거나 두 번 눌러 목록에서 선택" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="dq-list" aria-autocomplete="list"><button type="button" class="btn btn-tertiary" id="dq-open" aria-expanded="false" aria-controls="dq-list">${state.role==='admin'?'사업 목록':'내 사업 목록'}</button><ul class="glist" id="dq-list" role="listbox" aria-label="${state.role==='admin'?'기관 전체 사업':'내가 진행한 사업'}" hidden></ul></div></div>
    <div class="field"><label for="dk">문서 구분</label><select id="dk" class="input"><option value="all" ${kind==='all'?'selected':''}>전체</option><option value="draft" ${kind==='draft'?'selected':''}>검토 초안</option><option value="final" ${kind==='final'?'selected':''}>제출본</option></select></div>
    <div class="btn-row"><button type="button" class="btn" data-act="doc-search">검색</button><button type="button" class="btn btn-tertiary" data-act="doc-reset">검색 초기화</button></div></div>
  <p class="filter-state" role="status">문서 ${list.length}건. 초안은 저장된 최신 내용으로 표시됩니다.</p>
  ${list.length?`<div class="docs">${list.map(p=>`<article class="card" style="margin:0">${docCard(p,false)}</article>`).join('')}</div>`:`<div class="empty-box">${q||kind!=='all'?'조건에 맞는 문서가 없습니다. 검색어나 문서 구분을 바꾸거나 초기화해 주세요.':'아직 만들어진 문서가 없습니다. 새 신청의 인터뷰를 마치면 검토 초안이 생깁니다.'}</div>`}`;
}

/* docs: my project picker */
let dqItems=[], dqIdx=-1, dqOpen=false;
function myProjects(){
  const r=state.role, tag={infra:'(ICT인프라)',sec:'(정보보안)'}[r];
  return projects.filter(p=>docKind(p)&&(r==='admin'||(r==='user'?p.requester==='김민지':(turns(p).includes(r)||p.history.some(h=>h.who.includes(tag))))));
}
function dqRender(){
  const inp=document.getElementById('dq'), list=document.getElementById('dq-list'); if(!inp) return;
  const t=inp.value.trim().toLowerCase();
  dqItems=myProjects().filter(p=>!t||(p.name+p.id).toLowerCase().includes(t)); dqIdx=dqItems.length?0:-1;
  list.innerHTML=`<li class="gh" role="presentation">${state.role==='admin'?'기관 전체 사업':'내가 진행한 사업'} ${dqItems.length}건</li>`+(dqItems.length?dqItems.map((p,i)=>`<li role="option" id="dqo-${i}" data-i="${i}" aria-selected="${i===dqIdx}"><span>${esc(p.name)}</span><span class="meta">${p.id}, ${docKind(p).label}, ${statusOf(p)[0]}</span></li>`).join(''):'<li class="gempty" role="presentation">입력한 내용과 맞는 사업이 없습니다.</li>');
  list.hidden=false; dqOpen=true;
  inp.setAttribute('aria-expanded','true'); document.getElementById('dq-open').setAttribute('aria-expanded','true');
  if(dqIdx>=0) inp.setAttribute('aria-activedescendant','dqo-'+dqIdx); else inp.removeAttribute('aria-activedescendant');
}
function dqClose(){
  dqOpen=false; const list=document.getElementById('dq-list'), inp=document.getElementById('dq'), b=document.getElementById('dq-open');
  if(list) list.hidden=true; if(inp){inp.setAttribute('aria-expanded','false');inp.removeAttribute('aria-activedescendant');} if(b) b.setAttribute('aria-expanded','false');
}
function dqMove(d){
  if(!dqItems.length) return; dqIdx=(dqIdx+d+dqItems.length)%dqItems.length;
  document.querySelectorAll('#dq-list [role=option]').forEach(o=>o.setAttribute('aria-selected',+o.dataset.i===dqIdx));
  document.getElementById('dq').setAttribute('aria-activedescendant','dqo-'+dqIdx);
  const o=document.getElementById('dqo-'+dqIdx); if(o&&o.scrollIntoView) o.scrollIntoView({block:'nearest'});
}
function dqPick(i){
  const p=dqItems[i]; if(!p) return; dqClose();
  state.dq=p.name; state.dk=document.getElementById('dk').value; renderDocs(); document.getElementById('dq').focus();
}
$main.addEventListener('dblclick',e=>{if(e.target.id==='dq') dqRender();});
$main.addEventListener('input',e=>{if(e.target.id==='dq') dqRender();});
$main.addEventListener('mousedown',e=>{if(e.target.closest('#dq-list')) e.preventDefault();});
$main.addEventListener('click',e=>{
  if(e.target.closest('#dq-open')){ if(dqOpen) dqClose(); else {dqRender();document.getElementById('dq').focus();} return; }
  const o=e.target.closest('#dq-list [role=option]'); if(o) dqPick(+o.dataset.i);
});
$main.addEventListener('keydown',e=>{
  if(e.target.id!=='dq'||e.isComposing||e.keyCode===229) return;
  if(e.key==='ArrowDown'){e.preventDefault(); if(dqOpen) dqMove(1); else dqRender();}
  else if(e.key==='ArrowUp'){e.preventDefault(); if(dqOpen) dqMove(-1);}
  else if(e.key==='Escape'&&dqOpen){e.preventDefault(); dqClose();}
});
document.addEventListener('click',e=>{if(dqOpen&&!e.target.closest('.dq-wrap')) dqClose();});
/* ---------- 화면 동작 ---------- */
ACT['doc-search']=(b,p,e)=>{ state.dq=document.getElementById('dq').value; state.dk=document.getElementById('dk').value; renderDocs(); document.getElementById('dq').focus(); return;
};
ACT['doc-reset']=(b,p,e)=>{ state.dq=''; state.dk='all'; renderDocs(); document.getElementById('dq').focus(); return;
};
VIEWS.docs=renderDocs;
