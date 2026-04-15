import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Dev-only: Seed test commanders for admin panel E2E tests
// POST - create test commanders
// DELETE - clean up test commanders

const TEST_PREFIX = "e2e-admin-test-";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  // Clean up any leftover test commanders first
  await prisma.commander.deleteMany({
    where: { scopelyId: { startsWith: TEST_PREFIX } },
  });

  const commanders = await Promise.all([
    prisma.commander.create({
      data: {
        scopelyId: `${TEST_PREFIX}active-free`,
        displayName: "TestCommander Active",
        email: "active@test.com",
        subscriptionTier: "FREE",
        lastLoginAt: new Date(),
        disabled: false,
        hasCompletedOnboarding: true,
      },
    }),
    prisma.commander.create({
      data: {
        scopelyId: `${TEST_PREFIX}premium`,
        displayName: "TestCommander Premium",
        email: "premium@test.com",
        subscriptionTier: "PREMIUM",
        lastLoginAt: new Date(Date.now() - 3600000), // 1 hour ago
        disabled: false,
        hasCompletedOnboarding: true,
      },
    }),
    prisma.commander.create({
      data: {
        scopelyId: `${TEST_PREFIX}disabled`,
        displayName: "TestCommander Disabled",
        email: "disabled@test.com",
        subscriptionTier: "FREE",
        lastLoginAt: new Date(Date.now() - 86400000), // 1 day ago
        disabled: true,
        hasCompletedOnboarding: true,
      },
    }),
    prisma.commander.create({
      data: {
        scopelyId: `${TEST_PREFIX}no-email`,
        displayName: "TestCommander NoEmail",
        email: null,
        subscriptionTier: "FREE",
        lastLoginAt: null,
        disabled: false,
        hasCompletedOnboarding: true,
      },
    }),
  ]);

  return NextResponse.json({
    commanders: commanders.map((c) => ({
      id: c.id,
      scopelyId: c.scopelyId,
      displayName: c.displayName,
      email: c.email,
      subscriptionTier: c.subscriptionTier,
      disabled: c.disabled,
    })),
  });
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const result = await prisma.commander.deleteMany({
    where: { scopelyId: { startsWith: TEST_PREFIX } },
  });

  return NextResponse.json({ deleted: result.count });
}
