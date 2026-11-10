import { Badge } from '@/components/ui';
import type { Comparison } from './types';

const labels: Record<string, string> = {
  APPLICANT: '신청자',
  INFRA: 'ICT인프라',
  SECURITY: '정보보안',
  CASE: '사업 공통 정보',
  REQUEST: '서류별 정보',
  TEXT: '단답형',
  LONG_TEXT: '장문형',
  BOOLEAN: '선택형(예·아니요)',
  DATE_RANGE: '기간',
  NUMBER: '숫자',
  IP_ADDRESS: 'IP 주소 / CIDR',
  PORT: '포트 / 범위',
  PROTOCOL: '프로토콜',
  true: '필수',
  false: '선택',
};
/** 전후 값은 좁은 화면에서도 각각 읽을 수 있는 목록으로 보여 준다. */
export function ChangeList({ changes }: { changes: Comparison['changes'] }) {
  if (!changes.length) return <p>게시본과 다른 내용이 없습니다.</p>;
  return (
    <ul className="configuration-changes">
      {changes.map((change) => (
        <li key={change.path}>
          <strong>{change.label}</strong>
          {change.dataContractChange && <Badge tone="warning">답변 계약 변경</Badge>}
          <dl>
            <dt>변경 전</dt>
            <dd>{labels[change.before] ?? (change.before || '없음')}</dd>
            <dt>변경 후</dt>
            <dd>{labels[change.after] ?? (change.after || '없음')}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
