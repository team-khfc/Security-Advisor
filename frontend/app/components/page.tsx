import { AppShell } from '@/components/layout';
import { Heading, Badge, Notice, Stepper, Icon } from '@/components/ui';
/** 공통 상태와 입력 디자인만 비교하도록 업무 변경 없이 예시를 보여 준다. */
export default function ComponentsPage() {
  return (
    <AppShell preview institutionName="디지털혁신기관 (합성)" role="ADMIN">
      <Heading
        title="공통 컴포넌트"
        description="지정 디자인시안의 색상·서체·여백과 상호작용 상태를 확인합니다."
      />
      <section className="sf-panel">
        <h2>상태와 출처</h2>
        <div className="inline-actions">
          <Badge tone="gray">작성 중</Badge>
          <Badge tone="blue">사전 협의 중</Badge>
          <Badge tone="amber">AI 제안 · 미확정</Badge>
          <Badge tone="green">담당자 확인</Badge>
        </div>
        <Notice>출처가 없는 값은 담당자 확인 필요로 표시합니다.</Notice>
        <Notice error>입력 내용을 유지했습니다. 오류를 확인해 주세요.</Notice>
        <div className="inline-actions">
          <button className="button primary" disabled>
            주요 실행 (비활성)
            <Icon name="arrow" />
          </button>
          <button className="button" disabled>
            보조 실행 (비활성)
          </button>
        </div>
      </section>
      <div style={{ marginTop: 24 }}>
        <Stepper current={1} />
      </div>
      <section className="sf-panel">
        <h2>입력과 도움말</h2>
        <div className="sf-field">
          <label htmlFor="sample-input">
            확인 항목 <span className="required">필수</span>
          </label>
          <p className="field-hint" id="sample-hint">
            왜 필요한지와 모르는 경우의 확인 방법을 안내합니다.
          </p>
          <input
            id="sample-input"
            aria-describedby="sample-hint"
            placeholder="읽기전용 시안의 비활성 입력"
            disabled
          />
        </div>
      </section>
    </AppShell>
  );
}
