package kr.securityadvisor.common.error;

/** 업무 거절 사유와 동시 수정 비교에 필요한 버전만 외부로 전달한다. */
public class DomainException extends RuntimeException {
  private final int status;
  private final String code;
  private final Long latestRevision;

  public DomainException(int status, String code, String detail) {
    this(status, code, detail, null);
  }

  public DomainException(int status, String code, String detail, Long latestRevision) {
    super(detail);
    this.status = status;
    this.code = code;
    this.latestRevision = latestRevision;
  }

  public int getStatus() {
    return status;
  }

  public String getCode() {
    return code;
  }

  public Long getLatestRevision() {
    return latestRevision;
  }
}
