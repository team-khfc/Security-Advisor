'use client';

import { useSyncExternalStore } from 'react';

const drafts = new Map<string, Map<string, unknown>>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

/** 인증된 계정과 자원별로 분리한 입력만 탭 메모리에 보관한다. */
export function getInputDraft<T>(actorId: string, key: string): T | undefined {
  return drafts.get(actorId)?.get(key) as T | undefined;
}

/** 비밀번호·세션·권한은 이 저장소에 넣지 않으며 브라우저 영구 저장을 사용하지 않는다. */
export function setInputDraft<T>(actorId: string, key: string, value: T): void {
  if (!actorId || !key) return;
  const actorDrafts = drafts.get(actorId) ?? new Map<string, unknown>();
  actorDrafts.set(key, value);
  drafts.set(actorId, actorDrafts);
  notify();
}

/** 저장 성공 후 해당 화면의 미저장 입력만 해제한다. */
export function clearInputDraft(actorId: string, key: string): void {
  const actorDrafts = drafts.get(actorId);
  if (!actorDrafts?.delete(key)) return;
  if (!actorDrafts.size) drafts.delete(actorId);
  notify();
}

/** 현재 계정의 미저장 입력 여부만 제공하며 다른 계정의 내용은 반환하지 않는다. */
export function hasInputDrafts(actorId: string): boolean {
  return Boolean(drafts.get(actorId)?.size);
}

/** 계정이 바뀌면 새 키의 값만 즉시 구독하여 이전 입력이 한 프레임도 표시되지 않게 한다. */
export function useInputDraft<T>(actorId: string, key?: string) {
  const draft = useSyncExternalStore(
    subscribe,
    () => (key ? getInputDraft<T>(actorId, key) : undefined),
    () => undefined,
  );
  return {
    draft,
    saveDraft: (value: T) => {
      if (key) setInputDraft(actorId, key, value);
    },
    clearDraft: () => {
      if (key) clearInputDraft(actorId, key);
    },
  };
}

/** 로그아웃·화면 이탈 안내에 사용할 현재 계정의 변경 여부를 구독한다. */
export function useHasInputDrafts(actorId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasInputDrafts(actorId),
    () => false,
  );
}
