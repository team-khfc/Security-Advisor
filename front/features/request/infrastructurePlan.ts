import { z } from 'zod';
export const connectionSchema = z.object({
  id: z.string().min(1).max(100),
  sourceSystem: z.string().max(200),
  sourceAddress: z.string().max(4000),
  sourceZone: z
    .string()
    .refine(
      (v) => ['', '외부', 'DMZ', '내부망', '클라우드', '기타'].includes(v),
      '망 구간을 선택해 주세요.',
    ),
  destinationSystem: z.string().max(200),
  destinationAddress: z.string().max(4000),
  destinationZone: z
    .string()
    .refine(
      (v) => ['', '외부', 'DMZ', '내부망', '클라우드', '기타'].includes(v),
      '망 구간을 선택해 주세요.',
    ),
  protocol: z.string().max(20),
  port: z.string().max(500),
  purpose: z.string().max(1000),
  direction: z
    .string()
    .refine((v) => ['', '인바운드', '아웃바운드', '양방향'].includes(v), '방향을 선택해 주세요.'),
  startDate: z.string(),
  endDate: z.string(),
  sourceServerId: z.string().nullable().optional(),
  destinationServerId: z.string().nullable().optional(),
});
export const serverLabels = {
  name: '서버·시스템명',
  purpose: '서버 용도',
  environment: '운영 형태',
  cpu: 'CPU (코어·vCPU)',
  memory: '메모리 (GB 등)',
  storage: '저장공간 (GB·TB 등)',
  os: '운영체제·버전',
  database: 'DB·버전',
  address: 'IP·CIDR',
  zone: '망 구간',
} as const;
export const operationLabels = {
  network: '네트워크 구성·망 분리',
  management: '관리 접속 경로',
  owner: '운영 담당·책임',
  backup: '백업·복구',
  redundancy: '이중화',
  monitoring: '모니터링',
} as const;
export const infraCheckLabels = {
  serverEnvironment: '서버·DB 구성과 운영 환경을 확인했습니다',
  network: '통신 구간과 망 분리를 확인했습니다',
  management: '관리 접속 경로를 확인했습니다',
  operations: '접속 기간과 운영 책임을 확인했습니다',
} as const;
export const serverSchema = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string(),
  environment: z.string(),
  cpu: z.string(),
  memory: z.string(),
  storage: z.string(),
  os: z.string(),
  database: z.string(),
  address: z.string(),
  zone: z.string(),
  aiInferred: z.boolean().default(false),
  aiConfirmed: z.boolean().default(false),
  evidence: z.record(z.string(), z.string()).default({}),
});
export type InfraServer = z.infer<typeof serverSchema>;
export function emptyServer(): InfraServer {
  return {
    id: crypto.randomUUID(),
    name: '',
    purpose: '',
    environment: '',
    cpu: '',
    memory: '',
    storage: '',
    os: '',
    database: '',
    address: '',
    zone: '',
    aiInferred: false,
    aiConfirmed: false,
    evidence: {},
  };
}
export function resolveConnections(
  rows: InfraConnection[],
  servers: InfraServer[],
): InfraConnection[] {
  return rows.map((row) => {
    const source = servers.find((s) => s.id === row.sourceServerId),
      destination = servers.find((s) => s.id === row.destinationServerId);
    return {
      ...row,
      ...(source
        ? { sourceSystem: source.name, sourceAddress: source.address, sourceZone: source.zone }
        : {}),
      ...(destination
        ? {
            destinationSystem: destination.name,
            destinationAddress: destination.address,
            destinationZone: destination.zone,
          }
        : {}),
    };
  });
}
export const infrastructurePlanSchema = z.object({
  revision: z.number(),
  connections: z.array(connectionSchema).max(50),
  notes: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
  schemaVersion: z.number().default(1),
  draft: z.boolean().default(false),
  aiPending: z.boolean().default(false),
  servers: z.array(serverSchema).default([]),
  operations: z.record(z.string(), z.string()).default({}),
  checklist: z.record(z.string(), z.boolean()).default({}),
});
export type InfrastructurePlan = z.infer<typeof infrastructurePlanSchema>;
export type InfraConnection = z.infer<typeof connectionSchema>;
export const INFRA_PRIMARY_KEYS = [
  'system.target_server',
  'network.source',
  'network.destination',
  'network.source_system',
  'network.destination_system',
  'firewall.protocol',
  'firewall.port',
  'firewall.period',
  'firewall.purpose',
  'firewall.direction',
];
