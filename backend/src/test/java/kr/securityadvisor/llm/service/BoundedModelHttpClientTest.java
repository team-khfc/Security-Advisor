package kr.securityadvisor.llm.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.net.InetAddress;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Flow;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BoundedModelHttpClientTest {
  @Test
  @DisplayName("실제 HTTP 본문 읽기는 상한을 넘으면 부분 응답을 반환하지 않는다")
  void enforceActualTransportBodyLimit() throws Exception {
    assertThat(
            BoundedModelHttpClient.readBounded(
                new java.io.ByteArrayInputStream(new byte[] {1, 2, 3}), 3))
        .containsExactly((byte) 1, (byte) 2, (byte) 3);
    assertThatThrownBy(
            () ->
                BoundedModelHttpClient.readBounded(
                    new java.io.ByteArrayInputStream(new byte[4]), 3))
        .isInstanceOf(java.io.IOException.class);
  }

  @Test
  @DisplayName("응답이 상한을 넘는 청크에서 구독을 취소하고 부분 결과를 반환하지 않는다")
  void cancelOversizedResponse() {
    var subscriber = new BoundedModelHttpClient.LimitedBodySubscriber(8);
    Flow.Subscription subscription = mock(Flow.Subscription.class);
    subscriber.onSubscribe(subscription);
    subscriber.onNext(List.of(ByteBuffer.wrap(new byte[5])));
    subscriber.onNext(List.of(ByteBuffer.wrap(new byte[4])));
    verify(subscription).cancel();
    assertThatThrownBy(() -> subscriber.getBody().toCompletableFuture().join())
        .isInstanceOf(CompletionException.class);
  }

  @Test
  @DisplayName("여러 청크의 합계가 상한 이하인 경우에만 완성된 본문을 반환한다")
  void completeOnlyBoundedBody() {
    var subscriber = new BoundedModelHttpClient.LimitedBodySubscriber(8);
    subscriber.onSubscribe(mock(Flow.Subscription.class));
    subscriber.onNext(List.of(ByteBuffer.wrap(new byte[] {1, 2}), ByteBuffer.wrap(new byte[] {3})));
    assertThat(subscriber.getBody().toCompletableFuture()).isNotCompleted();
    subscriber.onComplete();
    assertThat(subscriber.getBody().toCompletableFuture().join())
        .containsExactly((byte) 1, (byte) 2, (byte) 3);
  }

  @Test
  @DisplayName("DNS 결과의 루프백·사설·문서용 예약 주소와 IPv6 ULA를 거절한다")
  void rejectNonPublicResolution() throws Exception {
    PublicAddressPolicy policy = new PublicAddressPolicy();
    for (String address :
        List.of(
            "127.0.0.1",
            "192.0.2.10",
            "198.51.100.20",
            "203.0.113.30",
            "::1",
            "2001:db8::1",
            "fd00::1")) {
      assertThat(policy.isPublic(InetAddress.getByName(address))).as(address).isFalse();
    }
    assertThat(policy.isPublic(InetAddress.getByAddress(new byte[] {10, 0, 0, 1}))).isFalse();
    assertThat(policy.isPublic(InetAddress.getByAddress(new byte[] {8, 8, 8, 8}))).isTrue();
  }
}
