import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("coming-soon gate is responsive and accessible", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Uttara's seafood stop is coming online.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Staff preview" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("login exposes labelled, mobile-friendly controls", async ({ page }) => {
  await page.goto("/login?next=/");

  await expect(page.getByLabel("Email address")).toHaveAttribute("type", "email");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();

  const targetHeights = await page
    .locator("main input, main button, main a")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent?.trim() || node.getAttribute("name"),
        height: node.getBoundingClientRect().height,
      })),
    );
  expect(targetHeights.every((target) => target.height >= 44)).toBe(true);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("admin route redirects unauthenticated visitors to sign in", async ({
  page,
}) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/login\?next=\/admin$/);
  await expect(
    page.getByRole("heading", { name: "Welcome to Yamzo" }),
  ).toBeVisible();
});
