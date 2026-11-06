package kr.securityadvisor.document.service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import kr.securityadvisor.common.model.DocumentData;
import kr.securityadvisor.document.domain.SubmissionSnapshot;
import org.springframework.stereotype.Component;

/** 사용자·AI 문구를 실행 가능한 마크업으로 해석하지 않고 문서 텍스트로 렌더링한다. */
@Component
public class DocumentRenderer {
  private static final DateTimeFormatter DATE_TIME =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss z").withZone(ZoneId.of("Asia/Seoul"));

  /** 제출 시점 HTML을 별도 보관할 수 있도록 외부 리소스 없는 완전한 문서를 만든다. */
  public String render(SubmissionSnapshot snapshot, boolean submitted) {
    String title = snapshot.documentType().equals("FIREWALL") ? "방화벽 신청서" : "보안성검토 신청서";
    StringBuilder html = new StringBuilder();
    html.append("<!doctype html><html lang=\"ko\"><head><meta charset=\"UTF-8\">")
        .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>")
        .append(title)
        .append(" · SecurityAdvisor</title><style>")
        .append(
            "body{font:16px/1.6 system-ui,sans-serif;color:#1e2124;margin:32px auto;padding:0 20px;max-width:1100px}")
        .append(
            "h1{font-size:30px}h2{margin-top:32px;font-size:22px}.notice{padding:16px;border:1px solid #cdd1d5;background:#f4f5f6}")
        .append(
            "table{border-collapse:collapse;width:100%;margin:16px 0;table-layout:fixed}th,td{border:1px solid #cdd1d5;padding:10px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}")
        .append(
            "th{background:#f4f5f6;text-align:left}.muted{color:#464c53;font-size:14px}.status{font-weight:bold}dl{display:grid;grid-template-columns:120px 1fr}dt,dd{margin:0;padding:6px}")
        .append("@media print{body{margin:12mm;max-width:none;padding:0}tr{break-inside:avoid}}")
        .append(
            "</style></head><body><p class=\"notice\">합성 데이터 시연용 · 실제 장비 적용이나 보안 적합 판정을 의미하지 않습니다.</p>")
        .append("<h1>")
        .append(title)
        .append(submitted ? " · 제출본" : " · 검토용 초안")
        .append("</h1><dl>");
    definition(html, "신청 번호", snapshot.procedureId().toString());
    definition(html, "사업명", snapshot.title());
    definition(html, "기관", snapshot.policy().institutionName());
    definition(html, "부서", snapshot.department());
    definition(html, "작성자", snapshot.ownerName());
    definition(html, "내용 버전", Long.toString(snapshot.revision()));
    definition(html, "제출 차수", submitted ? Integer.toString(snapshot.submissionVersion()) : "초안");
    definition(html, "적용 설정", "게시본 " + snapshot.policyVersion());
    definition(html, "제출 시각", submitted ? time(snapshot.submittedAt()) : "아직 최종 제출하지 않은 초안입니다.");
    html.append("</dl>");
    if (snapshot.finalDraft() != null) {
      DocumentData.FinalDraft draft = snapshot.finalDraft();
      html.append("<h2>AI 최종 초안 요약</h2><p>")
          .append(escape(draft.summary()))
          .append("</p><p class=\"notice\">AI 추론·근거 / ")
          .append(draft.confirmed() && draft.confirmation() != null ? "신청자 확인 완료" : "미확정·신청자 확인 필요")
          .append("<br>근거: ")
          .append(escape(draft.evidence()));
      if (draft.confirmation() != null) {
        html.append("<br>확인: ")
            .append(escape(draft.confirmation().actorName()))
            .append(" / ")
            .append(escape(time(draft.confirmation().at())));
      }
      html.append("</p>");
    }
    html.append("<h2>사업 설명</h2><p>")
        .append(escape(snapshot.description()))
        .append("</p>")
        .append(
            "<h2>수집 정보와 확인 근거</h2><table><thead><tr><th>항목</th><th>내용</th><th>상태·출처·사람 확인</th></tr></thead><tbody>");
    for (DocumentData.Answer answer : snapshot.data().answers()) {
      html.append("<tr><th>")
          .append(escape(answer.label()))
          .append("</th><td>")
          .append(escape(answerValue(answer)))
          .append("</td><td>")
          .append("<span class=\"status\">")
          .append(answerStatus(answer.status()))
          .append("</span><br>");
      provenance(html, answer.source(), answer.confirmation());
      html.append("</td></tr>");
    }
    html.append("</tbody></table>");
    if (snapshot.documentType().equals("FIREWALL")) {
      html.append(
          "<h2>통신 규칙</h2><table><thead><tr><th>출발지</th><th>목적지</th><th>범위·기간</th><th>목적·확인</th></tr></thead><tbody>");
      for (DocumentData.NetworkRule rule : snapshot.data().rules()) {
        html.append("<tr><td>")
            .append(escape(rule.sourceName()))
            .append("<br>")
            .append(escape(rule.sourceIp()))
            .append("</td><td>")
            .append(escape(rule.destinationName()))
            .append("<br>")
            .append(escape(rule.destinationIp()))
            .append("</td><td>")
            .append(escape(rule.protocol()))
            .append(" / ")
            .append(escape(rule.port()))
            .append("<br>")
            .append(rule.direction().equals("BIDIRECTIONAL") ? "양방향" : "단방향")
            .append("<br>")
            .append(rule.startsOn())
            .append(" ~ ")
            .append(rule.endsOn())
            .append("</td><td>")
            .append(escape(rule.purpose()))
            .append("<br>");
        provenance(html, rule.source(), rule.confirmation());
        html.append("</td></tr>");
      }
      html.append("</tbody></table>");
    }
    html.append(
        "<h2>담당자 검토</h2><table><thead><tr><th>분야</th><th>검토 기록</th><th>의견</th></tr></thead><tbody>");
    for (DocumentData.Review review : snapshot.data().reviews()) {
      html.append("<tr><th>")
          .append(review.role().name().equals("INFRA") ? "ICT인프라" : "정보보안")
          .append("</th><td>")
          .append(reviewStatus(review.status()))
          .append(" / 내용 버전 ")
          .append(review.revision() == null ? "미확인" : review.revision())
          .append("<br>")
          .append(escape(review.actorName()))
          .append(" / ")
          .append(escape(time(review.at())))
          .append("</td><td>")
          .append(escape(review.comment()))
          .append("</td></tr>");
    }
    html.append("</tbody></table><h2>보완 이력</h2>");
    if (snapshot.data().supplements().isEmpty()) {
      html.append("<p>등록된 보완 요청이 없습니다.</p>");
    }
    for (DocumentData.Supplement item : snapshot.data().supplements()) {
      html.append("<section class=\"notice\"><strong>")
          .append(escape(item.question()))
          .append("</strong><p>")
          .append(escape(item.answer()))
          .append("</p><small>")
          .append(
              item.status().equals("RESOLVED")
                  ? "담당자 해결 확인"
                  : item.status().equals("ANSWERED") ? "답변 완료·담당자 재확인 필요" : "답변 필요")
          .append(" / ")
          .append(escape(item.requestedBy()))
          .append("</small></section>");
    }
    html.append(
            "<p class=\"notice\">AI는 제안하며 사람이 내용을 확인합니다. 담당자 검토와 서류 접수는 실제 시스템 처리 완료를 뜻하지 않습니다.</p><footer>")
        .append(escape(snapshot.policy().documentFooter()))
        .append("</footer></body></html>");
    return html.toString();
  }

  private static void provenance(
      StringBuilder html, DocumentData.Source source, DocumentData.Confirmation confirmation) {
    if (source == null) {
      html.append("출처 없음 · 담당자 확인 필요");
    } else {
      html.append(sourceName(source.kind()))
          .append(" / ")
          .append(escape(source.actorName()))
          .append("<br><span class=\"muted\">근거: ")
          .append(escape(source.evidence()))
          .append("</span>");
    }
    html.append("<br>");
    if (confirmation == null) {
      html.append("사람 확인 필요");
    } else {
      html.append("확인: ")
          .append(escape(confirmation.actorName()))
          .append(" / ")
          .append(escape(time(confirmation.at())));
    }
  }

  private static void definition(StringBuilder html, String label, String value) {
    html.append("<dt>")
        .append(escape(label))
        .append("</dt><dd>")
        .append(escape(value))
        .append("</dd>");
  }

  private static String answerValue(DocumentData.Answer answer) {
    if (answer.value().isBlank()) return "담당자 확인 필요";
    if (!answer.key().equals("externalTransfer")) return answer.value();
    return switch (answer.value()) {
      case "NO" -> "아니요";
      case "YES" -> "예";
      case "UNKNOWN" -> "잘 모름 · 담당자 확인 필요";
      default -> answer.value();
    };
  }

  private static String answerStatus(DocumentData.AnswerStatus status) {
    return switch (status) {
      case EMPTY -> "담당자 확인 필요";
      case PROPOSED -> "미확정";
      case CONFIRMED -> "사람 확인";
      case NOT_APPLICABLE -> "해당 없음·사유 확인";
    };
  }

  private static String sourceName(DocumentData.SourceKind kind) {
    return switch (kind) {
      case USER_ANSWER -> "사용자 답변";
      case AI_INFERRED -> "AI 추론·근거";
      case STAFF_INPUT -> "담당자 입력";
      case STAFF_CONFIRMED -> "담당자 확인";
    };
  }

  private static String reviewStatus(String status) {
    return switch (status) {
      case "COMPLETE" -> "협의 완료";
      case "IN_PROGRESS" -> "검토 중";
      case "INVALIDATED" -> "내용 변경·재검토 필요";
      default -> "검토 대기";
    };
  }

  private static String time(Instant instant) {
    return instant == null ? "미기록" : DATE_TIME.format(instant);
  }

  private static String escape(String value) {
    if (value == null) return "";
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;");
  }
}
