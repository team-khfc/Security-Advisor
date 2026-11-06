package kr.securityadvisor.llm.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import kr.securityadvisor.common.error.DomainException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

class UploadStorageTest {
  @TempDir Path directory;

  @Test
  @DisplayName("검증한 원본을 사용자 파일명 대신 UUID로 읽기 전용 보관한다")
  void keepOriginalWithSafeName() throws Exception {
    UploadStorage storage = new UploadStorage(directory.toString());
    byte[] original = "사업 목적: 합성 안내 서비스".getBytes(StandardCharsets.UTF_8);
    StoredInput result =
        storage.store(
            "추가 사업 설명", new MockMultipartFile("file", "사업개요.md", "text/markdown", original));
    assertThat(result.text()).contains("추가 사업 설명", "사업 목적: 합성 안내 서비스");
    assertThat(result.objectNames())
        .hasSize(2)
        .allMatch(name -> name.matches("[a-f0-9-]{36}\\.(md|txt)"));
    Path saved = directory.resolve(result.objectNames().getFirst());
    assertThat(Files.readAllBytes(saved)).isEqualTo(original);
    if (Files.getFileStore(directory).supportsFileAttributeView("posix")) {
      assertThat(Files.getPosixFilePermissions(saved))
          .containsExactly(PosixFilePermission.OWNER_READ);
    }
  }

  @Test
  @DisplayName("경로·MIME·확장자·잘못된 UTF8·큰 원문을 저장 전에 거절한다")
  void rejectUnsupportedInputBeforeWriting() throws Exception {
    UploadStorage storage = new UploadStorage(directory.toString());
    for (MockMultipartFile file :
        new MockMultipartFile[] {
          new MockMultipartFile("file", "../outside.txt", "text/plain", new byte[] {65}),
          new MockMultipartFile("file", "script.js", "text/plain", new byte[] {65}),
          new MockMultipartFile("file", "document.txt", "image/png", new byte[] {65}),
          new MockMultipartFile(
              "file", "document.txt", "text/plain", new byte[] {(byte) 0xc3, 0x28}),
          new MockMultipartFile("file", "document.txt", "text/plain", new byte[1024 * 1024 + 1])
        }) {
      assertThatThrownBy(() -> storage.store("", file)).isInstanceOf(DomainException.class);
    }
    assertThatThrownBy(() -> storage.store("a".repeat(40001), null))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> storage.store("   ", null)).isInstanceOf(DomainException.class);
    try (var files = Files.list(directory)) {
      assertThat(files.count()).isZero();
    }
  }
}
