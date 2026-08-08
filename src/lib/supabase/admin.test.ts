import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { createAdminRestFetch } from "@/lib/supabase/admin";

const modernSecretKey = "sb_secret_test_admin_key";
const legacyServiceRoleKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";

function response(): Response {
  return new Response("[]", {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function createFetchSpy() {
  return vi.fn<typeof fetch>(async (...args) => {
    void args;
    return response();
  });
}

describe("Supabase admin REST fetch compatibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a modern secret key only in apikey for REST calls", async () => {
    const fetchImpl = createFetchSpy();
    const fetchWithCompatibility = createAdminRestFetch(
      modernSecretKey,
      fetchImpl,
    );

    await fetchWithCompatibility("https://project.supabase.co/rest/v1/orders", {
      headers: {
        apikey: modernSecretKey,
        authorization: `Bearer ${modernSecretKey}`,
      },
    });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("apikey")).toBe(modernSecretKey);
    expect(headers.has("authorization")).toBe(false);
  });

  it("applies the compatibility layer to a real Supabase REST query", async () => {
    const fetchImpl = createFetchSpy();
    const client = createClient("https://project.supabase.co", modernSecretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: { fetch: createAdminRestFetch(modernSecretKey, fetchImpl) },
    });

    await client.from("orders").select("id");

    const [, init] = fetchImpl.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("apikey")).toBe(modernSecretKey);
    expect(headers.has("authorization")).toBe(false);
  });

  it("preserves a user or session Authorization header", async () => {
    const fetchImpl = createFetchSpy();
    const fetchWithCompatibility = createAdminRestFetch(
      modernSecretKey,
      fetchImpl,
    );

    await fetchWithCompatibility("https://project.supabase.co/rest/v1/orders", {
      headers: { authorization: "Bearer user-session-token" },
    });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer user-session-token");
    expect(headers.get("apikey")).toBe(modernSecretKey);
  });

  it("leaves legacy service-role JWT authorization behavior unchanged", async () => {
    const fetchImpl = createFetchSpy();
    const fetchWithCompatibility = createAdminRestFetch(
      legacyServiceRoleKey,
      fetchImpl,
    );

    await fetchWithCompatibility("https://project.supabase.co/rest/v1/orders", {
      headers: {
        apikey: legacyServiceRoleKey,
        authorization: `Bearer ${legacyServiceRoleKey}`,
      },
    });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("apikey")).toBe(legacyServiceRoleKey);
    expect(headers.get("authorization")).toBe(
      `Bearer ${legacyServiceRoleKey}`,
    );
  });

  it("does not alter non-REST calls", async () => {
    const fetchImpl = createFetchSpy();
    const fetchWithCompatibility = createAdminRestFetch(
      modernSecretKey,
      fetchImpl,
    );
    const headers = new Headers({
      apikey: modernSecretKey,
      authorization: `Bearer ${modernSecretKey}`,
    });

    await fetchWithCompatibility("https://project.supabase.co/auth/v1/admin/users", {
      headers,
    });

    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.headers).toBe(headers);
  });
});
