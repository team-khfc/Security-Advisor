package kr.securityadvisor.common.error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/** 클라이언트가 상태·충돌·입력 실패를 구분하면서 내부 정보는 숨기게 한다. */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GlobalExceptionHandler {
  private static final Logger LOG = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  /** 업무 거절은 원래 상태 코드와 최신 자료 버전을 보존한다. */
  @ExceptionHandler(DomainException.class)
  public ProblemDetail domain(DomainException error, HttpServletRequest request) {
    ProblemDetail result =
        ProblemFactory.create(request, error.getStatus(), error.getCode(), error.getMessage());
    if (error.getLatestRevision() != null)
      result.setProperty("latestRevision", error.getLatestRevision());
    return result;
  }

  /** 파서와 검증기 메시지는 입력 원문을 포함할 수 있어 그대로 반환하지 않는다. */
  @ExceptionHandler({
    MethodArgumentNotValidException.class,
    HttpMessageNotReadableException.class,
    MethodArgumentTypeMismatchException.class,
    ServletRequestBindingException.class,
    MissingServletRequestPartException.class,
    ConstraintViolationException.class,
    IllegalArgumentException.class
  })
  public ProblemDetail invalid(Exception error, HttpServletRequest request) {
    return ProblemFactory.create(request, 400, "INVALID_INPUT", "입력 형식과 필수 항목을 확인해 주세요.");
  }

  /** 과도한 파일은 분석 전에 거절한다. */
  @ExceptionHandler(MaxUploadSizeExceededException.class)
  public ProblemDetail tooLarge(HttpServletRequest request) {
    return ProblemFactory.create(request, 413, "FILE_TOO_LARGE", "1MiB 이하의 TXT 또는 MD 파일을 선택해 주세요.");
  }

  /** JPA 경합도 조용히 덮어쓰지 않는다. */
  @ExceptionHandler(OptimisticLockingFailureException.class)
  public ProblemDetail conflict(HttpServletRequest request) {
    return ProblemFactory.create(
        request, 409, "CONCURRENT_CHANGE", "다른 사용자가 변경했습니다. 최신 내용을 비교한 후 다시 저장해 주세요.");
  }

  /** SQL·경로·스택은 응답에 포함하지 않는다. */
  @ExceptionHandler(Exception.class)
  public ProblemDetail unexpected(Exception error, HttpServletRequest request) {
    LOG.error(
        "처리 실패 requestId={} errorType={}",
        request.getAttribute("requestId"),
        error.getClass().getSimpleName());
    return ProblemFactory.create(
        request, 500, "INTERNAL_ERROR", "처리를 완료하지 못했습니다. 입력을 유지한 채 다시 시도하거나 요청 번호로 문의해 주세요.");
  }
}
