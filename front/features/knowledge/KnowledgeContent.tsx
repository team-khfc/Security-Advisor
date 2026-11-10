import type { KnowledgeComparison, PrivateContext, Snippet } from './types';
import { kindLabels, roleLabels } from './types';

export function SnippetContent({ item }: { item: Snippet }) {
  return (
    <div>
      <h3>{item.sourceTitle}</h3>
      <p>
        {item.sourceVersion} · {item.sourceLocator} · {item.active ? '사용' : '사용 중지'}
      </p>
      <p className="knowledge-text">{item.body}</p>
      <p className="help">적용 질문: {item.fieldKeys.join(', ')}</p>
    </div>
  );
}
export function PrivateContent({ item }: { item: PrivateContext }) {
  return (
    <div>
      <h3>{item.name}</h3>
      <p>
        {kindLabels[item.kind]} · {item.active ? '사용' : '사용 중지'}
      </p>
      <p>열람: {item.visibleRoles.map((role) => roleLabels[role]).join(', ')}</p>
      <p>별칭: {item.aliases.join(', ') || '없음'}</p>
      <dl>
        {Object.entries(item.attributes).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd className="knowledge-text">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="knowledge-text">{item.note}</p>
    </div>
  );
}
export function KnowledgeChanges({ comparison }: { comparison: KnowledgeComparison }) {
  if (!comparison.changes.length) return <p>게시본과 다른 내용이 없습니다.</p>;
  return (
    <ul className="configuration-changes">
      {comparison.changes.map((change) => (
        <li key={`${change.kind}-${change.itemId}`}>
          <strong>
            {change.kind === 'PRIVATE' ? '비공개 정보' : '공개 지식'} · {change.label}
          </strong>
          <dl>
            <dt>변경 전</dt>
            <dd>{change.before}</dd>
            <dt>변경 후</dt>
            <dd>{change.after}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
