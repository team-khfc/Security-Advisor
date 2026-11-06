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
  results.push({ check: name, result: "PASS", ...metrics });
  if (screenshot)
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
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
  await page.goto("/workspace");
  await inspect(page, "workspace-desktop");
  await page.goto("/requests/new");
  await inspect(page, "new-request-desktop", false);
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
  await page.waitForURL(/\/requests\/[0-9a-f-]+\/analysis/);
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
  await mobile.page.goto("/workspace");
  await inspect(mobile.page, "workspace-mobile");
  const menu = mobile.page.getByRole("button", { name: "주요 메뉴 열기" });
  await menu.click();
  assert.equal(await menu.getAttribute("aria-expanded"), "true");
  results.push({
    check: "Mobile navigation expands with an accessible state",
    result: "PASS",
  });
  await mobile.context.close();
  const dark = await account("APPLICANT", { colorScheme: "dark" });
  await dark.page.goto("/workspace");
  await inspect(dark.page, "workspace-dark");
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
