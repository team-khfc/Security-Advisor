const selectedFiles = new Map<string, File[]>();

/** 파일 선택은 탭 메모리에만 보관하고 명시적 분석 시에만 전송한다. */
export function rememberUpload(actorId: string, caseId: string, file: File | File[]): void {
  selectedFiles.set(`${actorId}:${caseId}`, Array.isArray(file) ? [...file] : [file]);
}

/** 다른 로그인 사용자의 선택 파일은 복원하지 않는다. */
export function getUpload(actorId: string, caseId: string): File | undefined {
  return selectedFiles.get(`${actorId}:${caseId}`)?.[0];
}

/** 분석을 마친 파일의 메모리 참조를 해제한다. */
export function forgetUpload(actorId: string, caseId: string): void {
  selectedFiles.delete(`${actorId}:${caseId}`);
  initialAnalysisReports.delete(`${actorId}:${caseId}`);
}

/** 선택한 문서 전체를 다음 화면에서 복원한다. */
export function getUploads(actorId: string, caseId: string): File[] {
  return [...(selectedFiles.get(`${actorId}:${caseId}`) ?? [])];
}

/** 기존 단일 파일 API의 한도를 유지하면서 여러 문서의 선택을 검증한다. */
export function validateUploadFiles(files: readonly File[]): string {
  if (files.length > 3) return '파일은 최대 3개까지 선택해 주세요.';
  if (files.some((file) => !/\.(pdf|hwpx|docx|txt)$/i.test(file.name)))
    return 'PDF, HWPX, DOCX, TXT 파일을 선택해 주세요.';
  if (files.some((file) => file.size === 0)) return '빈 파일은 선택할 수 없습니다.';
  if (files.some((file) => file.size > 20 * 1024 * 1024))
    return '파일당 최대 20MB까지 선택할 수 있습니다.';
  if (files.reduce((total, file) => total + file.size, 0) > 60 * 1024 * 1024)
    return '파일 용량은 합계 60MB 이하로 선택해 주세요.';
  return '';
}

interface InitialAnalysisReport {
  total: number;
  failures: { name: string; message: string }[];
}
const initialAnalysisReports = new Map<string, InitialAnalysisReport>();

/** 작성 시작 시 수행한 분석 결과를 같은 계정의 인터뷰 화면에 전달한다. */
export function rememberInitialAnalysis(
  actorId: string,
  caseId: string,
  report: InitialAnalysisReport,
): void {
  initialAnalysisReports.set(`${actorId}:${caseId}`, report);
}

/** 초기 분석 실패를 숨기지 않고 재시도 경로와 함께 안내한다. */
export function getInitialAnalysis(
  actorId: string,
  caseId: string,
): InitialAnalysisReport | undefined {
  return initialAnalysisReports.get(`${actorId}:${caseId}`);
}
