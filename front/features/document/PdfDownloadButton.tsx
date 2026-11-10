'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestPdf } from '@/lib/httpClient';
import { Notice } from '@/components/ui';
import type { GeneratedDocument } from './types';

/** 미리보기에서 선택한 문서 ID를 그대로 사용한다. 파일 재시도는 문서를 새로 만들지 않는다. */
export function PdfDownloadButton({
  getDocument,
  disabled = false,
}: {
  getDocument: () => Promise<GeneratedDocument>;
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const download = useMutation({
    mutationFn: async () => {
      const doc = await getDocument();
      const file = await client.fetchQuery({
        queryKey: ['document-pdf', doc.generatedDocumentId],
        staleTime: Infinity,
        retry: false,
        queryFn: () =>
          requestPdf(`/api/generated-documents/${doc.generatedDocumentId}/download?format=PDF`),
      });
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName ?? `문서_${doc.generatedDocumentId}_v${doc.version}.pdf`;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      return { size: `${(file.blob.size / 1024).toFixed(1)}KB`, version: doc.version };
    },
  });
  return (
    <div className="pdf-download">
      <button
        type="button"
        className="btn btn-sm"
        disabled={disabled}
        aria-disabled={download.isPending || undefined}
        aria-busy={download.isPending || undefined}
        onClick={() => {
          if (!download.isPending) download.mutate();
        }}
      >
        {download.isPending ? 'PDF 준비 중…' : 'PDF 다운로드'}
      </button>
      {download.error && <Notice tone="danger">{download.error.message}</Notice>}
      {download.isSuccess && (
        <span className="help" role="status">
          PDF 다운로드 준비 완료 · 문서 v{download.data.version} · {download.data.size}
        </span>
      )}
    </div>
  );
}
