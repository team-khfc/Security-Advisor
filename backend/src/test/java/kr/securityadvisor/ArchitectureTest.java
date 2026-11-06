package kr.securityadvisor;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ArchitectureTest {
  @Test
  @DisplayName("컨트롤러는 저장소와 엔티티에 직접 의존하지 않는다")
  void keepControllerBoundary() {
    noClasses()
        .that()
        .resideInAPackage("..controller..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("..repository..", "..domain..")
        .check(classes());
  }

  @Test
  @DisplayName("도메인은 서비스와 전송 계층을 알지 않는다")
  void keepDomainBoundary() {
    noClasses()
        .that()
        .resideInAPackage("..domain..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage("..controller..", "..service..", "..dto..", "..repository..")
        .check(classes());
  }

  @Test
  @DisplayName("기능 패키지끼리 순환 참조가 없다")
  void keepFeatureBoundary() {
    slices().matching("kr.securityadvisor.(*)..").should().beFreeOfCycles().check(classes());
  }

  @Test
  @DisplayName("컨텍스트 사이에는 엔티티와 저장소를 직접 참조하지 않는다")
  void keepPublishedContextBoundary() {
    for (String context :
        java.util.List.of(
            "request", "review", "document", "configuration", "knowledge", "llm", "auth")) {
      noClasses()
          .that()
          .resideOutsideOfPackage("kr.securityadvisor." + context + "..")
          .should()
          .dependOnClassesThat()
          .resideInAPackage("kr.securityadvisor." + context + ".repository..")
          .check(classes());
      noClasses()
          .that()
          .resideOutsideOfPackage("kr.securityadvisor." + context + "..")
          .should()
          .dependOnClassesThat(
              com.tngtech.archunit.base.DescribedPredicate.describe(
                  "다른 컨텍스트의 JPA 엔티티",
                  type ->
                      type.isAnnotatedWith(jakarta.persistence.Entity.class)
                          && type.getPackageName()
                              .startsWith("kr.securityadvisor." + context + ".domain")))
          .check(classes());
    }
  }

  private com.tngtech.archunit.core.domain.JavaClasses classes() {
    return new ClassFileImporter()
        .withImportOption(new ImportOption.DoNotIncludeTests())
        .importPackages("kr.securityadvisor");
  }
}
