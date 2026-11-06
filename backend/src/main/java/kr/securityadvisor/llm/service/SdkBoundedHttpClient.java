package kr.securityadvisor.llm.service;

import com.openai.core.RequestOptions;
import com.openai.core.http.Headers;
import com.openai.core.http.HttpClient;
import com.openai.core.http.HttpRequest;
import com.openai.core.http.HttpResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.CompletableFuture;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;

/** SDK 직렬화·파싱은 유지하면서 전송 주소·본문 상한·키 참조는 서비스의 제한 경로를 통과시킨다. */
final class SdkBoundedHttpClient implements HttpClient {
  private final ModelConnection connection;
  private final BoundedModelHttpClient transport;
  private final ProviderSecretResolver secrets;

  SdkBoundedHttpClient(
      ModelConnection connection,
      BoundedModelHttpClient transport,
      ProviderSecretResolver secrets) {
    this.connection = connection;
    this.transport = transport;
    this.secrets = secrets;
  }

  @Override
  public HttpResponse execute(HttpRequest request, RequestOptions options) {
    if (!connection.endpoint().equals(request.url())
        || !"POST".equals(request.method().name())
        || request.body() == null) {
      throw new DomainException(422, "MODEL_REQUEST_REJECTED", "허용된 모델 요청만 전송할 수 있습니다.");
    }
    var body = new ByteArrayOutputStream();
    request.body().writeTo(body);
    byte[] result = transport.post(connection, secrets.resolve(connection), body.toByteArray());
    return new HttpResponse() {
      private final InputStream input = new ByteArrayInputStream(result);

      @Override
      public int statusCode() {
        return 200;
      }

      @Override
      public Headers headers() {
        return Headers.builder().put("Content-Type", "application/json").build();
      }

      @Override
      public InputStream body() {
        return input;
      }

      @Override
      public void close() {
        /* bounded memory response owns no socket */
      }
    };
  }

  @Override
  public CompletableFuture<HttpResponse> executeAsync(HttpRequest request, RequestOptions options) {
    // Streaming is deliberately unsupported; the synchronous bounded path is the only live path.
    return CompletableFuture.failedFuture(
        new UnsupportedOperationException("Streaming is not enabled"));
  }

  @Override
  public void close() {
    /* shared transport is owned by Spring */
  }
}
