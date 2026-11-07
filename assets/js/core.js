/* 보안길잡이 AI | 공통: 데이터, 상태, 머리글·메뉴, 알림, 검색, 대화상자, 저장. 모든 페이지가 먼저 불러옵니다. */
'use strict';
const TODAY_STR='2026-11-05';
const TODAY=new Date(TODAY_STR+'T00:00:00');
const DAY=864e5;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const dot=s=>String(s).replace(/-/g,'.');
const addMonths=n=>{const x=new Date(TODAY);x.setMonth(x.getMonth()+n);x.setDate(x.getDate()-1);return fmt(x);};
const clone=o=>JSON.parse(JSON.stringify(o));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const nowStamp=()=>{const d=new Date();return TODAY_STR+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};

/* ---------- icons ---------- */
const I={
  pencil:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  users:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M15.5 5.2a3 3 0 010 5.6M17.5 14.3c1.8.7 3 2.3 3.4 4.7"/></svg>',
  check:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  doc:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
  clock:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  arrow:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  chev:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  back:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  search:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  clip:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 11.5l-8.2 8.2a5 5 0 01-7-7l8.2-8.2a3.3 3.3 0 014.7 4.7l-8.2 8.2a1.7 1.7 0 01-2.4-2.4l7.6-7.6"/></svg>',
  okc:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.7"/></svg>',
  page:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  x:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  warn:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
  info:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>'
};

const NAVI={
  home:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  dash:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.7 1.1z"/></svg>',
  chat:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
  supp:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/></svg>',
  docs:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
  net:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="16" width="7" height="5" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/><path d="M6.5 8v8M6.5 12h11v4"/></svg>',
  hist:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 12a9 9 0 103-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  policy:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>',
  settings:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>'
};
/* ---------- static data ---------- */
const ROLES={
  user:{name:'신청자',person:'김민지',dept:'주택연금부'},
  infra:{name:'ICT인프라 담당',person:'박준호',dept:'정보인프라팀'},
  sec:{name:'정보보안 담당',person:'이서연',dept:'정보보호팀'},
  admin:{name:'기관 관리자',person:'정해원',dept:'디지털혁신실'}
};
const MENU={
  user:[['dash','신청 현황'],['chat','새 신청'],['supp','보완 요청'],['docs','문서함']],
  infra:[['dash','협의 요청함'],['net','통신 정보'],['hist','처리 이력'],['policy','정책 수명주기'],['docs','문서함']],
  sec:[['dash','협의 요청함'],['hist','검토 이력'],['policy','정책 수명주기'],['docs','문서함']],
  admin:[['dash','신청 현황'],['docs','문서함'],['settings','기관 설정']]
};
const PAGES={dash:'requests.html',chat:'new-request.html',supp:'supplements.html',docs:'documents.html',net:'network.html',hist:'history.html',policy:'policies.html',settings:'settings.html'};
const MENU_VIEWS=Object.keys(PAGES);
const VIEWS={};   /* 각 화면 파일이 VIEWS.이름=렌더함수 로 등록합니다 */
const ACT={};     /* 각 화면 파일이 ACT['동작']=(버튼,신청,이벤트)=>{} 로 등록합니다 */
/* 업무 4단계 이름 (FUNCTIONAL_SPEC 4단계 절차) */
const STAGES=['작성','담당자 협의','사용자 최종 검토','확정·관리'];

const QDEFS={
  purpose:{label:'사업 목적',title:'어떤 사업인가요?',help:'사업 목적을 한두 문장으로 적어 주세요. 신청서의 신청 사유로 들어갑니다.',type:'text',required:true},
  audience:{label:'이용 대상',title:'이 서비스는 누가 이용하나요?',help:'접속 경로에 따라 방화벽에서 열어야 할 구간이 달라집니다.',required:true,
    opts:[['국민 (인터넷으로 접속)',['국민','인터넷','고객','대국민','시민']],['직원 (기관 내부망)',['직원','내부망','사내']],['국민과 직원 모두',['모두','둘 다','둘다']]]},
  external:{label:'외부 연계',title:'외부 기관이나 서비스와 연결되나요?',help:'본인인증, 알림 발송처럼 기관 밖으로 나가는 연결이 있는지 확인합니다. AI는 기관 내부 LLM만 사용합니다.',required:true,
    opts:[['외부 연계 있음 (본인인증·알림 등)',['본인','인증','알림','연계 있']],['외부 연계 없음',['없','내부만']]]},
  data:{label:'개인정보 포함',title:'다루는 자료에 개인정보가 포함되나요?',help:'포함되면 정보보안 담당자가 개인정보 처리 기준을 함께 검토합니다.',
    opts:[['포함돼요',['포함','이름','연락처','주민','고객 정보']],['포함되지 않아요',['아니','없어','안 돼']]]},
  maint:{label:'유지보수 접속',title:'개발·유지보수 업체는 서버에 어떻게 접속하나요?',help:'기관 밖에서 접속하면 관리 경로를 SSL-VPN으로 제한하는지 확인합니다.',
    opts:[['기관 밖에서 원격으로',['원격','밖에서','재택']],['기관 안에서만',['안에서','상주','방문']]]},
  period:{label:'운영 기간',title:'언제까지 운영하나요?',help:'종료일이 없으면 상시 운영 여부를 알려 주세요. 방화벽 허용 기간을 정하는 데 사용합니다.',required:true,
    opts:[['시범운영 3개월',['3개월','시범','석 달']],['1년',['1년','12개월','일 년']],['상시 운영',['상시','계속','무기한']]]}
};
const QORDER=['purpose','audience','external','data','maint','period'];
const UNKNOWN_KEYS=['모름','모르','미정','글쎄'];
const unknownLabel=id=>id==='period'?'아직 미정 (담당자 확인 요청)':'잘 모름 (담당자 확인 요청)';

let published={
  version:1, publishedAt:'2026-10-27',
  order:'seq', head:false,
  guards:{noAny:true,maxYear:true,vpn:true,pii:true},
  warnDays:30, idleDays:90, slaDays:5,
  formFile:'방화벽 정책 신청서(2026).hwpx',
  formMap:[
    {k:'biz',std:'업무 설명',label:'신청 사유'},{k:'from',std:'출발지',label:'출발지 시스템'},{k:'fromIp',std:'출발지 IP',label:'출발지 주소'},
    {k:'to',std:'목적지',label:'목적지 시스템'},{k:'toIp',std:'목적지 IP',label:'목적지 주소'},{k:'port',std:'포트',label:'서비스 포트'},
    {k:'proto',std:'프로토콜',label:'프로토콜'},{k:'dir',std:'방향',label:'방향'}],
  docs:['정보보안 업무 지침 (2026.3 개정)','방화벽 정책 관리 세부기준','개인정보 처리시스템 접근통제 기준']
};
const QMETA={purpose:['최초 신청','장문형'],audience:['최초 신청','선택형'],external:['최초 신청','선택형'],data:['최초 신청','선택형'],maint:['사전 협의','선택형'],period:['최초 신청','선택형']};
published.qs=QORDER.map(k=>({key:k,builtin:true,role:'user',label:QDEFS[k].label,title:QDEFS[k].title,help:QDEFS[k].help,format:QMETA[k][1],when:QMETA[k][0],cond:'all',required:!!QDEFS[k].required,lockReq:!!QDEFS[k].required,on:true}));
published.qs.push({key:'server_spec',builtin:false,role:'infra',label:'서버 사양 (WEB)',title:'웹 서버의 사양과 운영체제를 적어 주세요.',help:'예: 4vCPU, 16GB 메모리, Rocky Linux 9',format:'단답형',when:'사전 협의',cond:'all',required:true,on:true});
published.qs.push({key:'net_zone',builtin:false,role:'infra',label:'네트워크 구성',title:'서버가 놓일 망 구간과 경유 장비를 적어 주세요.',help:'예: DMZ 웹 구간, 내부 DB 구간, L4 스위치와 방화벽 경유',format:'장문형',when:'사전 협의',cond:'all',required:false,on:true});
published.version=2; published.publishedAt='2026-10-27 09:00';
const versions=[
  {version:1,publishedAt:'2026-09-15 09:00',note:'최초 게시',cfg:Object.assign(clone(published),{version:1,publishedAt:'2026-09-15 09:00',qs:clone(published.qs).filter(q=>q.builtin)})},
  {version:2,publishedAt:'2026-10-27 09:00',note:'ICT인프라 질문 2개 추가',cfg:clone(published)}];
const cfgOf=p=>{const v=versions.find(x=>x.version===p.ver);return v?v.cfg:published;};
function QD(id,cfg){const e=(cfg||published).qs.find(q=>q.key===id)||{};return Object.assign({},QDEFS[id]||{type:'text'},e,{type:(QDEFS[id]&&QDEFS[id].type)||(e.format==='선택형'?'choice':'text')});}
const openSupps=p=>(p.supps||[]).filter(s=>!s.reply);
const waitingUser=p=>p.stage===1&&openSupps(p).length>0;
let draft=clone(published);
let draftSaved=false;
const GUARD_LABEL={noAny:'출발지·목적지가 모두 Any인 규칙 금지',maxYear:'방화벽 허용 기간은 최대 1년',vpn:'외부 원격관리는 SSL-VPN 경유 필수',pii:'개인정보 처리 시 정보보안 검토 표시'};

const R=(biz,from,fromIp,to,toIp,port,dir)=>({biz,from,fromIp,to,toIp,port,proto:'TCP',dir});
const H=(at,who,what)=>({at,who,what});
let projects=[
  {id:'SF-2026-011',name:'지역 통계 개방 API 연계',dept:'디지털혁신팀',requester:'정해원',ver:2,cfg:{order:'seq',head:false},stage:3,infraDone:true,secDone:true,
   extra:{server_spec:'2vCPU, 8GB 메모리, Rocky Linux 9',net_zone:'DMZ API 구간, 내부 통계 DB 구간'},purpose:'지역별 주택금융 통계를 공공데이터 포털 API로 개방',audience:'국민 (인터넷으로 접속)',pii:false,period:'2026-11-20 ~ 2027-11-19',unknown:[],due:'2026-11-12',updated:'2026-11-04',rev:1,
   rules:[R('공공데이터 포털이 통계 API 호출','공공데이터 포털','203.0.113.0/24','통계 API 서버(DMZ)','10.20.5.31','443','인바운드'),R('API 서버가 통계 DB 조회','통계 API 서버(DMZ)','10.20.5.31','통계 DB','10.40.3.12','5432','내부')],
   history:[H('2026-10-29 10:12','정해원 (신청자)','인터뷰 완료, 기술정보 확인 요청'),H('2026-10-30 15:40','박준호 (ICT인프라)','통신 정보 입력'),H('2026-11-02 11:05','이서연 (정보보안)','협의 완료'),H('2026-11-04 09:30','정해원 (신청자)','제출본 1 제출')]},
  {id:'SF-2026-012',name:'주택연금 상담 챗봇',dept:'주택연금부',requester:'김민지',ver:2,cfg:{order:'seq',head:false},stage:1,infraDone:true,secDone:false,
   src:{purpose:{k:'ai',ok:'user',ev:'사업계획서.docx 1쪽 “가입·지급 문의에 답하는 대국민 상담 챗봇”'},audience:{k:'ai',ok:'user',ev:'사업계획서.docx 2쪽 “국민이 홈페이지에서 이용”'},period:{k:'staff',by:'박준호'}},
   extra:{server_spec:'4vCPU, 16GB 메모리, Rocky Linux 9',net_zone:'DMZ 웹 구간에 챗봇 서버, 내부 DB 구간에 고객정보 DB. L4와 내부 방화벽 경유'},purpose:'주택연금 가입·지급 문의에 답하는 대국민 상담 챗봇',audience:'국민 (인터넷으로 접속)',pii:true,period:'2026-11-20 ~ 2027-11-19',unknown:[],due:'2026-11-09',updated:'2026-11-04',
   rules:[R('국민이 인터넷으로 챗봇에 접속','인터넷 이용자','Any','챗봇 웹서버(DMZ)','10.20.5.11','443','인바운드'),R('기관 내부 AI로 답변 생성','챗봇 웹서버(DMZ)','10.20.5.11','내부 LLM 서버','10.30.8.21','8000','내부'),R('가입 내역·지급액 조회','챗봇 웹서버(DMZ)','10.20.5.11','고객정보 DB','10.40.2.15','1521','내부'),R('유지보수 업체 원격 점검','SSL-VPN 사용자','172.16.90.0/24','챗봇 웹서버(DMZ)','10.20.5.11','22','인바운드(VPN 경유)')],
   history:[H('2026-11-02 14:20','김민지 (신청자)','인터뷰 완료, 기술정보 확인 요청'),H('2026-11-04 10:02','박준호 (ICT인프라)','통신 정보 입력')]},
  {id:'SF-2026-013',name:'전세보증 서류 자동심사',dept:'전세보증부',requester:'최유진',ver:2,cfg:{order:'seq',head:false},stage:1,infraDone:false,secDone:false,
   purpose:'전세보증 신청 서류를 내부 AI로 판독해 심사를 보조',audience:'직원 (기관 내부망)',pii:true,period:null,unknown:['운영 기간'],due:'2026-11-11',updated:'2026-11-03',
   rules:[R('직원이 내부망에서 심사 화면 사용','내부 업무망','10.10.0.0/16','서류심사 서버',null,'443','내부'),R('서류 판독용 내부 AI 호출','서류심사 서버',null,'내부 LLM 서버','10.30.8.21',null,'내부')],
   history:[H('2026-10-26 16:45','최유진 (신청자)','인터뷰 완료, 기술정보 확인 요청')]},
  {id:'SF-2026-014',name:'보금자리론 알림톡 발송',dept:'주택연금부',requester:'김민지',ver:2,cfg:{order:'seq',head:false},stage:1,infraDone:true,secDone:false,
   supps:[{id:1,from:'정보보안',item:'알림 문구의 개인정보',text:'알림 문구에 대출 금액이 들어가는지 알려 주세요. 들어가면 마스킹 방식을 적어 주세요.',reply:null,at:'2026-11-04 13:15'}],extra:{server_spec:'2vCPU, 8GB 메모리, Rocky Linux 9'},
   purpose:'보금자리론 상환일 안내를 알림톡으로 발송',audience:'국민 (인터넷으로 접속)',pii:true,period:'2026-11-15 ~ 2027-11-14',unknown:[],due:'2026-11-10',updated:'2026-11-04',
   rules:[R('알림 중계사로 메시지 전송','알림 발송 서버','10.20.6.30','메시지 중계사','203.0.113.45','443','아웃바운드')],
   history:[H('2026-10-31 11:00','김민지 (신청자)','인터뷰 완료, 기술정보 확인 요청'),H('2026-11-03 09:40','박준호 (ICT인프라)','통신 정보 입력'),H('2026-11-04 13:15','이서연 (정보보안)','보완 요청 (신청자)')]},
  {id:'SF-2026-015',name:'주택연금 가입 안내 자동화',dept:'주택연금부',requester:'김민지',ver:2,cfg:{order:'seq',head:false},stage:0,infraDone:false,secDone:false,
   purpose:'주택연금 가입 상담 예약과 안내 문자 발송을 자동화',audience:null,pii:false,period:null,unknown:[],due:null,updated:'2026-11-04',rules:[],
   history:[H('2026-11-04 17:20','김민지 (신청자)','인터뷰 작성 시작')]},
  {id:'SF-2026-009',name:'회의록 요약 도구',dept:'디지털혁신팀',requester:'정해원',ver:1,cfg:{order:'seq',head:false},stage:4,result:'done',infraDone:true,secDone:true,
   purpose:'내부 회의 녹취를 내부 LLM으로 요약',audience:'직원 (기관 내부망)',pii:false,period:'2026-10-28 ~ 2027-10-27',unknown:[],due:null,updated:'2026-10-28',rev:1,
   rules:[R('직원이 요약 도구 사용','내부 업무망','10.10.0.0/16','요약 도구 서버','10.30.8.40','443','내부')],
   history:[H('2026-10-28 16:00','이서연 (정보보안)','처리 결과 기록 (처리 완료)')]}
];
let policies=[
  {id:'FW-25-0288',name:'2025 국정감사 자료 공유',owner:'강민재',from:'10.30.1.0/24',to:'10.40.9.5',port:'445',exp:'2026-10-31',last:'2026-09-30',hits:0},
  {id:'FW-25-0377',name:'설문조사 외부 연동',owner:'한도윤',from:'10.20.5.22',to:'survey.example.kr',port:'443',exp:'2026-11-30',last:'2026-06-12',hits:0},
  {id:'FW-25-0412',name:'홈페이지 검색 개선 테스트',owner:'오세린',from:'10.20.5.40',to:'10.40.2.30',port:'3306',exp:'2026-11-18',last:'2026-11-04',hits:1820},
  {id:'FW-25-0402',name:'외부 교육기관 영상 스트리밍',owner:'윤가람',from:'10.10.0.0/16',to:'edu-stream.example.kr',port:'443',exp:'2026-12-02',last:'2026-11-01',hits:77},
  {id:'FW-25-0150',name:'구 홈페이지 관리자 접속',owner:'오세린',from:'172.16.90.0/24',to:'10.20.5.9',port:'22',exp:'2027-01-15',last:'2026-05-20',hits:0},
  {id:'FW-25-0201',name:'전자계약 본인인증',owner:'최유진',from:'10.20.5.18',to:'auth.example.kr',port:'443',exp:'2027-03-31',last:'2026-11-05',hits:5402},
  {id:'FW-26-0057',name:'회의록 요약 도구',owner:'정해원',from:'10.10.0.0/16',to:'10.30.8.40',port:'443',exp:'2027-10-27',last:'2026-11-05',hits:211}
];

const state={role:'user',view:'dash',id:null,stat:'all',filter:'all',q:'',pfilter:'all',flash:null};

/* ---------- project logic ---------- */
function turns(p){
  if(p.stage===0) return ['user'];
  if(waitingUser(p)) return ['user'];
  if(p.stage===1){
    if(p.cfg.order==='seq') return !p.infraDone?['infra']:(!p.secDone?['sec']:[]);
    return [!p.infraDone&&'infra',!p.secDone&&'sec'].filter(Boolean);
  }
  if(p.stage===2) return ['user'];
  if(p.stage===3) return ['sec'];
  return [];
}
/* 신청자는 본인이 신청한 건만 본다. 기관 관리자·정보보안·ICT인프라는 기관 전체를 본다. (운영에서는 서버가 최종 판단) */
const canSee=p=>state.role!=='user'||p.requester===ROLES.user.person;
const scoped=()=>projects.filter(canSee);
const myTurn=p=>turns(p).includes(state.role);
const staffTurn=p=>turns(p).some(r=>r==='infra'||r==='sec');
/* ---------- 값의 출처: 사용자 답변 / AI 추론(+근거) / 담당자 입력 / 담당자 확인 ----------
   p.src[키]에 기록된 값이 있으면 그대로 쓰고, 없으면 아래 기준으로 판단한다.
   키: purpose·audience·pii·period, 기관 추가 질문 'x.저장키', 방화벽 규칙 칸 'r번호.칸' */
const RULE_ADDR=['fromIp','toIp','port'];
function srcOf(p,key){
  const s=(p.src||{})[key]; let o=s?{...s}:null;
  if(!o){
    if(key.startsWith('x.')){
      const k=key.slice(2), q=cfgOf(p).qs.find(x=>x.key===k); if(!(p.extra||{})[k]) return null;
      o=q&&q.role!=='user'?{k:'staff',by:ROLES[q.role].person}:{k:'user'};
    } else if(/^r\d+\./.test(key)){
      const [ri,k]=key.slice(1).split('.'), r=p.rules[+ri]; if(!r||r[k]==null) return null;
      o=RULE_ADDR.includes(k)&&r[k]!=='Any'&&p.infraDone?{k:'staff',by:ROLES.infra.person}:{k:'ai',ev:'신청자 답변을 방화벽 규칙으로 변환'};
    } else o={k:'user'};
  }
  if(o.k==='ai'&&o.ok!=='staff'&&(p.secDone||p.stage>=2)){o.ok='staff';o.okBy=ROLES.sec.person;}
  return o;
}
function srcTag(o){
  if(!o) return '';
  const who=o.ok==='staff'?o.okBy:o.k==='staff'?o.by:null, by=who?`(${esc(who)})`:'';
  const [cls,lbl]=o.k==='ai'?(o.ok==='staff'?['b-success',`AI 추론 · 확인${by}`]:o.ok==='user'?['b-info','AI 추론 · 사용자 확인']:['src-ai','AI 추론'])
    :o.k==='staff'?['b-info',`직접 입력${by}`]:['b-neutral','사용자 답변'];
  return `<span class="badge src ${cls}"><span class="sr-only">출처: </span>${lbl}</span>`;
}
/* 출처 꼬리표가 붙는 값 중 아직 사람이 확인하지 않은 AI 추론 개수 */
function aiPending(p){
  const keys=['purpose','audience','pii','period',...Object.keys(p.extra||{}).map(k=>'x.'+k),
    ...p.rules.flatMap((r,i)=>['biz',...RULE_ADDR].map(k=>`r${i}.${k}`))];
  return keys.filter(k=>{const o=srcOf(p,k);return o&&o.k==='ai'&&!o.ok;}).length;
}
const srcEv=o=>o&&o.k==='ai'&&o.ev?`<span class="src-ev">근거: ${esc(o.ev)}</span>`:'';
function statusOf(p){
  if(p.stage===4) return p.result==='reject'?['처리 불가','b-danger']:['처리 완료','b-success'];
  if(p.stage===0) return ['작성 중','b-neutral'];
  /* 담당자 사이의 되돌림(정보보안→ICT인프라)은 신청 전체로는 '사전 협의 중'. 분야별 '보완 요청'은 상세 화면 협의 현황에 표시 */
  if(p.stage===1) return waitingUser(p)?['보완 요청','b-warning']:['사전 협의 중','b-info'];
  if(p.stage===2) return ['제출 준비','b-info'];
  return ['제출됨','b-info'];
}
function nextTodo(p){
  if(p.stage===0) return '인터뷰 답변 이어서 작성';
  if(waitingUser(p)) return '보완 답변 등록';
  if(p.stage===1){const t=turns(p);return t.map(r=>r==='infra'?'통신 정보 입력':'정보보안 검토').join(', ')||'협의 결과 정리';}
  if(p.stage===2) return p.returned?'보완 답변·신청 서류 확인':'신청 서류 확인·최종 제출';
  if(p.stage===3) return '제출본 항목 검토·결과 기록';
  return p.result==='reject'?'처리 불가 사유 확인':'정책 수명주기 관리';
}
const missingCount=p=>p.rules.reduce((n,r)=>n+[r.fromIp,r.toIp,r.port].filter(v=>v===null).length,0)+(p.period?0:1);

/* ---------- shell ---------- */
const $main=document.getElementById('main');
function setRole(k){if(state.view==='chat'&&typeof saveChatDraft==='function')saveChatDraft();state.role=k;state.stat='all';state.filter='all';state.page=1;state.flash=null;route(true);}
function renderShell(){
  const r=ROLES[state.role];
  document.getElementById('u-av').textContent=r.person.slice(0,1);
  document.getElementById('u-name').textContent=r.person;
  document.getElementById('u-dept').textContent=r.dept;
  document.getElementById('btn-user').setAttribute('aria-label',`사용자 ${r.person}, ${r.dept}, ${r.name}. 다른 사용자 선택`);
  const cur=['detail','submitted'].includes(state.view)?'dash':state.view;
  const badge={dash:scoped().filter(myTurn).length,supp:scoped().filter(p=>waitingUser(p)).reduce((n,p)=>n+openSupps(p).length,0),net:projects.filter(p=>p.stage>=1&&p.stage<=3&&missingCount(p)).length};
  const col=document.body.classList.contains('side-collapsed');
  document.getElementById('menu').innerHTML=MENU[state.role].map(([v,l])=>{const b=badge[v];return `<li><a href="${PAGES[v]}" ${v===cur?'aria-current="page"':''} ${col?`title="${l}${b?` (${b}건)`:''}"`:''}>${NAVI[v]||''}<span class="nl">${l}</span>${b?`<b class="nbadge" aria-label="${b}건">${b}</b>`:''}</a></li>`;}).join('');
  const titles={home:'업무 한눈에 보기',dash:MENU[state.role][0][1],chat:'새 신청',supp:'보완 요청',docs:'문서함',net:'통신 정보',hist:state.role==='sec'?'검토 이력':'처리 이력',policy:'정책 수명주기',settings:'기관 설정',detail:'신청 상세',submitted:'제출 완료'};
  document.title=`${titles[state.view]} | 보안길잡이 AI`;
  renderNotiBadge();
}
function pageOf(t){
  if(t.startsWith('req-')) return 'request-detail.html?id='+encodeURIComponent(t.slice(4));
  if(t.startsWith('submitted-')) return 'submitted.html?id='+encodeURIComponent(t.slice(10));
  const map={requests:'requests.html','new-request':'new-request.html',supplements:'supplements.html',documents:'documents.html',network:'network.html',history:'history.html',policies:'policies.html','org-config':'settings.html'};
  return map[t]||t;
}
function go(target){
  if(state.flash&&state.keepFlash){ try{sessionStorage.setItem('sf-flash',JSON.stringify(state.flash));}catch(e){} }
  persist(); location.href=pageOf(target);
}
function route(focus){
  const v=document.body.dataset.view, id=new URLSearchParams(location.search).get('id');
  if(MENU_VIEWS.includes(v)&&!MENU[state.role].some(m=>m[0]===v)){ persist(); location.replace(PAGES.dash); return; }
  if((v==='detail'||v==='submitted')&&!projects.find(p=>p.id===id)){ persist(); location.replace(PAGES.dash); return; }
  if((v==='detail'||v==='submitted')&&!canSee(projects.find(p=>p.id===id))){ persist(); location.replace(PAGES.dash); return; }
  if(!state.keepFlash&&(v!==state.view||id!==state.id)) state.flash=null;
  state.keepFlash=false;
  state.view=v; state.id=id;
  render(); persist();
  if(focus){const h1=$main.querySelector('h1');if(h1){h1.setAttribute('tabindex','-1');h1.focus({preventScroll:false});}window.scrollTo(0,0);}
}
document.querySelector('.skip').addEventListener('click',e=>{e.preventDefault();$main.focus();});
function render(){
  renderShell();
  const fn=VIEWS[state.view]; if(fn) fn();
}
function flashHTML(){
  if(!state.flash) return '';
  const {kind,text}=state.flash;
  return `<div class="notice n-${kind}" role="status">${kind==='danger'||kind==='warning'?I.warn:I.okc}<p>${esc(text)}</p></div>`;
}
let tt;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),2800);}

/* ---------- dialog ---------- */
const dlg=document.getElementById('dlg');
let opener=null;
function openDialog(title,bodyHTML,actions){
  opener=document.activeElement;
  dlg.innerHTML=`<div class="dlg"><div class="dlg-h"><h2 class="h-panel" id="dlg-title">${esc(title)}</h2></div>
    <div class="dlg-b">${bodyHTML}</div>
    <div class="dlg-f">${actions.map((a,i)=>`<button type="button" class="btn ${a.cls||''}" data-dlg="${i}">${esc(a.label)}</button>`).join('')}</div>
    <button type="button" class="dlg-x" data-dlg="close" aria-label="닫기">${I.x}</button></div>`;
  dlg.querySelectorAll('[data-dlg]').forEach(b=>b.addEventListener('click',()=>{
    const k=b.dataset.dlg;
    if(k==='close'){dlg.close();return;}
    const a=actions[+k]; if(!a.fn||a.fn()!==false) dlg.close();
  }));
  dlg.showModal();
  const first=dlg.querySelector('.dlg-b [tabindex],.dlg-b input,.dlg-f .btn');
  if(first) first.focus();
}
dlg.addEventListener('close',()=>{if(opener&&document.contains(opener))opener.focus();});
/* ---------- due dates ---------- */
function addBizDays(ds,n){ const d=new Date(ds+'T00:00:00'); let k=0; while(k<n){ d.setDate(d.getDate()+1); const w=d.getDay(); if(w!==0&&w!==6) k++; } return fmt(d); }
function acceptDate(p){ const h=p.history.find(x=>/기술정보 확인 요청/.test(x.what)); return ((h&&h.at)||regDate(p)).slice(0,10); }
function dueOf(p){ if(p.stage===0||p.stage===4) return null; return addBizDays(acceptDate(p),(cfgOf(p).slaDays)||published.slaDays||5); }
function dueLeft(p){ const d=dueOf(p); return d==null?null:Math.round((new Date(d+'T00:00:00')-TODAY)/DAY); }
function dueCell(p){
  const d=dueOf(p); if(!d) return '<span class="help">-</span>';
  const n=dueLeft(p);
  const tag=n<0?`<span class="badge b-danger">D+${-n}<span class="sr-only">, 기한 ${-n}일 지남</span></span>`:n===0?'<span class="badge b-warning">D-0<span class="sr-only">, 오늘까지</span></span>':n<=2?`<span class="badge b-warning">D-${n}</span>`:`<span class="badge b-neutral">D-${n}</span>`;
  return `${tag}<div class="p-meta${n<0?' over':''}">${dot(d)}</div>`;
}

function showErrors(errs){
  errs.forEach(e=>{const el=document.getElementById(e.id);const m=document.getElementById(e.id+'-e');
    if(el){el.setAttribute('aria-invalid','true');} if(m){m.hidden=false;m.textContent=e.msg;}});
  const box=document.getElementById('err-sum');
  box.innerHTML=errs.length?`<div class="notice n-danger" role="alert" tabindex="-1">${I.warn}<div><p><b>입력 내용을 확인해 주세요 (${errs.length}건)</b></p><ul>${errs.map(e=>`<li>${e.id?`<a href="#${e.id}" data-jump="${e.id}">${esc(e.msg)}</a>`:esc(e.msg)}</li>`).join('')}</ul></div></div>`:'';
  if(errs.length) box.firstElementChild.focus();
}
function clearErrors(){
  $main.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.removeAttribute('aria-invalid'));
  $main.querySelectorAll('.ferr').forEach(el=>{el.hidden=true;el.textContent='';});
  const b=document.getElementById('err-sum'); if(b) b.innerHTML='';
}
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(new Date(s+'T00:00:00'))&&fmt(new Date(s+'T00:00:00'))===s;
function doneFlash(p,kind,text){state.flash={kind,text};state.keepFlash=true;p.updated=TODAY_STR;}
const ROLE_TAG={infra:'박준호 (ICT인프라)',sec:'이서연 (정보보안)',user:'김민지 (신청자)'};
const FIELD={infra:'ICT인프라',sec:'정보보안'};
function policyStatus(p){
  const left=Math.round((new Date(p.exp+'T00:00:00')-TODAY)/DAY);
  const idle=Math.round((TODAY-new Date(p.last+'T00:00:00'))/DAY);
  const tags=[];
  if(left<0) tags.push(['b-danger','만료됨']);
  else if(left<=published.warnDays) tags.push(['b-warning',`만료 ${left}일 전`]);
  if(idle>=published.idleDays) tags.push(['b-danger',`${idle}일 미사용`]);
  if(!tags.length) tags.push(['b-neutral','관리 중']);
  return {left,idle,tags,attention:left<=published.warnDays||idle>=published.idleDays};
}
const JSZIP_URL='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const SHEETJS_URL='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
function loadScript(src){return new Promise((res,rej)=>{const ex=document.querySelector(`script[src="${src}"]`);if(ex&&ex.dataset.ok){res();return;}
  const sc=ex||document.createElement('script');sc.src=src;sc.onload=()=>{sc.dataset.ok='1';res();};sc.onerror=()=>rej(new Error('load'));if(!ex)document.head.appendChild(sc);});}
/* ---------- header dialogs ---------- */
const SCALES=[['1','보통'],['1.125','크게'],['1.25','아주 크게']];
function applyScale(v){document.documentElement.style.fontSize=(56.25*+v)+'%';try{localStorage.setItem('sf-scale',v);}catch(e){}}
try{const v=localStorage.getItem('sf-scale');if(v&&SCALES.some(s=>s[0]===v))applyScale(v);}catch(e){}
function openDisplay(){
  let cur='1';try{cur=localStorage.getItem('sf-scale')||'1';}catch(e){}
  openDialog('화면 설정',`<fieldset style="margin:0"><legend class="legend">글자 크기</legend><div class="radios">${SCALES.map(([v,l])=>`<label class="ropt"><input type="radio" name="scale" value="${v}" ${cur===v?'checked':''}><span>${l}</span></label>`).join('')}</div>
    <p class="help">선택하면 바로 적용됩니다. 브라우저 확대 기능도 함께 쓸 수 있습니다.</p></fieldset>`,
    [{label:'기본값으로',cls:'btn-tertiary',fn:()=>{applyScale('1');toast('글자 크기를 기본값으로 되돌렸습니다.');}},{label:'닫기',cls:'btn'}]);
  dlg.querySelectorAll('input[name=scale]').forEach(r=>r.addEventListener('change',()=>applyScale(r.value)));
}
function openHelp(){
  openDialog('이용 안내',`<ol class="steps-guide">${STAGES.map((n,i)=>`<li><span class="sn">${i+1}</span><div><b>${n}</b><p>${['신청자가 기획서를 올리거나 대화로 답하면 AI가 방화벽 규칙 초안을 만듭니다.','ICT인프라 담당자가 서버 주소와 포트를, 정보보안 담당자가 개인정보와 접속 경로를 확인합니다.','신청자가 보완 요청에 답하고 완성된 신청서를 최종 제출합니다.','정보보안 담당자가 제출본을 검토하고 처리 결과를 기록합니다. 적용된 규칙은 정책 수명주기로 관리합니다.'][i]}</p></div></li>`).join('')}</ol>
    `,[{label:'저장된 데이터 초기화',cls:'btn-tertiary',fn:()=>{resetData();}},{label:'닫기',cls:'btn'}]);
}
/* font size */
const FS=['1','1.125','1.25'], FS_LBL=['보통','크게','아주 크게'];
let fsIdx=0; try{fsIdx=Math.max(0,FS.indexOf(localStorage.getItem('sf-scale')||'1'));}catch(e){}
const fsDown=document.getElementById('fs-down'), fsUp=document.getElementById('fs-up');
function updFs(){fsDown.disabled=fsIdx===0;fsUp.disabled=fsIdx===FS.length-1;fsDown.setAttribute('aria-label',`글자 작게 (현재 ${FS_LBL[fsIdx]})`);fsUp.setAttribute('aria-label',`글자 크게 (현재 ${FS_LBL[fsIdx]})`);}
function setFs(i){fsIdx=i;applyScale(FS[i]);updFs();toast(`글자 크기를 ${FS_LBL[i]}(으)로 바꿨습니다. 브라우저 확대도 함께 쓸 수 있습니다.`);}
fsDown.addEventListener('click',()=>{if(fsIdx>0)setFs(fsIdx-1);});
fsUp.addEventListener('click',()=>{if(fsIdx<FS.length-1)setFs(fsIdx+1);});
updFs();

/* notifications */
const readSet=new Set();
const notiBtn=document.getElementById('btn-noti'), notiPanel=document.getElementById('noti');
function notiItems(){
  const r=state.role;
  return projects.flatMap(p=>p.history.map(h=>({p,h,key:p.id+'|'+h.at+'|'+h.what}))).filter(({p,h})=>{
    if(r==='user') return canSee(p)&&!h.who.includes('(신청자)');
    if(r==='infra') return !h.who.includes('(ICT인프라)');
    if(r==='sec') return !h.who.includes('(정보보안)');
    return true;}).sort((a,b)=>a.h.at<b.h.at?1:-1).slice(0,8);
}
const isNew=it=>!readSet.has(it.key)&&it.h.at>='2026-11-04';
function renderNotiBadge(){
  const n=notiItems().filter(isNew).length, b=document.getElementById('noti-n');
  b.textContent=n>9?'9+':String(n); b.hidden=!n;
  notiBtn.setAttribute('aria-label',n?`알림, 새 소식 ${n}건`:'알림');
  if(!notiPanel.hidden) renderNotiPanel();
}
function renderNotiPanel(){
  const items=notiItems();
  document.getElementById('noti-list').innerHTML=items.length?items.map(it=>{
    const m=it.h.who.match(/^(.*?)\s*\((.*)\)$/); const who=m?`${m[1]}, ${m[2]}`:it.h.who;
    return `<li><a href="request-detail.html?id=${it.p.id}" data-nkey="${esc(it.key)}">${isNew(it)?'<span class="badge b-danger nnew">새 소식</span>':''}<b>${esc(it.p.name)}</b>: ${esc(it.h.what)}<span class="meta">${esc(dot(it.h.at.slice(5)))}, ${esc(who)}</span></a></li>`;}).join('')
    :'<li class="empty">아직 받은 알림이 없습니다.</li>';
}
function openNoti(){renderNotiPanel();notiPanel.hidden=false;notiBtn.setAttribute('aria-expanded','true');document.getElementById('noti-h').focus();}
function closeNoti(back){if(notiPanel.hidden)return;notiPanel.hidden=true;notiBtn.setAttribute('aria-expanded','false');if(back)notiBtn.focus();}
notiBtn.addEventListener('click',()=>notiPanel.hidden?openNoti():closeNoti(true));
document.getElementById('noti-x').addEventListener('click',()=>closeNoti(true));
document.getElementById('noti-read').addEventListener('click',()=>{notiItems().forEach(it=>readSet.add(it.key));renderNotiBadge();renderNotiPanel();toast('알림을 모두 읽음으로 표시했습니다.');});
notiPanel.addEventListener('click',e=>{const a=e.target.closest('a[data-nkey]');if(a){readSet.add(a.dataset.nkey);closeNoti(false);setTimeout(renderNotiBadge,0);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!notiPanel.hidden){e.preventDefault();closeNoti(true);}});
document.addEventListener('click',e=>{if(!notiPanel.hidden&&!e.target.closest('.noti-wrap'))closeNoti(false);});

/* user switcher */
const ubtn=document.getElementById('btn-user'), umenu=document.getElementById('umenu');
function renderUserMenu(){
  document.getElementById('u-list').innerHTML=Object.entries(ROLES).map(([k,v])=>`<li><button type="button" data-role="${k}" ${k===state.role?'aria-current="true"':''}><span class="uav" aria-hidden="true">${v.person.slice(0,1)}</span><span class="utxt"><b>${v.person}</b><span>${v.dept}, ${v.name}</span></span>${k===state.role?'<span class="ck" aria-hidden="true">✓</span><span class="sr-only">현재 사용자</span>':''}</button></li>`).join('');
}
function openUser(){renderUserMenu();umenu.hidden=false;ubtn.setAttribute('aria-expanded','true');(umenu.querySelector('[aria-current]')||umenu.querySelector('button')).focus();}
function closeUser(back){if(umenu.hidden)return;umenu.hidden=true;ubtn.setAttribute('aria-expanded','false');if(back)ubtn.focus();}
ubtn.addEventListener('click',()=>umenu.hidden?openUser():closeUser(true));
umenu.addEventListener('click',e=>{const b=e.target.closest('[data-role]');if(!b)return;closeUser(true);if(b.dataset.role!==state.role){setRole(b.dataset.role);toast(`${ROLES[state.role].person}(${ROLES[state.role].name}) 화면으로 바꿨습니다.`);}});
umenu.addEventListener('keydown',e=>{const bs=[...umenu.querySelectorAll('button')];const i=bs.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();bs[(i+1)%bs.length].focus();} else if(e.key==='ArrowUp'){e.preventDefault();bs[(i-1+bs.length)%bs.length].focus();}});

/* global search */
const gq=document.getElementById('gq'), glist=document.getElementById('gq-list'); let gItems=[], gIdx=-1;
function gResults(t){
  t=t.trim().toLowerCase();
  const screens=MENU[state.role].map(([v,l])=>({type:'화면',label:l,sub:'메뉴',href:PAGES[v]})).filter(x=>!t||x.label.toLowerCase().includes(t));
  const reqs=scoped().filter(p=>t&&(p.name+p.id+p.dept+p.requester).toLowerCase().includes(t)).slice(0,6).map(p=>({type:'신청',label:p.name,sub:`${p.id}, ${p.dept}, ${statusOf(p)[0]}`,href:'request-detail.html?id='+p.id}));
  return [...reqs,...screens];
}
function renderG(){
  gItems=gResults(gq.value); gIdx=gItems.length?0:-1;
  let html='', last='';
  gItems.forEach((it,i)=>{ if(it.type!==last){html+=`<li class="gh" role="presentation">${it.type==='신청'?'신청':'화면'}</li>`;last=it.type;}
    html+=`<li role="option" id="gopt-${i}" data-i="${i}" aria-selected="${i===gIdx}"><span>${esc(it.label)}</span><span class="meta">${esc(it.sub)}</span></li>`;});
  glist.innerHTML=html||`<li class="gempty" role="presentation">“${esc(gq.value)}”에 맞는 신청이나 화면이 없습니다.</li>`;
  glist.hidden=false; gq.setAttribute('aria-expanded','true'); gq.setAttribute('aria-activedescendant',gIdx>=0?'gopt-'+gIdx:'');
}
function moveG(d){ if(!gItems.length) return; gIdx=(gIdx+d+gItems.length)%gItems.length; glist.querySelectorAll('[role=option]').forEach(o=>o.setAttribute('aria-selected',+o.dataset.i===gIdx)); gq.setAttribute('aria-activedescendant','gopt-'+gIdx); const o=document.getElementById('gopt-'+gIdx); if(o&&o.scrollIntoView) o.scrollIntoView({block:'nearest'}); }
function closeG(){glist.hidden=true;gq.setAttribute('aria-expanded','false');gq.removeAttribute('aria-activedescendant');}
function pickG(i){const it=gItems[i]; if(!it) return; closeG(); gq.value=''; location.href=it.href;}
gq.addEventListener('focus',renderG);
gq.addEventListener('input',renderG);
gq.addEventListener('keydown',e=>{
  if(e.isComposing||e.keyCode===229) return;
  if(e.key==='ArrowDown'){e.preventDefault();if(glist.hidden)renderG();else moveG(1);}
  else if(e.key==='ArrowUp'){e.preventDefault();moveG(-1);}
  else if(e.key==='Enter'){e.preventDefault();if(gIdx>=0)pickG(gIdx);}
  else if(e.key==='Escape'){if(!glist.hidden){e.preventDefault();e.stopPropagation();closeG();}}
});
glist.addEventListener('mousedown',e=>e.preventDefault());
glist.addEventListener('click',e=>{const o=e.target.closest('[role=option]');if(o)pickG(+o.dataset.i);});
gq.addEventListener('blur',()=>setTimeout(closeG,100));
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();gq.focus();gq.select();}
  if(e.key==='Escape'&&!umenu.hidden){e.preventDefault();closeUser(true);}
});
document.addEventListener('click',e=>{if(!umenu.hidden&&!e.target.closest('.umenu-wrap'))closeUser(false);});


document.querySelectorAll('[data-help]').forEach(b=>b.addEventListener('click',openHelp));
$main.addEventListener('keydown',e=>{
  const tab=e.target.closest&&e.target.closest('[role=tab]');
  if(tab&&['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){
    e.preventDefault(); const ks=STABS.map(x=>x[0]); let i=ks.indexOf(tab.dataset.k);
    i=e.key==='Home'?0:e.key==='End'?ks.length-1:(i+(e.key==='ArrowRight'?1:-1)+ks.length)%ks.length;
    state.stab=ks[i]; renderSettings(); document.getElementById('tab-'+ks[i]).focus(); return;
  }
  if(e.key!=='Enter'||e.isComposing||e.keyCode===229) return;
  const id=e.target.id;
  if(id==='sq'||id==='pf-from'||id==='pf-to'){e.preventDefault();applyDashFilter(id);}
  else if(id==='qtext'){e.preventDefault();saveAnswer();}
  else if(id==='nd'){e.preventDefault();$main.querySelector('[data-act=add-doc]').click();}
  else if(id==='dq'){e.preventDefault();if(dqOpen&&dqIdx>=0)dqPick(dqIdx);else $main.querySelector('[data-act=doc-search]').click();}
  else if(id==='hq'){e.preventDefault();$main.querySelector('[data-act=hsearch]').click();}
  else if(id==='qsearch'){e.preventDefault();$main.querySelector('[data-act=qsearch]').click();}
});
$main.addEventListener('input',e=>{
  if(e.target.getAttribute('aria-invalid')==='true'){e.target.removeAttribute('aria-invalid');const m=document.getElementById(e.target.id+'-e');if(m){m.hidden=true;}}
});
const mbtn=document.getElementById('btn-menu');
const sideTg=document.getElementById('side-tg');
function setSide(collapsed,save){
  document.body.classList.toggle('side-collapsed',collapsed);
  sideTg.setAttribute('aria-expanded',String(!collapsed));
  sideTg.querySelector('.tg-l').textContent=collapsed?'메뉴 펼치기':'메뉴 접기';
  sideTg.title=collapsed?'메뉴 펼치기':'메뉴 접기';
  if(save){try{localStorage.setItem('sf-side',collapsed?'1':'0');}catch(e){}}
  renderShell();
}
sideTg.addEventListener('click',()=>{setSide(!document.body.classList.contains('side-collapsed'),true);sideTg.focus();});
try{if(localStorage.getItem('sf-side')==='1') document.body.classList.add('side-collapsed');}catch(e){}
if(document.body.classList.contains('side-collapsed')){sideTg.setAttribute('aria-expanded','false');sideTg.querySelector('.tg-l').textContent='메뉴 펼치기';sideTg.title='메뉴 펼치기';}
mbtn.addEventListener('click',()=>{const open=mbtn.getAttribute('aria-expanded')!=='true';mbtn.setAttribute('aria-expanded',String(open));document.querySelector('.side').classList.toggle('open',open);});
const regDate=p=>((p.history[0]&&p.history[0].at)||p.updated).slice(0,10);


/* ---------- 저장 (페이지 사이 데이터 유지) ---------- */
const STORE_KEY='sf-store-v1';
function persist(){ try{ localStorage.setItem(STORE_KEY,JSON.stringify({projects,policies,published,draft,draftSaved,versions,role:state.role,read:[...readSet]})); }catch(e){} }
function restore(){ try{ const d=JSON.parse(localStorage.getItem(STORE_KEY)||'null'); if(!d) return;
  if(Array.isArray(d.projects)) projects=d.projects; if(Array.isArray(d.policies)) policies=d.policies;
  if(d.published&&d.published.qs) published=d.published; if(d.draft&&d.draft.qs) draft=d.draft; draftSaved=!!d.draftSaved;
  if(Array.isArray(d.versions)&&d.versions.length) versions.splice(0,versions.length,...d.versions);
  if(ROLES[d.role]) state.role=d.role; (d.read||[]).forEach(k=>readSet.add(k)); }catch(e){} }
function resetData(){ try{ localStorage.removeItem(STORE_KEY); sessionStorage.removeItem('sf-flash'); }catch(e){} location.href=PAGES.dash; }
window.addEventListener('pagehide',()=>{ if(state.view==='chat'&&typeof saveChatDraft==='function') saveChatDraft(); persist(); });

/* ---------- 화면 동작 연결 ---------- */
$main.addEventListener('click',e=>{
  const jump=e.target.closest('[data-jump]');
  if(jump){e.preventDefault();const el=document.getElementById(jump.dataset.jump);if(el)el.focus();return;}
  const b=e.target.closest('[data-act]'); if(!b) return;
  const fn=ACT[b.dataset.act]; if(!fn) return;
  const p=b.dataset.id&&projects.find(x=>x.id===b.dataset.id);
  fn(b,p,e);
});
