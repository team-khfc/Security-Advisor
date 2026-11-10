import { useEffect, useState, type FormEvent } from 'react';
import { Field, Modal, Notice } from '@/components/ui';
import { ApiError, requestJson } from '@/lib/httpClient';
import { usePublication } from '@/features/configuration/useConfiguration';
import { PrivateContent, SnippetContent } from './KnowledgeContent';
import {
  blankContext,
  blankSnippet,
  contextSchema,
  snippetSchema,
  kindLabels,
  roleLabels,
  validateContext,
  validateSnippet,
  type Snippet,
  type PrivateContext,
} from './types';

/** 원문은 화면 메모리에만 두며 충돌 시 사용자가 최신본 교체를 선택하기 전까지 보존한다. */
export function KnowledgeItemEditor({
  kind,
  initial,
  onClose,
  onSaved,
}: {
  kind: 'public' | 'private';
  initial: Snippet | PrivateContext | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [snippet, setSnippet] = useState<Snippet>(() =>
    initial && 'knowledgeSnippetId' in initial ? initial : blankSnippet(),
  );
  const [context, setContext] = useState<PrivateContext>(() =>
    initial && 'privateContextId' in initial ? initial : blankContext(),
  );
  const [attributes, setAttributes] = useState<[string, string][]>(() =>
    initial && 'attributes' in initial ? Object.entries(initial.attributes) : [['', '']],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<Snippet | PrivateContext | null>(null);
  const [discard, setDiscard] = useState(false);
  const publication = usePublication('current');
  const normalizedContext = {
    ...context,
    aliases: context.aliases.map((a) => a.trim()).filter(Boolean),
    attributes: Object.fromEntries(attributes),
  };
  const item = kind === 'public' ? snippet : normalizedContext;
  const [baseline, setBaseline] = useState(() => JSON.stringify(item));
  const dirty = JSON.stringify(item) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  function fail(error: unknown) {
    if (error instanceof ApiError && error.status === 409) setConflict(true);
    setErrors([
      error instanceof Error ? error.message : '저장하지 못했습니다. 다시 확인해 주세요.',
    ]);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const problems =
      kind === 'public' ? validateSnippet(snippet) : validateContext(normalizedContext);
    if (
      kind === 'private' &&
      new Set(attributes.map(([key]) => key.trim())).size !== attributes.length
    )
      problems.push('속성 이름은 중복될 수 없습니다.');
    if (problems.length) {
      setErrors(problems);
      return;
    }
    if (conflict) return;
    setBusy(true);
    setErrors([]);
    try {
      const id = kind === 'public' ? snippet.knowledgeSnippetId : context.privateContextId;
      await requestJson(
        `/api/${kind === 'public' ? 'knowledge-snippets' : 'private-contexts'}${id ? `/${id}` : ''}`,
        {
          method: id ? 'PUT' : 'POST',
          body: { ...item, expectedRevision: id ? item.revision : null },
        },
      );
      onSaved();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function loadLatest() {
    setBusy(true);
    try {
      const id = kind === 'public' ? snippet.knowledgeSnippetId : context.privateContextId;
      const value = await requestJson(
        `/api/knowledge-drafts/current/${kind === 'public' ? 'snippets' : 'private-contexts'}/${id}`,
      );
      setLatest(kind === 'public' ? snippetSchema.parse(value) : contextSchema.parse(value));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={`${kind === 'public' ? '공개 지식' : '기관 비공개 정보'} ${initial ? '편집' : '추가'}`}
      onClose={() => {
        if (!busy) {
          if (dirty) setDiscard(true);
          else onClose();
        }
      }}
    >
      <p>
        초안 저장 후 게시해야 새 사업에 반영됩니다. 기존 사업은 생성 당시 지식 게시본을 유지합니다.
      </p>
      {kind === 'private' && (
        <Notice tone="warning">
          신청자에게는 제공하지 않습니다. 비밀번호·API 키는 등록하지 마세요. 시연에는 합성 정보만
          입력하세요.
        </Notice>
      )}
      {errors.length > 0 && (
        <div role="alert">
          <Notice tone="danger">
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
      {conflict && (
        <Notice tone="warning">
          <p>
            다른 관리자가 수정했습니다. 내 입력은 보존했습니다. 최신 초안을 확인한 뒤 다시
            편집하세요.
          </p>
          <button type="button" className="btn" disabled={busy} onClick={() => void loadLatest()}>
            최신 초안 확인
          </button>
        </Notice>
      )}
      {latest && (
        <section className="card">
          <h3>서버 최신 초안</h3>
          {'knowledgeSnippetId' in latest ? (
            <SnippetContent item={latest} />
          ) : (
            <PrivateContent item={latest} />
          )}
          <p>아래 내 입력과 비교하세요. 필요한 값은 먼저 복사하세요.</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if ('knowledgeSnippetId' in latest) setSnippet(latest);
              else {
                setContext(latest);
                setAttributes(Object.entries(latest.attributes));
              }
              setLatest(null);
              setConflict(false);
              setBaseline(JSON.stringify(latest));
              setErrors([]);
            }}
          >
            내 입력을 대체하고 최신본으로 편집
          </button>
          <button type="button" className="btn btn-tertiary" onClick={() => setLatest(null)}>
            최신본 닫기
          </button>
        </section>
      )}
      <form onSubmit={save} className="knowledge-form">
        <fieldset disabled={busy}>
          <legend className="sr-only">{conflict ? '보존된 내 입력' : '지식 초안 입력'}</legend>
          {kind === 'public' ? (
            <>
              <Field label="자료명" htmlFor="knowledge-title">
                <input
                  id="knowledge-title"
                  className="input"
                  value={snippet.sourceTitle}
                  maxLength={200}
                  onChange={(e) => setSnippet({ ...snippet, sourceTitle: e.target.value })}
                />
              </Field>
              <div className="knowledge-grid">
                <Field label="판본" htmlFor="knowledge-version">
                  <input
                    id="knowledge-version"
                    className="input"
                    value={snippet.sourceVersion}
                    maxLength={50}
                    onChange={(e) => setSnippet({ ...snippet, sourceVersion: e.target.value })}
                  />
                </Field>
                <Field
                  label="출처 위치"
                  htmlFor="knowledge-locator"
                  hint="문서의 장·절·페이지 또는 공개 원문 주소"
                >
                  <input
                    id="knowledge-locator"
                    className="input"
                    value={snippet.sourceLocator}
                    maxLength={200}
                    onChange={(e) => setSnippet({ ...snippet, sourceLocator: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="발췌 본문" htmlFor="knowledge-body">
                <textarea
                  id="knowledge-body"
                  className="input"
                  rows={6}
                  value={snippet.body}
                  maxLength={4000}
                  onChange={(e) => setSnippet({ ...snippet, body: e.target.value })}
                />
              </Field>
              <fieldset>
                <legend>적용 질문</legend>
                {publication.isError && <p role="alert">질문 목록을 불러오지 못했습니다.</p>}
                <div className="knowledge-options">
                  {publication.data?.fieldSchema.fields.map((field) => (
                    <label key={field.key}>
                      <input
                        type="checkbox"
                        checked={snippet.fieldKeys.includes(field.key)}
                        onChange={(e) =>
                          setSnippet({
                            ...snippet,
                            fieldKeys: e.target.checked
                              ? [...snippet.fieldKeys, field.key]
                              : snippet.fieldKeys.filter((key) => key !== field.key),
                          })
                        }
                      />{' '}
                      {field.label} <span className="help">({field.key})</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>적용 서류</legend>
                <p className="help">선택하지 않으면 모든 서류에 적용합니다.</p>
                {publication.data?.fieldSchema.docTypes.map((doc) => (
                  <label className="knowledge-option" key={doc.code}>
                    <input
                      type="checkbox"
                      checked={snippet.docTypes.includes(doc.code)}
                      onChange={(e) =>
                        setSnippet({
                          ...snippet,
                          docTypes: e.target.checked
                            ? [...snippet.docTypes, doc.code]
                            : snippet.docTypes.filter((code) => code !== doc.code),
                        })
                      }
                    />{' '}
                    {doc.name}
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <>
              <div className="knowledge-grid">
                <Field label="정보 이름" htmlFor="context-name">
                  <input
                    id="context-name"
                    className="input"
                    value={context.name}
                    maxLength={200}
                    onChange={(e) => setContext({ ...context, name: e.target.value })}
                  />
                </Field>
                <Field label="정보 종류" htmlFor="context-kind">
                  <select
                    id="context-kind"
                    className="input"
                    value={context.kind}
                    onChange={(e) =>
                      setContext({ ...context, kind: e.target.value as PrivateContext['kind'] })
                    }
                  >
                    {Object.entries(kindLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field
                label="별칭"
                htmlFor="context-aliases"
                hint="한 줄에 하나씩 입력합니다(최대 20개)."
              >
                <textarea
                  id="context-aliases"
                  className="input"
                  value={context.aliases.join('\n')}
                  onChange={(e) => setContext({ ...context, aliases: e.target.value.split('\n') })}
                />
              </Field>
              <fieldset>
                <legend>정보 속성</legend>
                {attributes.map(([key, value], index) => (
                  <div className="knowledge-attribute" key={index}>
                    <Field label={`속성 ${index + 1} 이름`} htmlFor={`attribute-key-${index}`}>
                      <input
                        className="input"
                        id={`attribute-key-${index}`}
                        value={key}
                        maxLength={100}
                        onChange={(e) =>
                          setAttributes(
                            attributes.map((row, i) =>
                              i === index ? [e.target.value, row[1]] : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={`속성 ${index + 1} 값`} htmlFor={`attribute-value-${index}`}>
                      <input
                        className="input"
                        id={`attribute-value-${index}`}
                        value={value}
                        maxLength={2000}
                        onChange={(e) =>
                          setAttributes(
                            attributes.map((row, i) =>
                              i === index ? [row[0], e.target.value] : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <button
                      className="btn btn-tertiary"
                      type="button"
                      aria-label={`속성 ${index + 1} 제외`}
                      onClick={() => setAttributes(attributes.filter((_, i) => i !== index))}
                    >
                      제외
                    </button>
                  </div>
                ))}
                <button
                  className="btn"
                  type="button"
                  disabled={attributes.length >= 50}
                  onClick={() => setAttributes([...attributes, ['', '']])}
                >
                  속성 추가
                </button>
              </fieldset>
              <fieldset>
                <legend>열람 역할</legend>
                {Object.entries(roleLabels).map(([role, label]) => (
                  <label className="knowledge-option" key={role}>
                    <input
                      type="checkbox"
                      checked={context.visibleRoles.includes(role as keyof typeof roleLabels)}
                      onChange={(e) =>
                        setContext({
                          ...context,
                          visibleRoles: e.target.checked
                            ? [...context.visibleRoles, role as keyof typeof roleLabels]
                            : context.visibleRoles.filter((r) => r !== role),
                        })
                      }
                    />{' '}
                    {label}
                  </label>
                ))}
                <p className="help">
                  기관 관리자는 관리 권한으로 전체 내용을 확인합니다. 게시 시 열람 역할 축소·사용
                  중지는 기존 사업에도 적용됩니다.
                </p>
              </fieldset>
              <Field label="관리 메모" htmlFor="context-note">
                <textarea
                  id="context-note"
                  className="input"
                  value={context.note ?? ''}
                  maxLength={2000}
                  onChange={(e) => setContext({ ...context, note: e.target.value })}
                />
              </Field>
            </>
          )}
          <label className="knowledge-option">
            <input
              type="checkbox"
              checked={item.active}
              onChange={(e) =>
                kind === 'public'
                  ? setSnippet({ ...snippet, active: e.target.checked })
                  : setContext({ ...context, active: e.target.checked })
              }
            />{' '}
            게시 후 사용
          </label>
        </fieldset>
        <div className="btn-row">
          <button className="btn btn-primary" type="submit" disabled={busy || conflict}>
            {busy ? '저장 중…' : '초안 저장'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => (dirty ? setDiscard(true) : onClose())}
          >
            닫기
          </button>
        </div>
      </form>
      {discard && (
        <Notice tone="warning">
          <p>저장하지 않은 입력을 닫을까요?</p>
          <button type="button" className="btn" onClick={onClose}>
            입력을 버리고 닫기
          </button>
          <button type="button" className="btn btn-tertiary" onClick={() => setDiscard(false)}>
            계속 편집
          </button>
        </Notice>
      )}
    </Modal>
  );
}
