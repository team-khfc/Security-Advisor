plugins {
  java
  id("org.springframework.boot") version "4.1.2"
  id("com.diffplug.spotless") version "7.2.1"
}

group = "kr.securityadvisor"
version = "0.3.0-securityadvisor"
java { toolchain { languageVersion = JavaLanguageVersion.of(25) } }
repositories { mavenCentral() }
val mockitoAgent = configurations.create("mockitoAgent")
dependencies {
  implementation(platform("org.springframework.boot:spring-boot-dependencies:4.1.2"))
  testImplementation(platform("org.springframework.boot:spring-boot-dependencies:4.1.2"))
  implementation("org.springframework.boot:spring-boot-starter-webmvc")
  implementation("org.springframework.boot:spring-boot-starter-security")
  implementation("org.springframework.boot:spring-boot-starter-validation")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.springframework.ai:spring-ai-openai:2.0.2")
  implementation("org.springframework.ai:spring-ai-client-chat:2.0.2")
  implementation("org.springframework.ai:spring-ai-pgvector-store:2.0.2")
  implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:3.2.0")
  implementation("org.springframework.boot:spring-boot-starter-flyway")
  implementation("org.flywaydb:flyway-database-postgresql")
  runtimeOnly("org.postgresql:postgresql")
  testImplementation("org.springframework.boot:spring-boot-starter-test")
  testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
  testImplementation("org.springframework.security:spring-security-test")
  testImplementation("org.testcontainers:testcontainers-postgresql")
  testImplementation("org.testcontainers:testcontainers-junit-jupiter")
  testImplementation("com.tngtech.archunit:archunit-junit5:1.4.1")
  mockitoAgent(platform("org.springframework.boot:spring-boot-dependencies:4.1.2"))
  mockitoAgent("org.mockito:mockito-core") { isTransitive = false }
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
spotless {
  java { googleJavaFormat("1.35.0"); removeUnusedImports(); trimTrailingWhitespace(); endWithNewline() }
}
tasks.test {
  useJUnitPlatform()
  jvmArgs("-javaagent:" + mockitoAgent.asPath)
  testLogging { events("failed", "skipped"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.SHORT }
}
tasks.bootJar { archiveFileName.set("securityadvisor-backend.jar") }
tasks.withType<JavaCompile>().configureEach { options.compilerArgs.add("-parameters") }

