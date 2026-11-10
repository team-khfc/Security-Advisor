export type Role = 'APPLICANT' | 'INFRA' | 'SECURITY' | 'ADMIN';

export interface Actor {
  id: string;
  username: string;
  displayName: string;
  department: string;
  role: Role;
  active: boolean;
}

export interface Session {
  member: Actor;
  expiresAt: string | null;
  mock: boolean;
}

export interface Installation {
  institutionName: string;
  institutionCode: string;
  mode: 'mock' | 'api';
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
}

export const ROLE_LABELS: Record<Role, string> = {
  APPLICANT: '일반 사용자',
  INFRA: 'ICT인프라 담당자',
  SECURITY: '정보보안 담당자',
  ADMIN: '기관 관리자',
};
