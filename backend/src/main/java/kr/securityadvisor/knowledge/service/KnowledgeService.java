package kr.securityadvisor.knowledge.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;
import kr.securityadvisor.knowledge.dto.KnowledgeResponse;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

/** 확인한 공식 게시물 메타데이터만 제공하며 색인·본문 검색을 구현했다고 표시하지 않는다. */
@Service
public class KnowledgeService {
  private final List<KnowledgeResponse> references;

  public KnowledgeService(ObjectMapper mapper) {
    try (InputStream input = new ClassPathResource("public-guides.json").getInputStream()) {
      references = List.copyOf(Arrays.asList(mapper.readValue(input, KnowledgeResponse[].class)));
    } catch (IOException exception) {
      throw new IllegalStateException("Public reference catalog unavailable");
    }
  }

  /** 공개 자료의 문서명·판본·게시 위치와 범위 설명을 반환한다. */
  public List<KnowledgeResponse> list() {
    return references;
  }
}
