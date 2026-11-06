package kr.securityadvisor.llm.service;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/** 명시적 분석 요청만 UTF-8 텍스트 원문으로 검증하고 읽기 전용 저장한다. */
@Component
public class UploadStorage {
  private static final int MAX_BYTES = 1024 * 1024;
  private static final int MAX_TEXT_LENGTH = 40000;
  private final Path directory;

  public UploadStorage(@Value("${securityadvisor.upload-directory}") String directory) {
    this.directory = Path.of(directory).toAbsolutePath().normalize();
  }

  /**
   * 파일 선택 자체와 무관하게 분석 요청에 포함된 원문만 보관한다.
   *
   * @throws DomainException 파일 형식·문자·상한 또는 저장소 접근 검증이 실패했을 때
   */
  public StoredInput store(String suppliedText, MultipartFile file) {
    String text = suppliedText == null ? "" : suppliedText.strip();
    checkText(text);
    byte[] fileBytes = null;
    String extension = null;
    if (file != null && !file.isEmpty()) {
      extension = extension(file);
      if (file.getSize() > MAX_BYTES) {
        throw new DomainException(413, "UPLOAD_TOO_LARGE", "파일은 1MiB 이하로 선택해 주세요.");
      }
      try {
        fileBytes = file.getBytes();
      } catch (IOException exception) {
        throw new DomainException(400, "UPLOAD_READ_FAILED", "파일을 읽지 못했습니다. 다시 선택해 주세요.");
      }
      if (fileBytes.length > MAX_BYTES) {
        throw new DomainException(413, "UPLOAD_TOO_LARGE", "파일은 1MiB 이하로 선택해 주세요.");
      }
      String decoded = decode(fileBytes);
      text = text.isEmpty() ? decoded : text + "\n\n[첨부 자료]\n" + decoded;
      checkText(text);
    }
    if (text.isBlank()) {
      throw new DomainException(422, "EMPTY_ANALYSIS_INPUT", "사업 설명을 입력하거나 텍스트 파일을 선택해 주세요.");
    }
    List<String> objects = new ArrayList<>();
    if (fileBytes != null) {
      objects.add(save(fileBytes, extension));
    }
    objects.add(save(text.getBytes(StandardCharsets.UTF_8), ".txt"));
    return new StoredInput(text, objects);
  }

  /** 기관·신청 권한을 검사한 서비스만 DB에 보관된 불변 객체 식별자로 원문을 읽는다. */
  public String read(String objectName) {
    if (objectName == null || !objectName.matches("[0-9a-f-]{36}\\.(?:txt|md)")) {
      throw new DomainException(404, "SOURCE_NOT_FOUND", "보관된 원문을 찾을 수 없습니다.");
    }
    Path source = directory.resolve(objectName).normalize();
    try {
      if (!source.getParent().equals(directory)
          || Files.isSymbolicLink(source)
          || Files.size(source) > MAX_BYTES) {
        throw new IOException("Invalid source object");
      }
      return decode(Files.readAllBytes(source));
    } catch (IOException exception) {
      throw new DomainException(404, "SOURCE_NOT_FOUND", "보관된 원문을 찾을 수 없습니다.");
    }
  }

  private String extension(MultipartFile file) {
    String name = file.getOriginalFilename();
    String mime = file.getContentType();
    if (name == null
        || name.length() > 200
        || name.indexOf('/') >= 0
        || name.indexOf('\\') >= 0
        || name.indexOf('\0') >= 0
        || mime == null
        || !Set.of("text/plain", "text/markdown", "text/x-markdown", "application/octet-stream")
            .contains(mime.toLowerCase(Locale.ROOT).split(";", 2)[0].strip())) {
      throw unsupported();
    }
    String lower = name.toLowerCase(Locale.ROOT);
    if (lower.endsWith(".txt")) {
      return ".txt";
    }
    if (lower.endsWith(".md")) {
      return ".md";
    }
    throw unsupported();
  }

  private String decode(byte[] bytes) {
    try {
      String result =
          StandardCharsets.UTF_8
              .newDecoder()
              .onMalformedInput(CodingErrorAction.REPORT)
              .onUnmappableCharacter(CodingErrorAction.REPORT)
              .decode(ByteBuffer.wrap(bytes))
              .toString();
      return result.startsWith("\ufeff") ? result.substring(1) : result;
    } catch (CharacterCodingException exception) {
      throw new DomainException(422, "INVALID_UTF8", "UTF-8로 저장한 TXT 또는 MD 파일을 선택해 주세요.");
    }
  }

  private void checkText(String text) {
    if (text.length() > MAX_TEXT_LENGTH) {
      throw new DomainException(413, "ANALYSIS_TEXT_TOO_LONG", "분석할 텍스트는 합계 40,000자 이하로 줄여 주세요.");
    }
    if (text.chars()
        .anyMatch(value -> value < 32 && value != '\n' && value != '\r' && value != '\t')) {
      throw unsupported();
    }
  }

  private String save(byte[] bytes, String extension) {
    String objectName = UUID.randomUUID() + extension;
    Path destination = directory.resolve(objectName);
    try {
      Files.createDirectories(directory);
      boolean posix = Files.getFileStore(directory).supportsFileAttributeView("posix");
      if (posix) {
        Files.setPosixFilePermissions(
            directory,
            Set.of(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE));
      }
      Files.write(destination, bytes, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
      if (posix) {
        Files.setPosixFilePermissions(destination, Set.of(PosixFilePermission.OWNER_READ));
      } else if (!destination.toFile().setReadOnly()) {
        throw new IOException("Read-only storage unavailable");
      }
      return objectName;
    } catch (IOException exception) {
      throw new DomainException(500, "UPLOAD_STORAGE_FAILED", "원본 자료를 보관하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  private DomainException unsupported() {
    return new DomainException(
        422, "UNSUPPORTED_UPLOAD", "실행 코드가 아닌 UTF-8 TXT 또는 MD 텍스트 파일만 지원합니다.");
  }
}
