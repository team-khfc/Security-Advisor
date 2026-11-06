package kr.securityadvisor.knowledge.service;

import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.pgvector.PgVectorStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** 공개 자료 전용 테이블은 Flyway가 관리하며 비공개 기관 값은 색인하지 않는다. */
@Configuration
public class PublicVectorConfiguration {
  @Bean
  VectorStore publicKnowledgeVectorStore(JdbcTemplate jdbc) {
    return PgVectorStore.builder(jdbc, new LocalFeatureEmbedding())
        .vectorTableName("public_knowledge_vectors")
        .dimensions(LocalFeatureEmbedding.DIMENSIONS)
        .distanceType(PgVectorStore.PgDistanceType.COSINE_DISTANCE)
        .indexType(PgVectorStore.PgIndexType.HNSW)
        .initializeSchema(false)
        .build();
  }
}
