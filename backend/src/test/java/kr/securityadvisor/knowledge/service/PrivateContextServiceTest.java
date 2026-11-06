package kr.securityadvisor.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.knowledge.repository.PrivateContextRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PrivateContextServiceTest {
  @Test
  @DisplayName("전문 담당자도 자신의 세션 기관으로만 참고 자료를 조회한다")
  void bindExpertReadToAuthenticatedInstitution() {
    PrivateContextRepository repository = mock(PrivateContextRepository.class);
    ContextCipher cipher = mock(ContextCipher.class);
    var service = new PrivateContextService(repository, cipher);
    UUID outsideInstitution = UUID.randomUUID();
    var actor =
        new Actor(
            UUID.randomUUID(), outsideInstitution, "synthetic.expert", "합성 담당자", Role.SECURITY);
    when(repository.findTop100ByInstitutionIdOrderByCreatedAtDesc(outsideInstitution))
        .thenReturn(List.of());
    assertThat(service.getContexts(actor)).isEmpty();
    verify(repository).findTop100ByInstitutionIdOrderByCreatedAtDesc(outsideInstitution);
    verify(cipher, never()).decrypt(any(), any(), any());
  }

  @Test
  @DisplayName("신청자에게는 암호문 조회 단계도 허용하지 않는다")
  void rejectApplicantBeforeReadingStorage() {
    PrivateContextRepository repository = mock(PrivateContextRepository.class);
    var service = new PrivateContextService(repository, mock(ContextCipher.class));
    var actor =
        new Actor(
            UUID.randomUUID(), UUID.randomUUID(), "synthetic.applicant", "합성 신청자", Role.APPLICANT);
    assertThatThrownBy(() -> service.getContexts(actor)).isInstanceOf(DomainException.class);
    verify(repository, never()).findTop100ByInstitutionIdOrderByCreatedAtDesc(any());
  }
}
