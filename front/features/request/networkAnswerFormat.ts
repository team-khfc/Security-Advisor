/** DNS·통신 없이 IPv4/IPv6와 CIDR 리터럴의 구조만 검사한다. */
function validIp(value: string): boolean {
  const parts = value.split('/');
  if (parts.length > 2) return false;
  const host = parts[0];
  const ipv4 = (s: string) =>
    s.split('.').length === 4 &&
    s.split('.').every((v) => /^(0|[1-9][0-9]{0,2})$/.test(v) && Number(v) <= 255);
  let valid = ipv4(host);
  if (host.includes(':') && /^[0-9a-fA-F:.]+$/.test(host)) {
    let normalized = host;
    if (host.includes('.')) {
      const tail = host.slice(host.lastIndexOf(':') + 1);
      if (!ipv4(tail)) return false;
      normalized = host.slice(0, host.lastIndexOf(':') + 1) + '0:0';
    }
    const halves = normalized.split('::');
    const groups = halves.flatMap((h) => (h ? h.split(':') : []));
    valid =
      halves.length <= 2 &&
      groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g)) &&
      (halves.length === 2 ? groups.length < 8 : groups.length === 8);
  }
  return (
    valid &&
    (parts.length === 1 ||
      (/^(0|[1-9][0-9]{0,2})$/.test(parts[1]) &&
        Number(parts[1]) <= (host.includes(':') ? 128 : 32)))
  );
}

/** 서버와 같은 네트워크 형식을 입력할 때 검사한다. */
export function networkValueValid(type: string, value: string): boolean {
  const items = value.split(/[,\n]/);
  return (
    items.length <= 100 &&
    items.every((item) => {
      const token = item.trim();
      if (type === 'IP_ADDRESS') return validIp(token);
      if (type === 'PROTOCOL')
        return ['TCP', 'UDP', 'ICMP', 'ICMPV6', 'ESP', 'AH', 'GRE'].includes(token);
      if (!/^[0-9]{1,5}(?:\s*-\s*[0-9]{1,5})?$/.test(token)) return false;
      const range = token.split(/\s*-\s*/).map(Number);
      return range[0] >= 1 && range.at(-1)! <= 65535 && range[0] <= range.at(-1)!;
    })
  );
}

export const networkFormatHelp: Record<string, string> = {
  IP_ADDRESS: 'IPv4·IPv6 주소 또는 CIDR을 입력하세요. 예: 192.0.2.1, 2001:db8::/32',
  PORT: '1~65535 포트 또는 시작-종료 범위를 입력하세요. 예: 443, 8000-8080',
  PROTOCOL: 'TCP, UDP, ICMP, ICMPV6, ESP, AH, GRE 중 입력하세요.',
};
