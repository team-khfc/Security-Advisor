package kr.securityadvisor.llm.service;

import jakarta.annotation.PreDestroy;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.configuration.service.ModelConfigurationValidator;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.stereotype.Component;

/** 재시도·리다이렉트를 금지하고 검증한 DNS 주소와 크기·시간 상한으로만 모델을 호출한다. */
@Component
public class BoundedModelHttpClient {
  static final int MAX_RESPONSE_BYTES = 512 * 1024;
  private final ModelConfigurationValidator configurations;
  private final OkHttpClient client;

  public BoundedModelHttpClient(
      ModelConfigurationValidator configurations, PublicAddressPolicy addresses) {
    this.configurations = configurations;
    this.client =
        new OkHttpClient.Builder()
            .dns(addresses::resolve)
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(false)
            .build();
  }

  public byte[] post(ModelConnection connection, String key, byte[] payload) {
    configurations.validate(connection);
    if ("EXAMPLE".equals(connection.provider()) || payload.length > 256 * 1024) {
      throw new DomainException(422, "MODEL_REQUEST_REJECTED", "모델 요청의 주소와 크기를 확인해 주세요.");
    }
    Request request =
        new Request.Builder()
            .url(connection.endpoint())
            .header("Authorization", "Bearer " + key)
            .header("Accept", "application/json")
            .post(RequestBody.create(payload, MediaType.get("application/json")))
            .build();
    var call =
        client
            .newBuilder()
            .callTimeout(Duration.ofSeconds(connection.timeoutSeconds()))
            .readTimeout(Duration.ofSeconds(connection.timeoutSeconds()))
            .build()
            .newCall(request);
    try (Response response = call.execute()) {
      if (response.code() != 200
          || response.body() == null
          || !response
              .header("Content-Type", "")
              .toLowerCase(Locale.ROOT)
              .startsWith("application/json")) {
        throw new DomainException(502, "MODEL_UPSTREAM_FAILURE", "모델 서비스의 정상 응답을 확인하지 못했습니다.");
      }
      return readBounded(response.body().byteStream(), MAX_RESPONSE_BYTES);
    } catch (InterruptedIOException exception) {
      call.cancel();
      throw new DomainException(504, "MODEL_TIMEOUT", "모델 응답 시간이 초과되었습니다. 다시 시도하거나 직접 입력해 주세요.");
    } catch (IOException exception) {
      call.cancel();
      throw new DomainException(502, "MODEL_UPSTREAM_FAILURE", "모델 서비스에 연결하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  static byte[] readBounded(InputStream input, int maximum) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] chunk = new byte[8192];
    int length;
    while ((length = input.read(chunk)) != -1) {
      if (output.size() + length > maximum) {
        throw new IOException("Model response too large");
      }
      output.write(chunk, 0, length);
    }
    return output.toByteArray();
  }

  @PreDestroy
  public void shutdown() {
    client.dispatcher().cancelAll();
    client.dispatcher().executorService().shutdown();
    client.connectionPool().evictAll();
  }

  static final class LimitedBodySubscriber
      implements java.net.http.HttpResponse.BodySubscriber<byte[]> {
    private final int limit;
    private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    private final CompletableFuture<byte[]> result = new CompletableFuture<>();
    private Flow.Subscription subscription;

    LimitedBodySubscriber(int limit) {
      this.limit = limit;
    }

    @Override
    public CompletionStage<byte[]> getBody() {
      return result;
    }

    @Override
    public void onSubscribe(Flow.Subscription subscription) {
      if (this.subscription != null) {
        subscription.cancel();
        return;
      }
      this.subscription = subscription;
      subscription.request(1);
    }

    @Override
    public void onNext(List<ByteBuffer> buffers) {
      if (result.isDone()) {
        return;
      }
      for (ByteBuffer buffer : buffers) {
        if (buffer.remaining() > limit - bytes.size()) {
          subscription.cancel();
          result.completeExceptionally(new IllegalStateException("Response size limit"));
          return;
        }
        byte[] chunk = new byte[buffer.remaining()];
        buffer.get(chunk);
        bytes.writeBytes(chunk);
      }
      subscription.request(1);
    }

    @Override
    public void onError(Throwable throwable) {
      result.completeExceptionally(new IllegalStateException("Response unavailable"));
    }

    @Override
    public void onComplete() {
      result.complete(bytes.toByteArray());
    }
  }
}
