/* 보안길잡이 AI | 여러 화면이 함께 쓰는 부품: 문서 카드·미리보기, 보완 요청 카드, 데이터 흐름도, 작성 중 삭제. */
'use strict';
function docCheckState(m,ai){
  const parts=[m&&`미확정 ${m}개`,ai&&`AI 추론 미확인 ${ai}개`].filter(Boolean);
  return parts.length?`<span class="need-txt">${parts.join(', ')}</span>`:'모든 값 확인됨';
}
function suppForm(p,sp,primary){
  const fid=`sr-${p.id}-${sp.id}`;
  return `<div class="supp"><div class="supp-h"><b>${esc(sp.item)}</b><span class="badge b-warning">답변 필요</span></div>
    <p style="margin:.4rem 0">${esc(sp.text)}</p><p class="meta" style="margin:0 0 1.2rem">요청: ${esc(sp.from)} ${esc(sp.at)}, 작성: 신청자</p>
    <div class="field"><label for="${fid}">보완 답변<span class="req">필수</span></label><textarea id="${fid}" class="input" aria-describedby="${fid}-e"></textarea><p class="ferr" id="${fid}-e" hidden></p></div>
    <button type="button" class="btn ${primary?'btn-primary':''}" data-act="supp-reply" data-id="${p.id}" data-sid="${sp.id}">보완 답변 등록</button></div>`;
}
function suppReply(p,sid){
  const sp=p.supps.find(x=>x.id===+sid), fid=`sr-${p.id}-${sp.id}`, el=document.getElementById(fid), v=el.value.trim();
  if(!v){el.setAttribute('aria-invalid','true');const m=document.getElementById(fid+'-e');m.hidden=false;m.textContent='보완 답변을 입력해 주세요.';el.focus();return;}
  sp.reply=v; sp.replyAt=nowStamp(); p.updated=TODAY_STR;
  p.history.push(H(sp.replyAt,ROLE_TAG.user,`보완 답변 등록: ${sp.item}`));
  state.flash={kind:'success',text:openSupps(p).length?`답변을 등록했습니다. 남은 보완 요청이 ${openSupps(p).length}건 있습니다.`:`보완 답변을 등록했습니다. ${sp.from} 담당자가 다시 검토합니다.`};
  state.keepFlash=true; route(true);
}
function deleteDraft(id){
  const p=id&&projects.find(x=>x.id===id);
  if(p&&p.stage!==0) return;
  const nm=p?p.name:(chat.name||'새 신청');
  openDialog('작성 중인 신청을 삭제할까요?',`<p style="margin-top:0">‘${esc(nm)}’${p?`(${p.id})`:''}의 답변과 문서 분석 결과가 모두 삭제되며 되돌릴 수 없습니다.</p>`,
    [{label:'취소',cls:'btn-tertiary'},{label:'삭제',cls:'btn-danger',fn:()=>{
      if(p) projects.splice(projects.indexOf(p),1);
      const hasChat=typeof chat!=='undefined'&&chat; if(hasChat&&(!p||chat.pid===p.id)) newChat(null);
      state.flash={kind:'success',text:`작성 중인 신청 ‘${nm}’을(를) 삭제했습니다.`}; state.keepFlash=true;
      if(state.view==='chat'){ renderShell(); renderChat(); const h=$main.querySelector('h1'); if(h){h.setAttribute('tabindex','-1');h.focus();} }
      else go('requests'); }}]);
}

/* ---------- documents ---------- */
function docKind(p){ if(p.stage===0) return null; return p.stage>=3?{label:`제출본 v${p.rev||1}`,final:true}:{label:'검토 초안 v1',final:false}; }
function genDoc(p){
  const c=cfgOf(p), k=docKind(p), fm=c.formMap;
  const L=[];
  L.push(`[방화벽 정책 신청서] ${k?k.label:'작성 중'}`);
  L.push(`기관 양식: ${c.formFile} / 적용 설정 v${p.ver}`);
  L.push(`신청번호: ${p.id}`, `사업명: ${p.name}`, `신청 부서·신청자: ${p.dept} ${p.requester}`);
  L.push(`사업 목적: ${p.purpose||'미입력'}`, `이용 대상: ${p.audience||'답변 필요'}`, `개인정보: ${p.pii?'포함 (정보보안 검토 대상)':'포함되지 않음'}`, `운영 기간: ${p.period||'담당자 확인 필요'}`);
  c.qs.filter(q=>q.on&&q.role!=='user').forEach(q=>L.push(`${q.label}: ${(p.extra||{})[q.key]||'미입력'}`));
  L.push('', '--- 방화벽 규칙 ---');
  p.rules.forEach((r,i)=>{L.push(`${i+1}.`);fm.forEach(m=>L.push(`   ${m.label}: ${r[m.k]==null?'담당자 확인 필요':r[m.k]}`));});
  if(!p.rules.length) L.push('(아직 만들어진 규칙이 없습니다)');
  if((p.supps||[]).length){L.push('','--- 보완 요청과 답변 ---');p.supps.forEach(s=>L.push(`- [${s.from}] ${s.item}: ${s.text}`,`  답변: ${s.reply||'답변 전'}`));}
  const m=missingCount(p); L.push('', `미확정 항목: ${m}개`);
  if(p.submittedAt) L.push(`제출 일시: ${p.submittedAt} (한국 시간)`);
  return L.join('\n');
}
const bytes=t=>new TextEncoder().encode(t).length;
const sizeLbl=n=>n>1024?(n/1024).toFixed(1)+'KB':n+'B';
let dlNS=null;
/* 일반 웹 호스팅에서는 브라우저 다운로드로 저장합니다 (Claude 아티팩트에서는 boot.js가 교체) */
if(!(window.claude&&typeof window.claude.use==='function')){
  dlNS={save:async({filename,data})=>{const blob=new Blob([data],{type:/\.csv$/.test(filename)?'text/csv;charset=utf-8':'text/plain;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);return {status:'saved'};}};
}
async function saveFile(name,text){
  if(!dlNS){toast('이 화면에서는 파일 저장을 지원하지 않습니다.');return;}
  try{await dlNS.save({filename:name,data:text});toast(`${name} 저장을 요청했습니다.`);}
  catch(e){ if(e&&e.code==='declined') return; if(e&&e.code==='rate_limited'){toast('저장 창이 이미 열려 있습니다. 잠시 뒤 다시 시도해 주세요.');return;} toast('파일을 저장하지 못했습니다. 다시 시도해 주세요.'); }
}
function docCard(p,inDetail){
  const k=docKind(p);
  if(!k) return '<p class="help" style="margin:0">인터뷰를 마치면 검토 초안이 만들어집니다.</p>';
  const t=genDoc(p), m=missingCount(p);
  return `<div class="doc ${inDetail?'in':''}"><div class="doc-h"><span class="badge ${k.final?'b-info':'b-neutral'}">${k.label}</span>${inDetail?'':`<span class="p-id">${p.id}</span>`}</div>
    <h3 class="doc-t">${inDetail?'방화벽 정책 신청서':esc(p.name)}</h3>
    <dl class="doc-dl"><div><dt>적용 설정</dt><dd>v${p.ver}</dd></div><div><dt>확인 상태</dt><dd>${docCheckState(m,aiPending(p))}</dd></div><div><dt>문서 형식</dt><dd>TXT, ${sizeLbl(bytes(t))}</dd></div></dl>
    ${k.final?`<p class="help" style="margin:0 0 1.2rem">${esc(p.submittedAt||'')} 제출, 읽기 전용</p>`:''}
    <div class="btn-row"><button type="button" class="btn btn-sm" data-act="doc-preview" data-id="${p.id}">문서 미리보기</button>
      ${dlNS?`<button type="button" class="btn btn-sm btn-tertiary" data-act="doc-dl" data-id="${p.id}">TXT 다운로드 (${sizeLbl(bytes(t))})</button>`:''}
      ${inDetail?'':`<a class="link-more" href="request-detail.html?id=${p.id}">${I.chev}<span>협의 내용과 근거</span></a>`}</div></div>`;
}
function previewDoc(p){
  const k=docKind(p)||{label:'초안'};
  openDialog(`${p.name} ${k.label} 미리보기`,`<pre class="docpre" tabindex="0" aria-label="문서 내용">${esc(genDoc(p))}</pre>`,
    [dlNS?{label:'TXT 다운로드',cls:'btn-tertiary',fn:()=>{saveFile(`${p.id}_${k.label.replace(/\s/g,'')}.txt`,genDoc(p));return false;}}:null,{label:'닫기',cls:'btn'}].filter(Boolean));
}
const csv=rows=>'\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
/* data flow diagram */
const ZONES=['외부','DMZ','내부망'];
function zoneOf(n){ if(/DMZ/.test(n)) return 1; if(/인터넷|외부|포털|중계사|인증 기관|본인인증|유지보수 업체|SSL-VPN/.test(n)) return 0; return 2; }
function splitName(n){ const m=n.match(/^(.*?)(\(.*\))$/); if(m) return [m[1],m[2]]; if(n.length<=7) return [n]; const sp=n.lastIndexOf(' ',Math.ceil(n.length/2)+1); return sp>0?[n.slice(0,sp),n.slice(sp+1)]:[n]; }
function flowSVG(rules,o){
  if(!rules.length) return '';
  const colW=o.w/3, pad=10, bw=colW-pad*2-8, bh=o.ip?54:42, top=34, gapY=o.ip?72:60, fs=o.w>400?13:11;
  const nodes=[], byName={};
  const add=(name,ip)=>{ if(!byName[name]){const z=zoneOf(name);const row=nodes.filter(n=>n.z===z).length;byName[name]={name,z,row,ip:null};nodes.push(byName[name]);} if(ip&&!byName[name].ip) byName[name].ip=ip; return byName[name]; };
  rules.forEach(r=>{add(r.from,r.fromIp);add(r.to,r.toIp);});
  /* 노드가 없는 구역(외부·DMZ·내부망)은 그리지 않고, 남은 구역만 왼쪽부터 순서대로 배치 */
  const used=[0,1,2].filter(z=>nodes.some(n=>n.z===z)), W=colW*used.length;
  nodes.forEach(n=>{n.c=used.indexOf(n.z);n.x=n.c*colW+pad;n.y=top+n.row*gapY;n.cy=n.y+bh/2;});
  const rows=Math.max(...used.map(z=>nodes.filter(n=>n.z===z).length),1);
  const H=top+rows*gapY-(gapY-bh)+12;
  const zf=['var(--sf-background)','var(--sf-warning-soft)','var(--sf-primary-soft)'];
  let g='';
  used.forEach((i,c)=>{const z=ZONES[i];g+=`<rect x="${c*colW+2}" y="2" width="${colW-4}" height="${H-4}" rx="8" fill="${zf[i]}"/><text x="${c*colW+colW/2}" y="22" text-anchor="middle" font-size="${fs}" font-weight="700" fill="var(--sf-muted)">${z}</text>`;});
  let e='', badges='', same=0;
  const sideOf=(n,other)=>n.z===other.z?'R':(n.z<other.z?'R':'L');
  const ports={}, ends=rules.map((r,i)=>{const a=byName[r.from],b=byName[r.to];const ka=r.from+'|'+sideOf(a,b), kb=r.to+'|'+sideOf(b,a);(ports[ka]=ports[ka]||[]).push(i+'a');(ports[kb]=ports[kb]||[]).push(i+'b');return [ka,kb];});
  const yAt=(n,key,tag)=>{const l=ports[key],k=l.indexOf(tag),m=l.length;const step=Math.min(10,(bh-12)/Math.max(1,m-1));return n.cy+(k-(m-1)/2)*(m>1?step:0);};
  rules.forEach((r,i)=>{
    const a=byName[r.from], b=byName[r.to], dash=/VPN/.test(r.dir)?' stroke-dasharray="5 4"':'';
    const ya=yAt(a,ends[i][0],i+'a'), yb=yAt(b,ends[i][1],i+'b');
    let d, mx, my;
    if(a.z===b.z){ const off=8+(same++%3)*4, x=a.x+bw; d=`M${x} ${ya} H${x+off} V${yb} H${x+3}`; mx=x+off; my=(ya+yb)/2; }
    else if(a.z<b.z){ const x1=a.x+bw, x2=b.x-3; d=`M${x1} ${ya} C${(x1+x2)/2} ${ya} ${(x1+x2)/2} ${yb} ${x2} ${yb}`; mx=(x1+x2)/2; my=(ya+yb)/2; }
    else { const x1=a.x, x2=b.x+bw+3; d=`M${x1} ${ya} C${(x1+x2)/2} ${ya} ${(x1+x2)/2} ${yb} ${x2} ${yb}`; mx=(x1+x2)/2; my=(ya+yb)/2; }
    e+=`<path d="${d}" fill="none" stroke="var(--sf-primary)" stroke-width="1.6"${dash} marker-end="url(#ar-${o.id})"><title>${i+1}. ${esc(r.biz)}: TCP ${esc(r.port||'포트 확인 필요')}</title></path>`;
    badges+=`<g><circle cx="${mx}" cy="${my}" r="${fs*0.82}" fill="var(--sf-primary)"/><text x="${mx}" y="${my+fs*0.36}" text-anchor="middle" font-size="${fs-1}" font-weight="700" fill="var(--sf-on-primary)">${i+1}</text></g>`;
  });
  let nd='';
  nodes.forEach(n=>{ const ls=splitName(n.name); const lines=ls.length+(o.ip?1:0); const y0=n.cy-((lines-1)*(fs+2))/2+fs*0.35;
    nd+=`<rect x="${n.x}" y="${n.y}" width="${bw}" height="${bh}" rx="6" fill="var(--sf-surface)" stroke="var(--sf-border-strong)"/>`;
    ls.forEach((t,k)=>{nd+=`<text x="${n.x+bw/2}" y="${y0+k*(fs+2)}" text-anchor="middle" font-size="${fs}" fill="var(--sf-text)">${esc(t)}</text>`;});
    if(o.ip) nd+=`<text x="${n.x+bw/2}" y="${y0+ls.length*(fs+2)}" text-anchor="middle" font-size="${fs-2}" fill="${n.ip?'var(--sf-muted)':'var(--sf-warning-text)'}">${esc(n.ip||'주소 확인 필요')}</text>`;
  });
  const desc=rules.map((r,i)=>`${i+1}번 ${r.from}에서 ${r.to}로 TCP ${r.port||'포트 확인 필요'}, ${r.dir}`).join('. ');
  return `<div class="flowbox"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-labelledby="ft-${o.id} fd-${o.id}" style="max-width:${W}px;font-family:inherit"><title id="ft-${o.id}">데이터 흐름도: 외부, DMZ, 내부망 구간별 연결 ${rules.length}개</title><desc id="fd-${o.id}">${esc(desc)}</desc>
    <defs><marker id="ar-${o.id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--sf-primary)"/></marker></defs>${g}${e}${nd}${badges}</svg>
    <p class="meta flow-legend"><span class="lg-line"></span>연결 <span class="lg-line dash"></span>VPN 경유 <span class="lg-num">1</span>규칙 번호</p></div>`;
}

/* ---------- 화면 동작 ---------- */
ACT['resume']=(b,p,e)=>{ persist(); location.href='new-request.html?resume='+encodeURIComponent(p.id); };
ACT['supp-reply']=(b,p,e)=>{ suppReply(p,b.dataset.sid); return;
};
ACT['doc-preview']=(b,p,e)=>{ previewDoc(p); return;
};
ACT['doc-dl']=(b,p,e)=>{ {const k=docKind(p); saveFile(`${p.id}_${k.label.replace(/\s/g,'')}.txt`,genDoc(p)); return;}
};
ACT['del-draft']=(b,p,e)=>{ deleteDraft(b.dataset.id||(typeof chat!=='undefined'&&chat?chat.pid:null)); };
