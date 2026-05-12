/**
 * End-to-end auth tests — runs against the live server.
 *
 * Usage:
 *   npx tsx tests/e2e-auth.test.ts
 *   BASE_URL=http://localhost:3000 npx tsx tests/e2e-auth.test.ts
 */

import "dotenv/config";

const BASE_URL = process.env.BASE_URL ?? "https://objection.wtf";

const TEST_USER = {
  email: `e2e-${Date.now()}@test.local`,
  username: `e2e_${Date.now().toString(36)}`,
  password: "E2eTestPass99!",
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    failed++;
  }
}

async function cleanup() {
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
  await prisma.$disconnect();
}

async function run() {
  console.log(`\nRunning e2e auth tests against ${BASE_URL}\n`);

  // ── 1. Registration ────────────────────────────────────────────────────────
  console.log("1. Registration");

  const regRes = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(TEST_USER),
  });
  const regBody = await regRes.json();

  assert(regRes.status === 201, `POST /api/register → 201`, `got ${regRes.status}: ${JSON.stringify(regBody)}`);
  assert(typeof regBody.id === "string", "response has id");
  assert(regBody.email === TEST_USER.email, "response has correct email");
  assert(regBody.username === TEST_USER.username, "response has correct username");

  // Duplicate email → 409
  const dupRes = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(TEST_USER),
  });
  assert(dupRes.status === 409, "duplicate email → 409");

  // Bad payload → 400
  const badRes = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", username: "x", password: "short" }),
  });
  assert(badRes.status === 400, "invalid payload → 400");

  // ── 2. Login via Auth.js ────────────────────────────────────────────────────
  console.log("\n2. Login");

  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json() as { csrfToken: string };
  assert(typeof csrfToken === "string" && csrfToken.length > 0, "CSRF token obtained");

  // Grab the session cookie that came with the CSRF response
  const rawSetCookie = csrfRes.headers.getSetCookie?.() ?? [];
  const cookieHeader = rawSetCookie.map((c) => c.split(";")[0]).join("; ");

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
    },
    body: new URLSearchParams({
      email: TEST_USER.email,
      password: TEST_USER.password,
      csrfToken,
      callbackUrl: `${BASE_URL}/lobby`,
    }),
    redirect: "manual",
  });

  assert(
    loginRes.status === 200 || loginRes.status === 302,
    `POST /api/auth/callback/credentials → 2xx/302`,
    `got ${loginRes.status}`,
  );

  // Collect session cookie
  const loginCookies = loginRes.headers.getSetCookie?.() ?? [];
  const sessionCookie = [...rawSetCookie, ...loginCookies]
    .map((c) => c.split(";")[0])
    .join("; ");

  // ── 3. Session check ───────────────────────────────────────────────────────
  console.log("\n3. Session");

  const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: sessionCookie },
  });
  const sessionBody = await sessionRes.json() as { user?: { email?: string } };

  assert(sessionRes.status === 200, "GET /api/auth/session → 200");
  assert(sessionBody?.user?.email === TEST_USER.email, "session contains correct user email");

  // ── 4. Wrong password ──────────────────────────────────────────────────────
  console.log("\n4. Wrong password rejected");

  const csrf2Res = await fetch(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken: csrf2 } = await csrf2Res.json() as { csrfToken: string };
  const cookie2 = (csrf2Res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const badLoginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie2 },
    body: new URLSearchParams({
      email: TEST_USER.email,
      password: "WrongPassword1!",
      csrfToken: csrf2,
      callbackUrl: `${BASE_URL}/lobby`,
    }),
    redirect: "manual",
  });

  // Auth.js redirects to /api/auth/error or /login?error=... on failure
  const badLoginCookies = badLoginRes.headers.getSetCookie?.() ?? [];
  const badSessionCookie = [...(csrf2Res.headers.getSetCookie?.() ?? []), ...badLoginCookies]
    .map((c) => c.split(";")[0])
    .join("; ");

  const badSessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: badSessionCookie },
  });
  const badSession = await badSessionRes.json() as { user?: unknown };
  assert(!badSession?.user, "wrong password → no session");

  // ── 5. Protected route redirect ────────────────────────────────────────────
  console.log("\n5. Auth guard");

  const protectedRes = await fetch(`${BASE_URL}/lobby`, { redirect: "manual" });
  assert(
    protectedRes.status === 302 || protectedRes.status === 307,
    "unauthenticated /lobby → redirect to login",
    `got ${protectedRes.status}`,
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exitCode = 1;
}

run()
  .catch((err) => {
    console.error("Unexpected error:", err);
    process.exitCode = 1;
  })
  .finally(cleanup);
