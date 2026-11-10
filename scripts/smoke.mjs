import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {client,origin} from './client.mjs';
const manifest=JSON.parse(await readFile('/state/scenarios.json','utf8'));
assert.equal(manifest.complete,true);
assert.equal(manifest.scenarios.length,14);
assert.equal((await fetch(origin+'/login')).status,200);
const roles={'an.dw':'APPLICANT','park.sy':'APPLICANT','jung.ys':'SECURITY','kim.dh':'INFRA','moon.sw':'ADMIN'};
const sessions={};
for(const [username,role] of Object.entries(roles)) {
 const call=await client(username);sessions[username]=call;
 const me=await call('GET','/api/auth/me');
 assert.equal(me.role,role);
 console.log(`PASS 로그인·역할: ${username} ${role}`);
}
const admin=sessions['moon.sw'];
const members=await admin('GET','/api/members');
assert.equal(members.filter(m=>m.active).length,5);
const expectedStatus={DRAFT:'DRAFTING',MULTI:'DRAFTING',REVIEW:'IN_REVIEW',SECURITY_WAIT:'IN_REVIEW',SUPPLEMENT:'SUPPLEMENT_REQUESTED',FINAL_REVIEW:'FINAL_REVIEW',SUBMITTED:'SUBMITTED',CONFIRMED:'CONFIRMED',APPLIED:'CONFIRMED',NOT_APPLICABLE:'CONFIRMED',REVOKED:'CONFIRMED',RETURNED:'IN_REVIEW',WITHDRAWN:'WITHDRAWN'};
for(const scenario of manifest.scenarios) {
 const call=sessions[scenario.owner];
 const r=await call('GET',`/api/security-requests/${scenario.requestId}`);
 assert.equal(r.status,expectedStatus[scenario.target]); assert.equal(r.stage,scenario.stage);
 if(['APPLIED','NOT_APPLICABLE','REVOKED'].includes(scenario.target)) {
   const rules=await sessions['kim.dh']('GET',`/api/security-requests/${scenario.requestId}/firewall-rules`);
   assert.ok(rules.length>0);assert.ok(rules.every(rule=>rule.status===scenario.target));
 }
 if(scenario.generatedDocumentId) {
   const pdf=await call('GET',`/api/generated-documents/${scenario.generatedDocumentId}/download?format=PDF`);
   assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 }
}
const another=manifest.scenarios.find(s=>s.owner==='park.sy');
await assert.rejects(()=>sessions['an.dw']('GET',`/api/security-requests/${another.requestId}`),e=>[403,404].includes(e.status));
const unassigned=manifest.scenarios.find(s=>s.target==='DRAFT');
await assert.rejects(()=>sessions['kim.dh']('GET',`/api/security-requests/${unassigned.requestId}`),e=>[403,404].includes(e.status));
console.log('PASS 단계별 신청·PDF·다른 신청자 및 미배정 담당자 접근 차단');
const final=manifest.scenarios.find(s=>s.target==='FINAL_REVIEW');
const comparison=await sessions[final.owner]('GET',`/api/security-requests/${final.requestId}/consultation-comparison`);
assert.equal(comparison.baselineAvailable,true);assert.ok(comparison.changes.length>0);
assert.ok(comparison.changes.some(change=>change.actorRole==='SECURITY'));
if(process.env.LLM_MODE==='fake') assert.ok(comparison.summary.items.length>0);
console.log('PASS 협의 기준본·담당자 변경 이력·요약');
const owner=sessions['an.dw'];
const c=await owner('POST','/api/business-cases',{title:`[자동 점검] 신청 생성 ${new Date().toISOString()}`,summary:'자동 smoke 검사용 합성 신청',department:'유동화자산처',docTypes:['FIREWALL']});
assert.ok(c.businessCaseId);
const loaded=await owner('GET',`/api/business-cases/${c.businessCaseId}`);
assert.equal(loaded.title,c.title);
const key='data.personal_info';
await assert.rejects(()=>owner('PUT',`/api/business-cases/${c.businessCaseId}/answers/${key}`,{value:'잘 모름'}),e=>e.status===422);
await owner('PUT',`/api/business-cases/${c.businessCaseId}/answers/${key}`,{value:'아니요'});
if(process.env.LLM_MODE==='fake') {
 const latest=await owner('GET',`/api/business-cases/${c.businessCaseId}`);
 const turn=await owner('POST',`/api/business-cases/${c.businessCaseId}/interview-turns`,{fieldKey:'project.summary',mode:'ASK',text:'이 사업을 어떻게 설명하면 좋을까요?',expectedRevision:latest.caseAnswers.find(a=>a.fieldKey==='project.summary').revision});
 assert.ok(turn);
}
const form=new FormData();
form.append('file',new Blob([await readFile('/demo/samples/01-유동화-사업기획서.txt')],{type:'text/plain'}),'합성-사업기획서.txt');
const file=await owner('POST',`/api/business-cases/${c.businessCaseId}/uploaded-files`,form);
assert.ok(file.uploadedFileId);
if(process.env.LLM_MODE==='fake') {
 const job=await owner('POST',`/api/business-cases/${c.businessCaseId}/analysis-jobs`,{uploadedFileId:file.uploadedFileId});
 let done=job;
 for(let i=0;i<30&&!['NEEDS_REVIEW','FAILED'].includes(done.status);i++) {
  await new Promise(r=>setTimeout(r,1000));done=await owner('GET',`/api/analysis-jobs/${job.analysisJobId}`);
 }
 assert.ok(done.status==='NEEDS_REVIEW',`analysis status: ${done.status}`);
}
const r=await owner('GET',`/api/security-requests/${c.requests[0].securityRequestId}`);
await owner('PUT',`/api/security-requests/${r.securityRequestId}/withdrawal`,{reason:'자동 점검 종료',expectedRevision:r.revision});
console.log('PASS 새 신청 생성·조회·문서 첨부·모의 분석·철회');
console.log('통합 smoke 검사 완료. 자동 점검 신청 1건이 철회 이력으로 남습니다.');

