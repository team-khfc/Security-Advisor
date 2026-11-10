import { useState } from 'react';
import { Field } from '@/components/ui';
import type { Settings } from './types';

/** 영업일 수와 기관 휴일은 게시본에 포함되며 기존 신청의 저장 기한을 바꾸지 않는다. */
export function DeadlineEditor({
  draft,
  onChange,
}: {
  draft: Settings;
  onChange: (draft: Settings) => void;
}) {
  const [holiday, setHoliday] = useState('');
  const [error, setError] = useState('');
  const policy = draft.deadlinePolicy;
  const update = (next: Partial<Settings['deadlinePolicy']>) =>
    onChange({ ...draft, deadlinePolicy: { ...policy, ...next } });
  const labels = {
    reviewBusinessDays: '분야별 협의 기한',
    supplementBusinessDays: '보완 응답 기한',
    finalConfirmationBusinessDays: '최종 확정 기한',
  };
  return (
    <div className="card">
      <h2 className="h-panel">처리 기한과 기관 공휴일</h2>
      <p>주말과 아래 휴일을 제외한 영업일로 계산합니다. 기한 임박 알림은 1영업일 전입니다.</p>
      <div className="configuration-deadlines">
        {Object.entries(labels).map(([key, label]) => (
          <Field key={key} label={`${label} (영업일)`} htmlFor={key}>
            <input
              className="input"
              id={key}
              type="number"
              min={1}
              max={365}
              step={1}
              value={policy[key as keyof typeof labels] || ''}
              onChange={(event) => update({ [key]: Number(event.target.value) })}
            />
          </Field>
        ))}
      </div>
      <Field label="기관 공휴일 추가" htmlFor="configuration-holiday" error={error}>
        <div className="btn-row">
          <input
            className="input"
            id="configuration-holiday"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={holiday}
            onChange={(event) => setHoliday(event.target.value)}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!holiday || holiday < '2000-01-01' || holiday > '2100-12-31') {
                setError('2000~2100년의 날짜를 선택해 주세요.');
                return;
              }
              if (policy.holidays.includes(holiday)) {
                setError('이미 등록한 공휴일입니다.');
                return;
              }
              update({ holidays: [...policy.holidays, holiday].sort() });
              setHoliday('');
              setError('');
            }}
          >
            공휴일 추가
          </button>
        </div>
      </Field>
      <ul className="doclist">
        {policy.holidays.map((day) => (
          <li key={day}>
            <time dateTime={day}>{day}</time>
            <button
              className="btn btn-tertiary"
              type="button"
              aria-label={`${day} 공휴일 제외`}
              onClick={() => update({ holidays: policy.holidays.filter((value) => value !== day) })}
            >
              제외
            </button>
          </li>
        ))}
      </ul>
      {!policy.holidays.length && <p className="help">등록된 기관 공휴일이 없습니다.</p>}
      <p className="help">
        새 게시본은 이후 생성하는 사업 건에 적용됩니다. 기존 사업 건의 추가 신청도 원래 게시본을
        유지하며, 이미 계산된 기한은 바뀌지 않습니다.
      </p>
    </div>
  );
}
