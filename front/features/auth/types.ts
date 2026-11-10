import { z } from 'zod';

export type { Actor, Role, Session } from '@/lib/types';

export const actorSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  department: z.string(),
  role: z.enum(['APPLICANT', 'INFRA', 'SECURITY', 'ADMIN']),
  active: z.boolean(),
});

export const sessionSchema = z.object({
  member: actorSchema,
  expiresAt: z.string().nullable(),
  mock: z.boolean(),
});

export const loginInputSchema = z.object({
  username: z.string().trim().min(1, '아이디를 입력해 주세요.').max(50),
  password: z.string().min(1, '비밀번호를 입력해 주세요.').max(200),
});

export const signupInputSchema = z.object({
  username: z
    .string()
    .trim()
    .min(4, '아이디는 4자 이상 입력해 주세요.')
    .max(50, '아이디는 50자 이하로 입력해 주세요.')
    .regex(/^[a-z0-9][a-z0-9._-]*$/, '영문 소문자·숫자·마침표·밑줄·하이픈만 쓸 수 있습니다.'),
  password: z
    .string()
    .min(8, '비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.')
    .max(72, '비밀번호는 72바이트 이하로 입력해 주세요.')
    .regex(/^(?=.*[A-Za-z])(?=.*\d).*$/, '비밀번호에 영문과 숫자를 모두 넣어 주세요.')
    .refine(
      (value) => new TextEncoder().encode(value).length <= 72,
      '비밀번호는 72바이트 이하입니다.',
    ),
  displayName: z.string().trim().min(1, '표시 이름을 입력해 주세요.').max(100),
  department: z.string().trim().max(100).default(''),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type SignupInput = z.infer<typeof signupInputSchema>;
