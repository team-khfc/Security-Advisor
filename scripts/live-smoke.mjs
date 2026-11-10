import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {client} from './client.mjs';

// 외부 모델 호출 비용과 시연 데이터 변경이 있으므로 명시적으로 실행할 때만 동작한다.
if(process.env.LLM_MODE!=='live'||!process.argv.includes('--confirm-live'))
 throw new Error('LLM_MODE=live 및 --confirm-live가 필요합니다. 실제 모델을 호출하고 시연 자료를 저장합니다.');
const manifest=JSON.parse(await readFile('/state/scenarios.json','utf8'));
const draftCase=manifest.scenarios.find(s=>s.code==='01');
const finalCase=manifest.scenarios.find(s=>s.code==='06');
assert.ok(draftCase&&finalCase);
const applicant=await client('an.dw'), finalOwner=await client('park.sy');
const base=`/api/business-cases/${draftCase.caseId}`, request=`/api/security-requests/${finalCase.requestId}`;
assert.equal((await finalOwner('GET',request)).status,'FINAL_REVIEW','시연 06이 최종 검토 상태여야 합니다.');
function real(model){assert.ok(model&&!/fake|offline|mock/i.test(model),`실제 모델 응답이 아닙니다: ${model}`);}
function pass(step,model,detail){real(model);console.log(JSON.stringify({step,result:'PASS',model,...detail}));}

const step=process.argv.find(arg=>arg.startsWith('--step='))?.slice(7)??'all';
assert.ok(['all','summary','final'].includes(step));
if(step==='all') {
console.log('문서 분석 시작 (안대웅)');
const form=new FormData();
form.append('file',new Blob([await readFile('/demo/samples/01-유동화-사업기획서.txt')],{type:'text/plain'}),'실제AI검증-합성사업기획서.txt');
const file=await applicant('POST',base+'/uploaded-files',form);
let job=await applicant('POST',base+'/analysis-jobs',{uploadedFileId:file.uploadedFileId});
for(let i=0;i<180&&!['NEEDS_REVIEW','FAILED'].includes(job.status);i++) {
 await new Promise(r=>setTimeout(r,2000));job=await applicant('GET',`/api/analysis-jobs/${job.analysisJobId}`);
}
assert.equal(job.status,'NEEDS_REVIEW',job.errorMessage??job.status);assert.ok(job.summary?.length>20);
pass('문서 분석',job.modelReference,{analysisJobId:job.analysisJobId,summary:job.summary.slice(0,350)});

console.log('AI 인터뷰 시작 (안대웅)');
const current=await applicant('GET',base);
const turn=await applicant('POST',base+'/interview-turns',{
 fieldKey:'project.summary',mode:'ASK',text:'첨부한 합성 기획서에 근거해 사업 개요에 포함할 내용을 설명해 주세요. 자료에 없는 사실은 추정하지 마세요.',
 expectedRevision:current.caseAnswers.find(a=>a.fieldKey==='project.summary').revision
});
assert.ok(turn.reply?.length>20);
pass('AI 인터뷰',turn.modelReference,{interviewTurnId:turn.interviewTurnId,reply:turn.reply.slice(0,350),evidence:turn.evidence});
}

if(step!=='final') {
console.log('협의 결과 요약 시작 (박소영)');
const comparison=await finalOwner('GET',request+'/consultation-comparison');
const summary=await finalOwner('POST',request+'/consultation-summaries',{expectedFingerprint:comparison.fingerprint});
assert.ok(summary.items?.length>0);
const keys=new Set([...Object.keys(comparison.current),...Object.keys(comparison.baseline)]);
assert.ok(summary.items.every(i=>i.evidenceIds.length>0&&i.evidenceIds.every(k=>keys.has(k))));
pass('협의 결과 요약',summary.model,{itemCount:summary.items.length,firstItem:summary.items[0]});
}

if(step!=='summary') {
console.log('최종 초안 생성 시작 (박소영)');
const detail=await finalOwner('GET',request);
assert.equal(detail.status,'FINAL_REVIEW','시연 06이 최종 검토 상태여야 합니다.');
const finalDraft=await finalOwner('POST',request+'/final-draft-generations',{expectedRevision:detail.revision});
assert.equal(finalDraft.valueSource,'AI_INFERRED');assert.equal(finalDraft.confirmed,false);assert.ok(finalDraft.text?.length>20);
pass('최종 초안 생성',finalDraft.modelReference,{finalDraftId:finalDraft.finalDraftId,confirmed:finalDraft.confirmed,text:finalDraft.text.slice(0,350)});
}
console.log(`완료: ${step} 검증. 결과는 시연 01/06에 보존했습니다. 자동 확인·제출은 하지 않았습니다.`);
