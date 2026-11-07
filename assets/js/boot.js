/* 보안길잡이 AI | 시작: 저장된 데이터를 불러오고 현재 페이지를 그립니다. 항상 마지막에 불러옵니다. */
'use strict';
/* ---------- 시작 ---------- */
restore();
try{ const f=sessionStorage.getItem('sf-flash'); if(f){ state.flash=JSON.parse(f); state.keepFlash=true; sessionStorage.removeItem('sf-flash'); } }catch(e){}
if(document.body.dataset.view==='chat'&&typeof newChat==='function'){
  const r=new URLSearchParams(location.search).get('resume');
  newChat(r?(projects.find(p=>p.id===r)||null):null);
}
if(window.claude&&typeof window.claude.use==='function'){
  window.claude.use('downloads').then(ns=>{ if(ns){dlNS=ns; route(false);} }).catch(()=>{});
}
route(false);
