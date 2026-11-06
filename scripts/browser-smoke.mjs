import fs from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// 합성 시연 환경에서 실행한다. 비밀번호·쿠키·세션 값은 출력하지 않는다.
const root = fileURLToPath(new URL("..", import.meta.url));
const modulePath = process.env.SECURITYADVISOR_PLAYWRIGHT_MODULE;
if (!modulePath)
  throw new Error(
    "Set SECURITYADVISOR_PLAYWRIGHT_MODULE to the installed Playwright index.mjs path.",
  );
const { chromium } = await import(pathToFileURL(path.resolve(modulePath)).href);
const output = path.resolve(
  process.env.SECURITYADVISOR_BROWSER_ARTIFACTS ??
    path.join(root, ".artifacts/browser"),
);
await fs.mkdir(output, { recursive: true });
const env = Object.fromEntries(
  (await fs.readFile(path.join(root, ".env"), "utf8"))
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const results = [];
const pageErrors = [];
const baseURL =
  process.env.SECURITYADVISOR_TEST_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });

async function account(role, options = {}) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1060 },
    ...options,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/login");
  await page.locator("#username").fill(`${role.toLowerCase()}.demo`);
  await page
    .locator("#password")
    .fill(env[`SECURITYADVISOR_DEMO_${role}_PASSWORD`]);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/requests");
  const session = await page.request.get("/api/auth/session");
  assert.equal(session.status(), 200);
  assert.equal((await session.json()).user.role, role);
  const cookie = (await context.cookies()).find(
    (item) => item.name === "SECURITYADVISOR_SESSION",
  );
  assert(
    cookie?.httpOnly && cookie.sameSite === "Strict",
    "Authenticated cookie boundary",
  );
  results.push({
    check: `${role} browser login and server session`,
    result: "PASS",
  });
  return { context, page };
}

async function inspect(page, name, screenshot = true) {
  await page.locator("main h1").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const metrics = await page.evaluate(() => ({
    bodyFontSize: parseFloat(getComputedStyle(document.body).fontSize),
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
    zoom: getComputedStyle(document.body).zoom,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    headings: document.querySelectorAll("main h1").length,
    title: document.querySelector("main h1")?.textContent,
    fontLoaded: document.fonts.check('17px "Pretendard GOV"', "보안길잡이"),
    fontFamily: getComputedStyle(document.body).fontFamily,
    colorTokens: Object.fromEntries(
      ["primary", "text", "surface", "background", "border"].map((name) => [
        name,
        getComputedStyle(document.documentElement)
          .getPropertyValue(`--sf-${name}`)
          .trim(),
      ]),
    ),
  }));
  assert(
    metrics.bodyFontSize >= 17,
    `${name}: body size ${metrics.bodyFontSize}`,
  );
  assert(
    metrics.overflow <= 2,
    `${name}: horizontal overflow ${metrics.overflow}px`,
  );
  assert.equal(metrics.headings, 1, `${name}: one main heading`);
  assert(
    metrics.fontLoaded && metrics.fontFamily.includes("Pretendard GOV"),
    `${name}: local project font`,
  );
  assert(
    ["1", "normal"].includes(metrics.zoom),
    `${name}: body zoom ${metrics.zoom}`,
  );
  for (const [token, value] of Object.entries(metrics.colorTokens)) {
    assert(value, `${name}: --sf-${token} must resolve without a CSS cycle`);
  }
  results.push({ check: name, result: "PASS", ...metrics });
  if (screenshot)
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}

// 기존 화면에서는 CSS 토큰 순환 참조로 카드·선·선택 색상이 사라져도 통과했다.
// 지정 시안의 핵심 구조와 실제 계산 색상을 함께 확인한다.
async function inspectRequestDesign(page) {
  assert.equal(await page.locator(".stats .stat").count(), 4);
  assert.deepEqual(
    await page.locator("main table thead th").allTextContents(),
    [
      "신청번호·프로젝트명",
      "진행 단계",
      "다음 할 일",
      "처리 기한",
      "상태",
      "처리",
    ],
  );
  assert.equal(await page.locator("main table tbody tr").count(), 5);
  const colors = await page.evaluate(() => {
    const style = (selector) =>
      getComputedStyle(document.querySelector(selector));
    const logo = document.querySelector(".hd .logo-l");
    return {
      background: getComputedStyle(document.body).backgroundColor,
      card: style(".stats .stat").backgroundColor,
      cardBorder: style(".stats .stat").borderTopColor,
      activeMenu: style('.side a[aria-current="page"]').backgroundColor,
      primaryAction: style(".page-head .btn-primary").backgroundColor,
      logoLoaded: logo.complete && logo.naturalWidth > 0,
    };
  });
  assert.deepEqual(colors, {
    background: "rgb(244, 245, 246)",
    card: "rgb(255, 255, 255)",
    cardBorder: "rgb(205, 209, 213)",
    activeMenu: "rgb(236, 242, 254)",
    primaryAction: "rgb(37, 110, 244)",
    logoLoaded: true,
  });
  results.push({
    check: "Reference request layout and rendered color regression",
    result: "PASS",
    ...colors,
  });
}

async function writeRequest(page, method, endpoint, data) {
  const csrf = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.fetch(endpoint, {
    method,
    data,
    headers: { [csrf.headerName]: csrf.token },
  });
  assert.equal(
    response.status(),
    200,
    `${method} ${endpoint}: ${response.status()}`,
  );
  return response.json();
}

async function arrangeReturnedRequest(page, created) {
  const values = {
    purpose: "공개 안내 자료를 조회하는 합성 서비스",
    audience: "가상 이용자",
    dataTypes: "공개 안내 문서",
    externalTransfer: "NO",
    period: "2026-11-06부터 2026-12-31까지",
    dataFlow: "가상 화면에서 공개 자료 조회",
  };
  const endpoint = `/api/security-requests/${created.id}`;
  let current = await writeRequest(page, "PATCH", `${endpoint}/answers`, {
    expectedRevision: created.revision,
    answers: created.answers
      .filter((field) => field.ownerRole === "APPLICANT")
      .map((field) => ({
        key: field.key,
        value: values[field.key] ?? "신청자가 확인한 합성 설명",
        confirmed: true,
        notApplicable: false,
      })),
  });
  current = await writeRequest(page, "POST", `${endpoint}/consult`, {
    expectedRevision: current.revision,
  });
  const infra = await account("INFRA");
  try {
    current = await writeRequest(infra.page, "POST", `${endpoint}/return`, {
      expectedRevision: current.revision,
      targetStage: 1,
      reason: "브라우저 검증용 사업 목적 보완 요청",
      fieldKeys: ["purpose"],
    });
    assert.equal(current.stage, 1);
    assert.equal(
      current.returnItems.find((item) => item.fieldKey === "purpose")
        .previousValue,
      values.purpose,
    );
    return current;
  } finally {
    await infra.context.close();
  }
}

try {
  const applicant = await account("APPLICANT");
  const page = applicant.page;
  await inspect(page, "requests-desktop");
  await inspectRequestDesign(page);
  await page.locator(".ubtn").click();
  await page.getByRole("button", { name: "화면 설정", exact: true }).click();
  const displayDialog = page.getByRole("dialog", { name: "화면 설정" });
  await displayDialog.waitFor();
  await displayDialog
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await displayDialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.activeElement?.classList.contains("ubtn"),
  );
  results.push({
    check: "Display dialog restores focus to the persistent account button",
    result: "PASS",
  });
  await page.goto("/workspace");
  await inspect(page, "workspace-desktop", false);
  await page.goto("/requests/new");
  await inspect(page, "new-request-desktop");
  await page.getByRole("button", { name: "기획서 없이 대화로 시작" }).click();
  await page
    .locator("#project-title")
    .fill("[브라우저 합성 검증] 공개 안내 서비스");
  await page.locator("#department").fill("가상 개발팀");
  await page
    .locator("#description")
    .fill(
      "실제 내부 정보 없이 공개 안내 자료로 화면과 서버 연결을 검증합니다.",
    );
  await page.getByRole("button", { name: "초안 생성 후 다음 단계" }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]+\/questions/);
  await page.locator("main h1").first().waitFor();
  const id = page.url().split("/")[4];
  const created = await (
    await page.request.get(`/api/security-requests/${id}`)
  ).json();
  assert.equal(created.stage, 1);
  assert.equal(created.title, "[브라우저 합성 검증] 공개 안내 서비스");
  results.push({
    check: "Browser form creates a server-persisted draft",
    result: "PASS",
  });
  const requests = await (
    await page.request.get("/api/security-requests")
  ).json();
  const returned = await arrangeReturnedRequest(page, created);
  {
    await page.goto(`/requests/${returned.id}/questions`);
    await page.locator(".return-notice").waitFor();
    assert(
      (await page.locator(".returned-field").count()) > 0,
      "Returned fields retain visible highlighting",
    );
    await inspect(page, "returned-request");
  }
  await page.goto("/requests/new");
  await page.getByLabel("사업 자료 파일 선택").setInputFiles({
    name: "synthetic-plan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "공개 안내 자료와 합성 질문만 사용하는 시연용 사업입니다.",
    ),
  });
  await page.locator("#project-title").fill("[브라우저 합성 검증] 자료 전달");
  await page.locator("#department").fill("가상 개발팀");
  await page
    .locator("#description")
    .fill("합성 TXT 파일의 선택과 전송을 분리하여 확인합니다.");
  await page.getByRole("button", { name: "초안 생성 후 다음 단계" }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]+\/analysis/);
  const fileRequestId = page.url().split("/")[4];
  await page.getByText("synthetic-plan.txt", { exact: true }).waitFor();
  const beforeAnalysis = await page.request.get(
    `/api/security-requests/${fileRequestId}/analysis`,
  );
  assert.equal(beforeAnalysis.status(), 200);
  assert.deepEqual(
    await beforeAnalysis.json(),
    [],
    "Selecting a file must not start analysis",
  );
  await inspect(page, "analysis-before-transmission");
  const responsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/api/security-requests/${fileRequestId}/analysis`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "파일 전송 및 AI 분석 시작" }).click();
  const analysisResponse = await responsePromise;
  assert.equal(analysisResponse.status(), 200);
  assert.equal((await analysisResponse.json()).status, "SUCCEEDED");
  results.push({
    check:
      "Selected file survives creation and is sent only on explicit analysis",
    result: "PASS",
  });
  for (const status of ["CLOSED", "WITHDRAWN"]) {
    const item = requests.find((entry) => entry.status === status);
    assert(item, `${status} synthetic scenario`);
    await page.goto(`/requests/${item.id}/receipt`);
    await page.locator(".terminal-notice").waitFor();
    assert.equal(
      await page
        .getByRole("button", {
          name: /^(이전 단계로 반환|신청 철회|종결\(반려\)|서류 확정|인프라 할당 완료|담당 분야 협의 완료)$/,
        })
        .count(),
      0,
    );
    await inspect(page, status.toLowerCase(), status === "CLOSED");
  }
  for (const role of ["INFRA", "SECURITY"]) {
    const specialist = await account(role);
    await specialist.page.goto("/workspace");
    await inspect(specialist.page, `${role.toLowerCase()}-workspace`, false);
    await specialist.context.close();
  }
  for (const [screen, name] of [
    ["requests", "reference-requests-preview"],
    ["new-request", "reference-new-request-preview"],
    ["infra", "reference-detail-preview"],
  ]) {
    await page.goto(`/design-preview/${screen}`);
    await inspect(page, name);
    if (screen === "infra") {
      await page
        .getByRole("region", { name: "사업 정보", exact: true })
        .getByText("AI 제안 · 미확정", { exact: true })
        .waitFor();
      results.push({
        check: "Detail summary preserves the unconfirmed AI source label",
        result: "PASS",
      });
    }
  }
  const administrator = await account("ADMIN");
  await administrator.page.goto("/admin/workflow");
  await inspect(administrator.page, "administrator-workflow");
  assert.match(
    await administrator.page.locator("main").innerText(),
    /ICT인프라/,
  );
  await administrator.context.close();
  const mobile = await account("APPLICANT", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  await mobile.page.goto("/requests");
  await inspect(mobile.page, "requests-mobile");
  const menu = mobile.page.getByRole("button", { name: "메뉴", exact: true });
  await menu.click();
  assert.equal(await menu.getAttribute("aria-expanded"), "true");
  results.push({
    check: "Mobile navigation expands with an accessible state",
    result: "PASS",
  });
  await mobile.context.close();
  const dark = await account("APPLICANT", { colorScheme: "dark" });
  await dark.page.goto("/requests");
  await inspect(dark.page, "requests-dark");
  const background = await dark.page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  const channels = background.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
  assert(
    channels.length === 3 && channels.reduce((a, b) => a + b, 0) < 500,
    `Dark mode background: ${background}`,
  );
  results.push({
    check: "System dark preference applies a dark background",
    result: "PASS",
    background,
  });
  await dark.context.close();
  await applicant.context.close();
  assert.deepEqual(pageErrors, [], "Browser runtime errors");
  await fs.writeFile(
    `${output}/results.json`,
    `${JSON.stringify({ results, pageErrors }, null, 2)}\n`,
  );
  console.log(
    `PASS Browser verification: ${results.length} checks; no uncaught page errors.`,
  );
} catch (error) {
  await fs.writeFile(
    `${output}/results.json`,
    `${JSON.stringify({ results, pageErrors, failure: String(error) }, null, 2)}\n`,
  );
  for (const [index, context] of browser.contexts().entries()) {
    const page = context.pages()[0];
    if (page && !page.isClosed()) {
      await page
        .screenshot({ path: `${output}/failure-${index}.png`, fullPage: true })
        .catch(() => {});
    }
  }
  throw error;
} finally {
  await browser.close();
}
