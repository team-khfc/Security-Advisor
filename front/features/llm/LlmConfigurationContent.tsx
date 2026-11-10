import { purposeLabels, type LlmValues, type LlmComparison } from './configurationTypes';

/** 원문 키 없이 구성의 비교 가능한 값만 표시한다. */
export function LlmConfigurationContent({ values }: { values: LlmValues }) {
  return (
    <dl className="llm-values">
      <div>
        <dt>구성 이름</dt>
        <dd>{values.name}</dd>
      </div>
      <div>
        <dt>연결 주소</dt>
        <dd>{values.baseUrl}</dd>
      </div>
      <div>
        <dt>모델</dt>
        <dd>{values.model}</dd>
      </div>
      <div>
        <dt>키 참조</dt>
        <dd>{values.apiKeyEnv}</dd>
      </div>
      <div>
        <dt>용도</dt>
        <dd>{values.purposes.map((p) => purposeLabels[p]).join(', ')}</dd>
      </div>
      <div>
        <dt>사용 상태</dt>
        <dd>{values.active ? '사용' : '사용 중지'}</dd>
      </div>
      <div>
        <dt>우선순위</dt>
        <dd>{values.priority}</dd>
      </div>
      <div>
        <dt>응답 다양성</dt>
        <dd>{values.temperature}</dd>
      </div>
      <div>
        <dt>응답 토큰 한도</dt>
        <dd>{values.maxTokens}</dd>
      </div>
      <div>
        <dt>시간 제한</dt>
        <dd>{values.timeoutSeconds}초</dd>
      </div>
    </dl>
  );
}
/** 서버가 검증한 변경 전후 값을 나란히 보여 준다. */
export function LlmChanges({ comparison }: { comparison: LlmComparison }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <caption>모델 구성 변경 비교</caption>
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col">현재 값</th>
            <th scope="col">적용할 값</th>
          </tr>
        </thead>
        <tbody>
          {comparison.changes.map((change) => (
            <tr key={change.field}>
              <th scope="row">{change.label}</th>
              <td>{change.before}</td>
              <td>{change.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
