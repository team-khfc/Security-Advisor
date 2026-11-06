package kr.securityadvisor.llm.service;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.Suggestion;
import org.springframework.stereotype.Component;

/** 모델 출력도 입력 자료로 간주하여 허용 필드와 원문 근거를 다시 검사한다. */
@Component
public class CandidateValidator {
  private static final Set<String> KEYS =
      Set.of("purpose", "audience", "dataTypes", "externalTransfer", "period", "dataFlow");
  private static final Pattern TECHNICAL_ADDRESS =
      Pattern.compile(
          "(?i)(?<![\\w.])(?:\\d{1,3}\\.){3}\\d{1,3}(?![\\w.])"
              + "|\\b[a-z0-9.-]+\\.(?:internal|local|intranet)\\b");
  private static final Pattern IPV6_CANDIDATE =
      Pattern.compile("(?i)(?<![0-9a-f:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![0-9a-f:])");

  /**
   * 근거 없는 보충·기술 자산 추정·중복 필드는 전체 응답 실패로 처리한다.
   *
   * @throws DomainException 출력이 허용된 후보 구조와 원문 발췌 조건을 충족하지 않을 때
   */
  public List<Suggestion> validate(String input, List<Suggestion> suggestions) {
    if (suggestions == null || suggestions.size() > KEYS.size()) {
      throw invalid();
    }
    Set<String> used = new HashSet<>();
    for (Suggestion suggestion : suggestions) {
      if (suggestion == null
          || suggestion.key() == null
          || !KEYS.contains(suggestion.key())
          || !used.add(suggestion.key())
          || suggestion.value() == null
          || suggestion.value().isBlank()
          || suggestion.value().length() > 2000
          || suggestion.evidence() == null
          || suggestion.evidence().isBlank()
          || suggestion.evidence().length() > 3000
          || !input.contains(suggestion.evidence())
          || !suggestion.evidence().contains(suggestion.value())
          || containsTechnicalAddress(suggestion.value())) {
        throw invalid();
      }
      if ("externalTransfer".equals(suggestion.key())
          && !Set.of("YES", "NO", "UNKNOWN").contains(suggestion.value())) {
        throw invalid();
      }
    }
    return List.copyOf(suggestions);
  }

  private boolean containsTechnicalAddress(String value) {
    if (TECHNICAL_ADDRESS.matcher(value).find()) {
      return true;
    }
    Matcher candidates = IPV6_CANDIDATE.matcher(value);
    while (candidates.find()) {
      try {
        // 후보는 16진수와 콜론으로만 이루어져 있어 DNS 이름 조회가 발생하지 않는다.
        if (InetAddress.getByName(candidates.group()) instanceof Inet6Address) {
          return true;
        }
      } catch (UnknownHostException exception) {
        // 09:00:00 같은 시간은 IPv6 주소가 아니므로 사업 정보로 허용한다.
      }
    }
    return false;
  }

  private DomainException invalid() {
    return new DomainException(
        502, "MODEL_OUTPUT_REJECTED", "분석 응답의 필드·원문 근거를 검증하지 못했습니다. 직접 입력하거나 다시 분석해 주세요.");
  }
}
