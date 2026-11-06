package kr.securityadvisor.request.domain;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class NetworkPolicyTest {
  @Test
  void acceptsExplicitDocumentExampleAddressesAndNarrowPortRange() {
    assertThatCode(() -> NetworkPolicy.validate(rule("192.0.2.0/24", "8000-8010", "TCP", 20)))
        .doesNotThrowAnyException();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "ANY",
        "0.0.0.0/0",
        "192.0.2.0/16",
        "192.0.2.0/33",
        "192.0.2.999",
        "192.000.2.1",
        "127.0.0.1",
        "169.254.1.1",
        "224.0.0.1",
        "example.invalid",
        "2001:db8::1"
      })
  void rejectsBroadOrAmbiguousAddresses(String address) {
    assertThatThrownBy(() -> NetworkPolicy.validate(rule(address, "443", "TCP", 20)))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("INVALID_NETWORK_RULE");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {"ANY", "0", "65536", "1-65535", "9000-8000", "1-1025", "443,444", "443;444"})
  void rejectsUnboundedOrInvalidPortRanges(String port) {
    assertThatThrownBy(() -> NetworkPolicy.validate(rule("192.0.2.10", port, "TCP", 20)))
        .isInstanceOf(DomainException.class);
  }

  @Test
  void boundsDurationAndTreatsIcmpAsPortless() {
    assertThatCode(() -> NetworkPolicy.validate(rule("192.0.2.10", "-", "ICMP", 366)))
        .doesNotThrowAnyException();
    assertThatThrownBy(() -> NetworkPolicy.validate(rule("192.0.2.10", "443", "ICMP", 20)))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> NetworkPolicy.validate(rule("192.0.2.10", "443", "TCP", 367)))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> NetworkPolicy.validate(rule("192.0.2.10", "443", "TCP", -1)))
        .isInstanceOf(DomainException.class);
  }

  private SecurityRequestData.NetworkRule rule(
      String address, String port, String protocol, int days) {
    LocalDate start = LocalDate.of(2026, 11, 10);
    return new SecurityRequestData.NetworkRule(
        UUID.randomUUID(),
        "합성 화면",
        address,
        "합성 API",
        "198.51.100.20",
        port,
        protocol,
        "ONE_WAY",
        start,
        start.plusDays(days),
        "문서 작성 검증",
        null,
        null);
  }
}
