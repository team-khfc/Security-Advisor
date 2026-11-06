package kr.securityadvisor.knowledge.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.ai.document.Document;
import org.springframework.ai.embedding.Embedding;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.embedding.EmbeddingRequest;
import org.springframework.ai.embedding.EmbeddingResponse;

/** 외부 전송 없는 256차원 문자 특징 해시다. 신경망 의미 임베딩이라고 표시하지 않는다. */
public final class LocalFeatureEmbedding implements EmbeddingModel {
  public static final int DIMENSIONS = 256;

  @Override
  public int dimensions() {
    return DIMENSIONS;
  }

  @Override
  public float[] embed(Document document) {
    return vector(document.getText());
  }

  @Override
  public EmbeddingResponse call(EmbeddingRequest request) {
    List<Embedding> result = new ArrayList<>();
    for (int i = 0; i < request.getInstructions().size(); i++) {
      result.add(new Embedding(vector(request.getInstructions().get(i)), i));
    }
    return new EmbeddingResponse(result);
  }

  private float[] vector(String text) {
    float[] values = new float[DIMENSIONS];
    String normalized =
        text == null ? "" : text.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    int[] points = normalized.codePoints().toArray();
    if (points.length == 0) {
      values[0] = 1;
      return values;
    }
    for (int i = 0; i < points.length; i++) {
      int hash = points[i] * 31 + (i + 1 < points.length ? points[i + 1] : 0);
      values[Math.floorMod(hash, DIMENSIONS)] += 1;
    }
    double norm = 0;
    for (float value : values) {
      norm += value * value;
    }
    float divisor = (float) Math.sqrt(norm);
    for (int i = 0; i < values.length; i++) {
      values[i] /= divisor;
    }
    return values;
  }
}
