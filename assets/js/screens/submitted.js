/* 보안길잡이 AI | 화면 전용 코드: submitted.js */
'use strict';
function renderSubmitted(){
  const p=projects.find(x=>x.id===state.id);
  $main.innerHTML=`<div class="page-head"><div><h1>신청서를 제출했습니다</h1></div></div>
  <section class="card" aria-labelledby="sb-h" style="max-width:88rem"><h2 class="h-panel" id="sb-h">제출 내용</h2>
    <dl class="dl"><dt>신청번호</dt><dd>${p.id}</dd><dt>사업명</dt><dd>${esc(p.name)}</dd><dt>제출 시각</dt><dd>${esc(p.submittedAt||'')}</dd>
    <dt>제출본</dt><dd>제출본 ${p.rev} (설정 v${p.ver} 기준)</dd><dt>다음 단계</dt><dd>4단계 확정·관리 (정보보안 담당자의 최종 검토)</dd></dl>
    <div class="btn-row" style="margin-top:2.4rem"><button type="button" class="btn btn-primary" data-act="doc-preview" data-id="${p.id}">제출본 확인</button><a class="btn" href="request-detail.html?id=${p.id}">신청 상세 보기</a><a class="btn btn-tertiary" href="requests.html">신청 현황으로</a></div></section>`;
}
VIEWS.submitted=renderSubmitted;
