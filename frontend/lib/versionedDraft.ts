/** 기준값을 보존해 외부 변경이 미저장 입력을 덮어쓰지 않도록 한다. */
export interface VersionedDraft<T> {
  revision: number;
  value: T;
  baseline: string;
}
/** 저장 기준값을 함께 기록해 실제 미저장 변경과 오래된 조회 상태를 구분한다. */
export function createVersionedDraft<T>(revision: number, value: T): VersionedDraft<T> {
  return { revision, value, baseline: JSON.stringify(value) };
}
/** 다른 편집폼의 저장 뒤 미편집 초안만 동기화하고 미저장 변경의 비교 기준은 보존한다. */
export function reconcileVersionedDraft<T>(
  draft: VersionedDraft<T>,
  revision: number,
  value: T,
): VersionedDraft<T> {
  const changedLocally = JSON.stringify(draft.value) !== draft.baseline;
  if (changedLocally) return draft;
  if (draft.revision === revision && draft.baseline === JSON.stringify(value)) return draft;
  return createVersionedDraft(revision, value);
}
