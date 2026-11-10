'use client';

import { useState } from 'react';
import { Badge, ErrorState, LoadingState, Notice, PageHeading } from '@/components/ui';
import { useSession } from '@/features/auth';
import { useConfiguration } from './useConfiguration';
import { ConfigurationEditor } from './ConfigurationEditor';

/** 관리자 전용 편집 화면. 다른 역할에서는 초안 조회 자체를 시작하지 않는다. */
export function ConfigurationPage() {
  const session = useSession();
  if (session.isPending) return <LoadingState />;
  if (session.data?.member.role !== 'ADMIN')
    return <Notice tone="warning">기관 관리자만 설정을 확인할 수 있습니다.</Notice>;
  return <ConfigurationLoader key={session.data.member.id} />;
}

function ConfigurationLoader() {
  const query = useConfiguration();
  const [retry, setRetry] = useState(0);
  if (query.isPending) return <LoadingState />;
  if (!query.data)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => {
          setRetry(retry + 1);
          void query.refetch();
        }}
      />
    );
  return (
    <>
      <PageHeading
        title="기관 설정"
        description="질문과 처리 기한을 초안으로 저장하고, 변경 내용을 검토한 뒤 게시합니다."
      />
      <div className="org-bar">
        <div className="verbar">
          <Badge tone="success">게시본 v{query.data.currentPublishedVersion}</Badge>
          <Badge>새 사업 건부터 적용</Badge>
        </div>
        <p className="help">기존 사업 건과 추가 신청은 생성 당시의 게시본을 유지합니다.</p>
      </div>
      <ConfigurationEditor
        initial={query.data}
        reload={async () => {
          const result = await query.refetch();
          if (!result.data || result.error)
            throw result.error ?? new Error('최신 초안을 불러오지 못했습니다.');
          return result.data;
        }}
      />
    </>
  );
}
