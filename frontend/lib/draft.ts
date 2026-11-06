const drafts = new Map<string, unknown>();
let activeScope: string | undefined;

/** 다른 사용자나 기관으로 전환되면 기존 편집 내용을 새 신원에 노출하지 않는다. */
export function activateDraftScope(scope: string): void {
  if (activeScope !== undefined && activeScope !== scope) drafts.clear();
  activeScope = scope;
}
/** 서버 저장과 구분된 동일 탭의 임시 입력만 복구한다. */
export function readDraft<T>(scope: string, key: string, fallback: T): T {
  return (drafts.get(`${scope}:${key}`) as T | undefined) ?? fallback;
}
/** 민감할 수 있는 입력을 localStorage·쿠키 대신 탭 메모리에만 보관한다. */
export function writeDraft<T>(scope: string, key: string, value: T): void {
  drafts.set(`${scope}:${key}`, value);
}
/** 저장한 입력이나 사용자가 폐기한 임시 초안만 해당 식별자로 지운다. */
export function removeDraft(scope: string, key: string): void {
  drafts.delete(`${scope}:${key}`);
}
/** 명시적 로그아웃에서는 탭에 보관한 모든 편집 내용을 폐기한다. */
export function clearDrafts(): void {
  drafts.clear();
  activeScope = undefined;
}
