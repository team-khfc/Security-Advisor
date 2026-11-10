import {readFile,writeFile} from 'node:fs/promises';
import {client,password,waitForApp} from './client.mjs';
const stateFile='/state/scenarios.json';
const accounts=[
  ['an.dw','안대웅','유동화자산처','APPLICANT'],
  ['park.sy','박소영','주택연금처','APPLICANT'],
  ['jung.ys','정용석','정보보호처','SECURITY'],
  ['kim.dh','김도헌','ICT인프라실','INFRA'],
  ['moon.sw','문성욱','ICT운영실','ADMIN'],
];
await waitForApp();
let existing;
try {existing=JSON.parse(await readFile(stateFile,'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e;}
if(existing?.complete) { console.log('시연 데이터가 이미 준비되어 있습니다. 기존 입력을 보존합니다.'); process.exit(0); }
if(existing) throw new Error('초기화가 중간에 실패한 볼륨입니다. README의 시연 환경 초기화 절차를 확인하세요.');
const admin=await client('admin');
const members=await admin('GET','/api/members');
if(members.some(m=>accounts.some(a=>a[0]===m.username))) throw new Error('시연 계정이 이미 존재합니다. 빈 시연 DB에서만 초기화할 수 있습니다.');
const manifest={version:1,complete:false,scenarios:[],createdAt:new Date().toISOString()};
await writeFile(stateFile,JSON.stringify(manifest,null,2));
for(const [username,displayName,department,role] of accounts) {
  await admin('POST','/api/members',{username,password,displayName,department});
  if(role!=='APPLICANT') await admin('POST',`/api/members/${username}/role-assignments`,{role,active:true,reason:'심사용 시연 계정 등록'});
  if(role==='INFRA'||role==='SECURITY') await admin('POST','/api/reviewer-pools',{field:role,memberUsername:username,defaultReviewer:true});
}
const ownerA=await client('an.dw'), ownerB=await client('park.sy');
const infra=await client('kim.dh'), security=await client('jung.ys');
const publication=await ownerA('GET','/api/publications/current');
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()), end=`${Number(date.slice(0,4))+1}${date.slice(4)}`;
const values={
 'project.period':`${date} ~ ${end}`,'data.personal_info':'아니요','system.external_transfer':'아니요',
 'firewall.protocol':'TCP','firewall.port':'443','firewall.period':`${date} ~ ${end}`,
 'firewall.purpose':'합성 업무 시스템의 암호화 API 통신',
 'review.access_control':'부서별 최소 권한과 관리자 다중 인증을 적용하는 합성 계획',
 'review.logging':'접속·권한 변경 기록을 1년 보관하는 합성 계획',
 'review.encryption':'TLS 전송 암호화와 저장 데이터 암호화 적용 예정',
};
const scenarios=[
 ['01','유동화 업무 지원 포털','DRAFT','FIREWALL'],
 ['02','주택연금 상담 예약 개선','DRAFT','SECURITY_REVIEW'],
 ['03','유동화 자료 전송 서비스','REVIEW','FIREWALL'],
 ['04','주택연금 안내 서비스','SECURITY_WAIT','SECURITY_REVIEW'],
 ['05','유동화 통계 대시보드','SUPPLEMENT','FIREWALL'],
 ['06','주택연금 비대면 상담','FINAL_REVIEW','SECURITY_REVIEW'],
 ['07','유동화 정산 연계','SUBMITTED','FIREWALL'],
 ['08','주택연금 운영 모니터링','CONFIRMED','FIREWALL'],
 ['09','유동화 대외 연계','APPLIED','FIREWALL'],
 ['10','주택연금 시험 연계','NOT_APPLICABLE','FIREWALL'],
 ['11','유동화 임시 연계 종료','REVOKED','FIREWALL'],
 ['12','주택연금 사업 범위 조정','RETURNED','SECURITY_REVIEW'],
 ['13','유동화 중복 신청 취소','WITHDRAWN','FIREWALL'],
 ['14','주택연금 공동 서류 작성','MULTI','FIREWALL'],
];
async function completeReview(who,review,checklist) {
 const current=await who('GET',`/api/reviews/${review.reviewId}`);
 await who('PUT',`/api/reviews/${review.reviewId}/completion`,{expectedRevision:current.revision,opinion:'시연 자료에 근거하여 검토했습니다. 실제 기관 구성·장비와 무관합니다.',checklist});
}
const infraChecks={source:true,destination:true,protocol:true,port:true,period:true};
const securityChecks={processed_info:true,external_transfer:true,access_control:true,logging:true};
for(let index=0;index<scenarios.length;index++) {
 const [code,name,target,type]=scenarios[index], owner=index%2===0?ownerA:ownerB;
 const account=accounts[index%2], title=`[시연 ${code}] ${name}`;
 const c=await owner('POST','/api/business-cases',{title,summary:`${name}을 위한 합성 사업입니다. 실제 고객·계약·기관 내부 정보는 포함하지 않습니다. 문서 작성과 담당자 협의 절차를 시연합니다.`,department:account[2],docTypes:target==='MULTI'?['FIREWALL','SECURITY_REVIEW']:[type]});
 const id=c.requests[0].securityRequestId, path=`/api/security-requests/${id}`;
 const item={code,title,target,owner:account[0],caseId:c.businessCaseId,requestId:id,requestIds:c.requests.map(r=>r.securityRequestId)};
 console.log(`${code}: ${target} 준비`);
 if(target==='WITHDRAWN') {
   const request=await owner('GET',path);
   await owner('PUT',path+'/withdrawal',{reason:'시연: 사업 중복으로 신청 철회',expectedRevision:request.revision});
 } else if(!['DRAFT','MULTI'].includes(target)) {
   for(const field of publication.fieldSchema.fields.filter(f=>f.askRole==='APPLICANT'&&f.docTypes.includes(type)&&values[f.key]!==undefined)) {
     const base=field.scope==='CASE'?`/api/business-cases/${c.businessCaseId}`:path;
     const detail=await owner('GET',base), old=(detail.answers ?? detail.caseAnswers).find(a=>a.fieldKey===field.key);
     await owner('PUT',`${base}/answers/${field.key}`,{value:values[field.key],...(old?{expectedRevision:old.revision}:{})});
   }
   const request=await owner('GET',path);
   const reviews=(await owner('POST',path+'/reviews',{expectedRevision:request.revision})).reviews;
   const ir=reviews.find(r=>r.field==='INFRA'), sr=reviews.find(r=>r.field==='SECURITY');
   if(target==='SUPPLEMENT') {
     const r=await infra('GET',`/api/reviews/${ir.reviewId}`);
     await infra('POST',`/api/reviews/${ir.reviewId}/supplements`,{fieldKeys:['project.summary'],reason:'시연: 연계 데이터의 범위와 업무 목적을 조금 더 설명해 주세요.',expectedRevision:r.revision});
   } else if(target!=='REVIEW') {
     const business=await infra('GET',`/api/business-cases/${c.businessCaseId}`), req=await infra('GET',path);
     const revisions=Object.fromEntries([...business.caseAnswers,...req.answers].map(a=>[a.fieldKey,a.revision]));
     const server=(id,name,address,zone)=>({id,name,purpose:'합성 업무 처리',environment:'가상',cpu:'4 vCPU',memory:'8 GB',storage:'100 GB',os:'Linux',database:'미해당',address,zone,aiInferred:false,aiConfirmed:false,evidence:{}});
     await infra('PUT',path+'/infrastructure-plan',{
       expectedRevision:0,schemaVersion:2,draft:false,aiPending:false,answerRevisions:revisions,
       servers:[server('web','시연 웹 서버','192.0.2.10','DMZ'),server('api','시연 API 서버','198.51.100.20','내부망')],
       connections:[{id:'web-api',sourceServerId:'web',destinationServerId:'api',sourceSystem:'',sourceAddress:'',sourceZone:'',destinationSystem:'',destinationAddress:'',destinationZone:'',protocol:'TCP',port:'443',purpose:values['firewall.purpose'],direction:'아웃바운드',startDate:date,endDate:end}],
       operations:{network:'합성 DMZ와 내부망 분리',management:'관리 전용 접근과 다중 인증',owner:'합성 운영 조직',backup:'매일 백업, 월간 복구 점검'},
       checklist:{serverEnvironment:true,network:true,management:true,operations:true},notes:'문서용 예약 IP를 사용한 시연 구성입니다. 실제 장비를 변경하지 않습니다.'
     });
     await completeReview(infra,ir,infraChecks);
     if(target!=='SECURITY_WAIT') {
       const confirmationKey=type==='SECURITY_REVIEW'?'review.access_control':'firewall.purpose';
       const securityAnswer=(await security('GET',path)).answers.find(a=>a.fieldKey===confirmationKey);
       await security('PUT',`/api/reviews/${sr.reviewId}/answers/${confirmationKey}/confirmation`,{expectedRevision:securityAnswer.revision});
       await completeReview(security,sr,securityChecks);
       if(target==='RETURNED') {
         const r=await security('GET',path);
         await security('POST',path+'/stage-returns',{targetStage:2,reason:'시연: 사업 범위 변경에 따른 담당자 재협의',fieldKeys:['project.summary'],expectedRevision:r.revision});
       } else {
         if(process.env.LLM_MODE==='fake') {
           const comparison=await owner('GET',path+'/consultation-comparison');
           await owner('POST',path+'/consultation-summaries',{expectedFingerprint:comparison.fingerprint});
         }
         if(target!=='FINAL_REVIEW') {
           const r=await owner('GET',path);
           const text=`${title}\n\n합성 사업정보와 담당자 협의 결과를 검토했습니다. 웹 서버와 API 서버의 TCP 443 통신, 최소 권한, 로그 기록, 백업 계획을 확인했습니다. 실제 기관의 승인 문서가 아닌 시연 제출본입니다.`;
           const draft=await owner('POST',path+'/final-drafts',{text,expectedRevision:r.revision});
           await owner('PUT',`/api/final-drafts/${draft.finalDraftId}/confirmation`,{text,expectedRevision:draft.revision});
           const ready=await owner('GET',path);
           const sub=await owner('POST',path+'/submissions',{expectedRevision:ready.revision},{'Idempotency-Key':`judge-v1-${code}`});
           item.submissionId=sub.submissionId;
           const document=await owner('POST',path+'/generated-documents',{submissionId:sub.submissionId,aiSupplement:false});
           item.generatedDocumentId=document.generatedDocumentId;
           if(target!=='SUBMITTED') {
             for(const who of [infra,security]) {
               const r=await who('GET',path);
               await who('POST',`/api/submissions/${sub.submissionId}/final-confirmations`,{opinion:'시연 제출본 최종 확인',expectedRevision:r.revision});
             }
             const r=await security('GET',path);
             await security('PUT',`/api/submissions/${sub.submissionId}/confirmation`,{expectedRevision:r.revision});
             if(['APPLIED','NOT_APPLICABLE','REVOKED'].includes(target)) {
               const rules=await infra('GET',path+'/firewall-rules');
               for(const rule of rules) {
                 const updated=await infra('PUT',`/api/firewall-rules/${rule.firewallRuleId}/application`,{result:target==='NOT_APPLICABLE'?'NOT_APPLICABLE':'APPLIED',note:'시연용 적용 기록만 생성, 실제 장비 변경 없음',reason:target==='NOT_APPLICABLE'?'시연: 대상 서비스 도입 취소':null,expectedRevision:rule.revision});
                 if(target==='REVOKED') {
                   const latest=(await infra('GET',path+'/firewall-rules')).find(r=>r.firewallRuleId===rule.firewallRuleId);
                   await infra('PUT',`/api/firewall-rules/${rule.firewallRuleId}/revocation`,{reason:'시연: 임시 연계 종료, 실제 장비 변경 없음',expectedRevision:latest.revision});
                 }
               }
             }
           }
         }
       }
     }
   }
 }
 const result=await owner('GET',path); item.status=result.status; item.stage=result.stage;
 manifest.scenarios.push(item); await writeFile(stateFile,JSON.stringify(manifest,null,2));
}
const namedAdmin=await client('moon.sw');
// 원래 설치용 계정은 남겨 두되 로그인을 막고, 명시적으로 지정한 5개 계정만 사용한다.
for(const username of ['applicant','applicant2','security','infra','admin']) {
 await namedAdmin('PUT',`/api/members/${username}/activation`,{active:false,reason:'심사용 지정 계정으로 전환'});
}
manifest.complete=true;
await writeFile(stateFile,JSON.stringify(manifest,null,2));
console.log(`완료: 지정 계정 5개, 사업 ${manifest.scenarios.length}건. 실제 장비 변경 없음.`);



