package kr.securityadvisor.auth.repository;

import java.util.Optional;
import java.util.UUID;
import kr.securityadvisor.auth.domain.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;

/** 인증 정보 조회를 파라미터 바인딩 저장소에 한정한다. */
public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {
  Optional<UserAccount> findByUsername(String username);
}
