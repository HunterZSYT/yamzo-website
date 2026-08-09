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

test("order tracking keeps account actions inside an accessible menu", async ({
  page,
}) => {
  await page.goto("/order-status");

  await expect(page.getByText("Save your order history")).toBeVisible();
  const googleSignIn = page.getByRole("button", {
    name: "Continue with Google",
  });
  const emailSignIn = page.getByRole("link", {
    name: "Sign in to save orders",
  });
  await expect(googleSignIn.or(emailSignIn)).toBeVisible();
  expect((await googleSignIn.count()) + (await emailSignIn.count())).toBe(1);

  await page.getByRole("button", { name: "Open navigation menu" }).click();

  const quickLinks = page.getByRole("navigation", { name: "Quick links" });
  await expect(quickLinks.getByRole("link")).toHaveCount(2);
  await expect(
    quickLinks.getByRole("link", { name: "Track orders" }),
  ).toHaveAttribute("href", "/order-status");
  await expect(
    quickLinks.getByRole("link", { name: "Sign in" }),
  ).toHaveAttribute("href", "/login?next=%2Forder-status");

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
