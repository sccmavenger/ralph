import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getScopelyId } from "@/lib/scopely-id";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scopelyId = await getScopelyId(false);
  if (!scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { id: true },
  });
  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json(
      { error: "Invalid push subscription data" },
      { status: 400 }
    );
  }

  await prisma.pushSubscription.upsert({
    where: {
      commanderId_endpoint: {
        commanderId: commander.id,
        endpoint: body.endpoint,
      },
    },
    update: {
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
    create: {
      commanderId: commander.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scopelyId = await getScopelyId(false);
  if (!scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commander = await prisma.commander.findUnique({
    where: { scopelyId },
    select: { id: true },
  });
  if (!commander) {
    return NextResponse.json({ error: "Commander not found" }, { status: 404 });
  }

  const body = (await request.json()) as { endpoint: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({
    where: {
      commanderId: commander.id,
      endpoint: body.endpoint,
    },
  });

  return NextResponse.json({ success: true });
}
