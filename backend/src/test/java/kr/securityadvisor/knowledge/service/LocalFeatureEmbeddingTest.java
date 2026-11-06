package kr.securityadvisor.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LocalFeatureEmbeddingTest {
  @Test
  @DisplayName("같은 공개 문구의 로컬 임베딩은 결정적 256차원 단위벡터이며 외부 키가 필요 없다")
  void deterministicNormalizedVectors() {
    var embedding = new LocalFeatureEmbedding();
    var vectors = embedding.embed(List.of("방화벽 정책 관리", "방화벽 정책 관리", "소프트웨어 개발보안 가이드"));
    assertThat(vectors.getFirst()).hasSize(256).containsExactly(vectors.get(1));
    double norm = 0;
    for (float value : vectors.getFirst()) {
      norm += value * value;
    }
    assertThat(norm).isCloseTo(1, org.assertj.core.data.Offset.offset(0.00001));
    assertThat(vectors.getFirst()).isNotEqualTo(vectors.get(2));
  }
}
