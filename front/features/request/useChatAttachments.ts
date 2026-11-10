'use client';

import { useRef, useState } from 'react';
import { validateUploadFiles } from '@/lib/uploadDraft';
import type { BusinessCase } from './types';
import { useAnalysis } from './useRequests';

export interface ChatAttachment {
  id: number;
  file: File;
  status: 'selected' | 'pending' | 'done' | 'failed';
  summary: string;
  error: string;
  createdAt: number;
}

/** 첨부는 명시적 요청 후 분석하며 결과를 정식 답변으로 자동 적용하지 않는다. */
export function useChatAttachments(businessCase: BusinessCase) {
  const analysis = useAnalysis();
  const [items, setItems] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const running = useRef(false);
  const sequence = useRef(0);
  const run = async (batch: ChatAttachment[]) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      for (const item of batch) {
        setItems((old) =>
          old.map((entry) =>
            entry.id === item.id ? { ...entry, status: 'pending', error: '' } : entry,
          ),
        );
        try {
          const result = await analysis.mutateAsync({
            caseId: businessCase.id,
            expectedRevision: businessCase.revision,
            text: businessCase.description,
            file: item.file,
          });
          setItems((old) =>
            old.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: 'done',
                    summary: result.suggestions.map((suggestion) => suggestion.value).join('\n'),
                  }
                : entry,
            ),
          );
        } catch (cause) {
          setItems((old) =>
            old.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: 'failed',
                    error: cause instanceof Error ? cause.message : '문서를 분석하지 못했습니다.',
                  }
                : entry,
            ),
          );
        }
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const attach = async (files: File[]) => {
    if (running.current || !files.length) return;
    const message = validateUploadFiles(files);
    setError(message);
    if (message) return;
    const batch: ChatAttachment[] = files.map((file) => ({
      id: ++sequence.current,
      file,
      status: 'selected',
      summary: '',
      error: '',
      createdAt: Date.now(),
    }));
    setItems((old) => [...old, ...batch]);
  };
  return { items, busy, error, attach, retry: (item: ChatAttachment) => run([item]) };
}
