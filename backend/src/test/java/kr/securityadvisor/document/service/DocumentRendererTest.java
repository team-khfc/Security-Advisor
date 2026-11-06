package kr.securityadvisor.document.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.model.DocumentData;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.document.domain.SubmissionSnapshot;
import org.junit.jupiter.api.Test;

class DocumentRendererTest {
  @Test
  void escapesFreeTextAndShowsUnconfirmedAiAsUnconfirmed() {
    String hostile = "<script>alert('synthetic')</script>&\"";
    OrganizationPolicy policy =
        new OrganizationPolicy(
            hostile,
            "PARALLEL",
            true,
            true,
            List.of(),
            hostile,
            new ModelConnection("EXAMPLE", "", "extractive-demo", "", 0.2, 1000, 30));
    DocumentData.Answer answer =
        new DocumentData.Answer(
            "purpose",
            hostile,
            hostile,
            Role.APPLICANT,
            "SUBMIT",
            hostile,
            DocumentData.AnswerStatus.PROPOSED,
            new DocumentData.Source(
                DocumentData.SourceKind.AI_INFERRED, hostile, "AI 제안", Instant.now()),
            null);
    SubmissionSnapshot snapshot =
        new SubmissionSnapshot(
            UUID.randomUUID(),
            hostile,
            "SECURITY_REVIEW",
            hostile,
            hostile,
            hostile,
            1,
            1,
            policy,
            new DocumentData(List.of(answer), List.of(), List.of(), List.of(), List.of()),
            null,
            0,
            null);
    String rendered = new DocumentRenderer().render(snapshot, false);
    assertThat(rendered).doesNotContain("<script>").contains("&lt;script&gt;", "&amp;", "&quot;");
    assertThat(rendered).contains("초안", "사람 확인 필요", "AI 추론");
  }
}
