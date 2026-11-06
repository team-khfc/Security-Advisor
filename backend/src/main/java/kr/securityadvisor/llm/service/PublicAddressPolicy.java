package kr.securityadvisor.llm.service;

import jakarta.annotation.PreDestroy;
import java.net.InetAddress;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import kr.securityadvisor.common.error.DomainException;
import org.springframework.stereotype.Component;

/** 허용된 공급자 호스트라도 로컬·사설·예약 주소로 해석되면 외부 호출을 거절한다. */
@Component
public class PublicAddressPolicy {
  private final ThreadPoolExecutor resolver =
      new ThreadPoolExecutor(
          2,
          2,
          0L,
          TimeUnit.SECONDS,
          new ArrayBlockingQueue<>(4),
          Thread.ofPlatform().daemon().name("model-dns-", 0).factory(),
          new ThreadPoolExecutor.AbortPolicy());

  /**
   * DNS에서 반환한 모든 주소에 공개 통신 조건을 적용한다.
   *
   * @throws DomainException 주소를 확인하지 못하거나 비공개 주소가 포함된 경우
   */
  public void verify(String host) {
    resolve(host);
  }

  /** 검증한 DNS 결과 자체를 전송기에 전달하여 별도 재조회에 따른 사설 주소 전환을 막는다. */
  public java.util.List<InetAddress> resolve(String host) {
    Future<InetAddress[]> lookup;
    try {
      lookup = resolver.submit(() -> InetAddress.getAllByName(host));
    } catch (RejectedExecutionException exception) {
      throw unavailable();
    }
    try {
      InetAddress[] addresses = lookup.get(5, TimeUnit.SECONDS);
      if (addresses.length == 0) {
        throw rejected();
      }
      for (InetAddress address : addresses) {
        if (!isPublic(address)) {
          throw rejected();
        }
      }
      return java.util.List.of(addresses);
    } catch (ExecutionException | TimeoutException exception) {
      lookup.cancel(true);
      throw unavailable();
    } catch (InterruptedException exception) {
      lookup.cancel(true);
      Thread.currentThread().interrupt();
      throw unavailable();
    }
  }

  /** 지연된 DNS 작업이 애플리케이션 종료를 방해하지 않게 한다. */
  @PreDestroy
  public void shutdown() {
    resolver.shutdownNow();
  }

  boolean isPublic(InetAddress address) {
    if (address.isAnyLocalAddress()
        || address.isLoopbackAddress()
        || address.isLinkLocalAddress()
        || address.isSiteLocalAddress()
        || address.isMulticastAddress()) {
      return false;
    }
    byte[] bytes = address.getAddress();
    int a = Byte.toUnsignedInt(bytes[0]);
    int b = Byte.toUnsignedInt(bytes[1]);
    if (bytes.length == 4) {
      int c = Byte.toUnsignedInt(bytes[2]);
      return !(a == 0
          || a == 10
          || a == 127
          || a >= 224
          || (a == 100 && b >= 64 && b <= 127)
          || (a == 169 && b == 254)
          || (a == 172 && b >= 16 && b <= 31)
          || (a == 192 && b == 168)
          || (a == 192 && b == 0 && (c == 0 || c == 2))
          || (a == 198 && (b == 18 || b == 19))
          || (a == 198 && b == 51 && c == 100)
          || (a == 203 && b == 0 && c == 113));
    }
    return (a & 0xe0) == 0x20
        && !(a == 0x20 && b == 0x01 && bytes[2] == 0x0d && bytes[3] == (byte) 0xb8);
  }

  private DomainException rejected() {
    return new DomainException(422, "MODEL_PRIVATE_ADDRESS", "공개 모델 서비스 주소만 연결할 수 있습니다.");
  }

  private DomainException unavailable() {
    return new DomainException(
        503, "MODEL_DNS_UNAVAILABLE", "모델 서비스 주소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
