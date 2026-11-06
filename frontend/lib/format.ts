import type { SecurityRequest } from '@/features/request';
/** 업무 일시는 서버의 UTC 값과 무관하게 한국 시간으로 일관되게 표시한다. */
export function formatDate(value: string, time = false): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date);
}
/** 긴 UUID를 화면에서 식별하기 쉽게 축약하되 API에는 원본 식별자를 사용한다. */
export function shortId(id: string): string {
  return `SA-${id.slice(0, 8).toUpperCase()}`;
}
/** 초안·협의·제출·확정와 미해소 보완의 업무 의미를 분리한다. */
export function statusLabel(item: SecurityRequest): string {
  if (item.status === 'CLOSED') return '종결(반려)';
  if (item.status === 'WITHDRAWN') return '철회';
  if (item.status === 'CONFIRMED') return '서류 확정';
  if (item.returnItems.some((entry) => entry.status === 'OPEN')) return '반환 · 보완 필요';
  if (item.status === 'DRAFT') return '작성 중';
  if (item.status === 'FINAL_REVIEW') return '사용자 최종 검토';
  if (item.status === 'SUBMITTED') return '양측 최종 확인';
  if (item.supplements.some((entry) => entry.status !== 'RESOLVED')) return '보완 요청';
  return item.allocation.status === 'COMPLETE' ? '담당자 협의 중' : '인프라 할당 대기';
}
/** 계약의 두 문서 유형을 사용자가 이해하는 서류 이름으로 표시한다. */
export function documentLabel(type: SecurityRequest['documentType']): string {
  return type === 'FIREWALL' ? '방화벽 신청서' : '보안성검토 신청서';
}
/** 목록의 다음 화면을 안내할 뿐 서버 업무 상태나 권한을 바꾸지 않는다. */
export function stepPath(item: SecurityRequest, role: string): string {
  const step = ['CLOSED', 'WITHDRAWN', 'CONFIRMED'].includes(item.status)
    ? 'receipt'
    : item.stage === 1
      ? 'analysis'
      : item.stage === 4
        ? 'receipt'
        : item.stage === 3
          ? 'submit'
          : role === 'INFRA'
            ? 'infra'
            : role === 'SECURITY'
              ? 'security'
              : 'submit';
  return `/requests/${item.id}/${step}`;
}

/** 저장된 코드 값은 유지하고 사용자가 읽는 외부 전송 답변만 한국어로 표시한다. */
export function formatAnswerValue(key: string, value: string): string {
  if (!value) return '담당자 확인 필요';
  if (key !== 'externalTransfer') return value;
  const labels: Record<string, string> = { NO: '아니요', YES: '예', UNKNOWN: '잘 모름' };
  return labels[value] ?? value;
}

/** 조회 기간 필터도 화면 날짜와 같은 한국 시간대를 사용하도록 맞춘다. */
export function localDateKey(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
