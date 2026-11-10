import { useState } from 'react';
import { Field } from '@/components/ui';
import { roleLabels, typeLabels, type Question, type Settings } from './types';

/** 시안의 질문 목록·편집 영역을 따르며 기본 질문의 답변 계약은 잠근다. */
export function QuestionEditor({
  draft,
  builtIns,
  publishedKeys,
  savedFields,
  onChange,
}: {
  draft: Settings;
  builtIns: Question[];
  publishedKeys: string[];
  savedFields: Question[];
  onChange: (draft: Settings) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState('');
  const field = draft.fields[selected];
  const saved = savedFields[selected]?.key === field?.key;
  const builtin = saved ? builtIns.find((item) => item.key === field?.key) : undefined;
  const update = (value: Partial<Question>) =>
    onChange({
      ...draft,
      fields: draft.fields.map((item, index) =>
        index === selected ? { ...item, ...value } : item,
      ),
    });
  function add() {
    let number = draft.fields.length + 1;
    while (draft.fields.some((item) => item.key === `custom.question_${number}`)) number++;
    onChange({
      ...draft,
      fields: [
        ...draft.fields,
        {
          key: `custom.question_${number}`,
          label: '새 질문',
          scope: 'CASE',
          docTypes: [],
          type: 'LONG_TEXT',
          required: false,
          askRole: 'APPLICANT',
          hint: '',
        },
      ],
    });
    setSelected(draft.fields.length);
    setSearch('');
  }
  return (
    <div className="qgrid configuration-questions">
      <div className="qlist-wrap">
        <Field label="질문 검색" htmlFor="question-search">
          <input
            id="question-search"
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <ol className="qlist">
          {draft.fields.map((item, index) =>
            !`${item.label} ${item.key}`.includes(search) ? null : (
              <li key={index}>
                <button
                  type="button"
                  aria-pressed={selected === index}
                  onClick={() => setSelected(index)}
                >
                  <span className="qn">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    <b>{item.label || '문구 입력 필요'}</b>
                    <span className="help">
                      {roleLabels[item.askRole]} · {item.required ? '필수' : '선택'}
                    </span>
                  </span>
                </button>
              </li>
            ),
          )}
        </ol>
        {!draft.fields.some((item) => `${item.label} ${item.key}`.includes(search)) && (
          <p>검색 결과가 없습니다.</p>
        )}
        <button
          type="button"
          className="btn btn-block"
          onClick={add}
          disabled={draft.fields.length >= 200}
        >
          질문 추가
        </button>
      </div>
      {field && (
        <div className="card configuration-question-editor">
          <h2 className="h-panel">질문 설정: {field.label || '새 질문'}</h2>
          <Field label="질문 문구" htmlFor="question-label">
            <input
              className="input"
              id="question-label"
              maxLength={200}
              value={field.label}
              onChange={(event) => update({ label: event.target.value })}
            />
          </Field>
          <Field
            label="저장 키"
            htmlFor="question-key"
            hint="게시된 저장 키는 답변과 연결되어 바꿀 수 없습니다. 다른 값을 받으려면 새 질문을 추가하세요."
          >
            <input
              className="input"
              id="question-key"
              aria-describedby="question-key-hint"
              maxLength={100}
              readOnly={(saved && publishedKeys.includes(field.key)) || !!builtin}
              value={field.key}
              onChange={(event) => update({ key: event.target.value })}
            />
          </Field>
          <Field label="도움말" htmlFor="question-hint">
            <textarea
              className="input"
              id="question-hint"
              maxLength={2000}
              value={field.hint ?? ''}
              onChange={(event) => update({ hint: event.target.value })}
            />
          </Field>
          {builtin && (
            <p className="help" id="question-contract">
              기본 질문은 신청서·통신 정보와 연결되어 형식·역할·범위·적용 서류를 유지합니다.
            </p>
          )}
          <div className="settings-two">
            <Field label="응답 형식" htmlFor="question-type">
              <select
                className="input"
                id="question-type"
                disabled={!!builtin}
                value={field.type}
                onChange={(event) => update({ type: event.target.value as Question['type'] })}
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="작성 역할" htmlFor="question-role">
              <select
                className="input"
                id="question-role"
                disabled={!!builtin}
                value={field.askRole}
                onChange={(event) => update({ askRole: event.target.value as Question['askRole'] })}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="답변 범위" htmlFor="question-scope">
            <select
              className="input"
              id="question-scope"
              disabled={!!builtin}
              value={field.scope}
              onChange={(event) => update({ scope: event.target.value as Question['scope'] })}
            >
              <option value="CASE">사업 공통 정보</option>
              <option value="REQUEST">서류별 정보</option>
            </select>
          </Field>
          <fieldset disabled={!!builtin}>
            <legend>적용 서류</legend>
            <p className="help">
              공통 질문은 선택하지 않으면 모든 서류에 적용합니다. 서류별 질문은 하나 이상
              선택하세요.
            </p>
            {draft.docTypes.map((doc) => (
              <label className="check" key={doc.code}>
                <input
                  type="checkbox"
                  checked={field.docTypes.includes(doc.code)}
                  onChange={(event) =>
                    update({
                      docTypes: event.target.checked
                        ? [...field.docTypes, doc.code]
                        : field.docTypes.filter((code) => code !== doc.code),
                    })
                  }
                />
                <span>{doc.name}</span>
              </label>
            ))}
          </fieldset>
          <label className="check">
            <input
              type="checkbox"
              disabled={builtin?.required}
              checked={field.required}
              onChange={(event) => update({ required: event.target.checked })}
            />
            <span>필수 질문{builtin?.required ? ' · 기본 필수 항목' : ''}</span>
          </label>
          {!builtin && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                onChange({
                  ...draft,
                  fields: draft.fields.filter((_, index) => index !== selected),
                });
                setSelected(0);
              }}
            >
              초안에서 질문 제외
            </button>
          )}
        </div>
      )}
    </div>
  );
}
