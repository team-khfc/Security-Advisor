package kr.securityadvisor.request.domain;

import java.time.temporal.ChronoUnit;
import kr.securityadvisor.common.error.DomainException;

/** 광범위한 통신 허용과 잘못된 주소를 제출 전에 차단하는 시연용 최소 범위 정책이다. */
public final class NetworkPolicy {
  private NetworkPolicy() {}

  /**
   * DNS 조회 없이 IPv4 리터럴, 제한된 포트 범위와 적용 기간을 검증한다.
   *
   * @throws DomainException 주소·포트·기간이 허용 범위를 벗어난 경우
   */
  public static void validate(SecurityRequestData.NetworkRule rule) {
    address(rule.sourceIp());
    address(rule.destinationIp());
    if (!rule.protocol().equals("TCP")
        && !rule.protocol().equals("UDP")
        && !rule.protocol().equals("ICMP")) {
      fail("프로토콜은 TCP, UDP, ICMP 중에서 선택해 주세요.");
    }
    if (!rule.direction().equals("ONE_WAY") && !rule.direction().equals("BIDIRECTIONAL")) {
      fail("통신 방향을 확인해 주세요.");
    }
    if (rule.protocol().equals("ICMP")) {
      if (!rule.port().isBlank() && !rule.port().equals("-")) {
        fail("ICMP에는 포트 번호를 지정하지 않습니다.");
      }
    } else {
      ports(rule.port());
    }
    if (rule.startsOn() == null
        || rule.endsOn() == null
        || rule.endsOn().isBefore(rule.startsOn())) {
      fail("적용 종료일은 시작일 이후여야 합니다.");
    }
    if (ChronoUnit.DAYS.between(rule.startsOn(), rule.endsOn()) > 366) {
      fail("시연 정책상 적용 기간은 366일 이내로 지정해 주세요.");
    }
    if (rule.sourceName().isBlank()
        || rule.destinationName().isBlank()
        || rule.purpose().isBlank()) {
      fail("출발지·목적지 이름과 사용 목적을 입력해 주세요.");
    }
  }

  private static void address(String value) {
    if (value == null || value.length() > 64 || !value.matches("[0-9.]+(?:/[0-9]{1,2})?")) {
      fail("주소는 IPv4 또는 IPv4 CIDR 형식으로 입력해 주세요.");
    }
    String[] parts = value.split("/", -1);
    String[] octets = parts[0].split("\\.", -1);
    if (octets.length != 4) {
      fail("IPv4 주소의 네 구간을 확인해 주세요.");
    }
    int[] parsed = new int[4];
    for (int index = 0; index < octets.length; index++) {
      String octet = octets[index];
      if (octet.isEmpty() || octet.length() > 3 || (octet.length() > 1 && octet.charAt(0) == '0')) {
        fail("IPv4 주소의 숫자 형식을 확인해 주세요.");
      }
      parsed[index] = Integer.parseInt(octet);
      if (parsed[index] > 255) {
        fail("IPv4 주소의 각 구간은 0~255입니다.");
      }
    }
    if (parsed[0] == 0
        || parsed[0] == 127
        || parsed[0] >= 224
        || (parsed[0] == 169 && parsed[1] == 254)) {
      fail("전체·루프백·멀티캐스트·링크 로컬 주소는 신청할 수 없습니다.");
    }
    if (parts.length == 2) {
      int prefix = Integer.parseInt(parts[1]);
      if (prefix < 24 || prefix > 32) {
        fail("시연 정책상 주소 범위는 /24~ /32로 좁혀 주세요.");
      }
    }
  }

  private static void ports(String value) {
    if (value == null || !value.matches("[0-9]{1,5}(?:-[0-9]{1,5})?")) {
      fail("포트는 443 또는 8000-8010처럼 입력해 주세요.");
    }
    String[] parts = value.split("-", -1);
    int first = Integer.parseInt(parts[0]);
    int last = parts.length == 2 ? Integer.parseInt(parts[1]) : first;
    if (first < 1 || last > 65535 || last < first || last - first >= 1024) {
      fail("포트는 1~65535 안에서 필요한 1024개 이하 범위만 지정해 주세요.");
    }
  }

  private static void fail(String detail) {
    throw new DomainException(422, "INVALID_NETWORK_RULE", detail);
  }
}
