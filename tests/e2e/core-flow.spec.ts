import { expect, test, type Page } from "@playwright/test";

const SITE = "http://127.0.0.2:4599";
const unique = Date.now();

async function setVersion(v: number) {
  const res = await fetch(`${SITE}/__version?v=${v}`);
  expect(res.ok).toBeTruthy();
}

async function signUp(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Avery Analyst");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
}

test.describe.serial("core monitoring workflow", () => {
  let workspaceUrl = "";

  test("sign up, create workspace, add competitor, baseline, detect change, evidence, report", async ({ page }) => {
    await setVersion(1);
    await signUp(page, `e2e-${unique}@example.com`);

    // Onboarding: organization + first workspace
    await page.getByLabel("Organization name").fill("Brightwave Marketing");
    await page.getByLabel("First client workspace").fill("Client: Acme");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/competitors\/new\?onboarding=1/);
    workspaceUrl = page.url().split("/competitors")[0]!;

    // Add competitor → page suggestions
    await page.getByLabel("Website URL").fill(SITE);
    await page.getByRole("button", { name: /Check website/ }).click();
    await expect(page.getByText("Choose pages to monitor")).toBeVisible();
    await expect(page.getByText(`${SITE}/pricing`).first()).toBeVisible();
    // Select only homepage + pricing
    for (const box of await page.locator('ul input[type="checkbox"]').all()) {
      const id = await box.getAttribute("id");
      const want = id === `p-${SITE}/` || id === `p-${SITE}/pricing`;
      if ((await box.isChecked()) !== want && (await box.isEnabled())) await box.click();
    }
    await expect(page.getByText("2 pages selected")).toBeVisible();
    await page.getByRole("button", { name: "Start monitoring" }).click();

    // Baseline taken; no change claimed from a single snapshot
    await page.waitForURL(/\/competitors\/[0-9a-f-]{36}\?created=1/, { timeout: 60_000 });
    await expect(page.getByText("Monitoring is set up")).toBeVisible();
    await expect(page.getByText("2 of 2 pages have a baseline snapshot")).toBeVisible();
    await expect(page.getByText("No changes yet")).toBeVisible();

    // Competitor changes its price; run a permitted manual check
    await setVersion(2);
    const pricingRow = page.getByRole("row").filter({ hasText: `${SITE}/pricing` });
    await pricingRow.getByRole("button", { name: /Check now/ }).click();
    await expect(page.getByText(/Check finished: change detected/)).toBeVisible({ timeout: 30_000 });

    // Change history shows the verified pricing change
    await page.goto(`${workspaceUrl}/changes`);
    const change = page.getByRole("link", { name: /Growth plan monthly price increased from €29 to €39/ });
    await expect(change).toBeVisible();
    await change.click();

    // Evidence viewer
    await expect(page.getByRole("heading", { name: /Growth plan monthly price increased/ })).toBeVisible();
    await expect(page.getByText("Before vs after")).toBeVisible();
    await expect(page.getByText("Parsed pricing changes")).toBeVisible();
    await expect(page.getByText("Previous snapshot")).toBeVisible();
    await expect(page.getByText(/Observed facts/i)).toBeVisible();
    await expect(page.getByText("Rule-based", { exact: true })).toBeVisible(); // AI not configured → deterministic fallback, clearly labeled

    // Mark relevant
    await page.getByRole("button", { name: "Relevant", exact: true }).click();
    await expect(page.getByText("Thanks — marked as relevant.")).toBeVisible();

    // Dashboard reflects real stored data
    await page.goto(workspaceUrl);
    await expect(page.getByText("Competitive activity")).toBeVisible();
    await expect(page.getByText(/Growth plan monthly price increased/).first()).toBeVisible();

    // Generate a report and export PDF
    await page.goto(`${workspaceUrl}/reports`);
    await page.getByRole("button", { name: "Generate report" }).click();
    await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Pricing developments" })).toBeVisible();
    await expect(page.getByText("Monitoring coverage")).toBeVisible();
    const pdf = await page.request.get(`${page.url()}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Notifications: alert created, email honestly not sent
    await page.goto(`${workspaceUrl}/notifications`);
    await expect(page.getByText(/Email delivery is not configured/)).toBeVisible();
    await expect(page.getByText(/Fixture Analytics: Pricing/).first()).toBeVisible();

    // Search
    await page.goto(`${workspaceUrl}/search?q=Fixture`);
    await expect(page.getByRole("heading", { name: "Competitors" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Fixture Analytics/ }).first()).toBeVisible();
  });

  test("another user cannot open the first user's workspace", async ({ page }) => {
    expect(workspaceUrl).not.toBe("");
    await signUp(page, `intruder-${unique}@example.com`);
    const res = await page.goto(workspaceUrl);
    expect(res?.status()).toBe(404);
    const changes = await page.goto(`${workspaceUrl}/changes`);
    expect(changes?.status()).toBe(404);
  });

  test("onboarding rejects private and cloud-metadata addresses", async ({ page }) => {
    await signUp(page, `ssrf-${unique}@example.com`);
    await page.getByLabel("Organization name").fill("Probe Co");
    await page.getByLabel("First client workspace").fill("WS");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/competitors\/new/);
    await page.getByLabel("Website URL").fill("http://169.254.169.254/latest/meta-data/");
    await page.getByRole("button", { name: /Check website/ }).click();
    await expect(page.getByText(/private or reserved/i)).toBeVisible();
  });
});

test("explore demo shows clearly-labeled fictional data", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Live Demo" }).first().click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByText(/all companies, prices and changes are fictional/)).toBeVisible();
  await expect(page.getByText("Northstar Analytics").first()).toBeVisible();
  await page.goto(page.url() + "/compare");
  await expect(page.getByText("Compare competitors")).toBeVisible();
  await expect(page.getByText("Not available").first()).toBeVisible();
});
