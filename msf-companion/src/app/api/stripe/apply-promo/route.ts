import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.scopelyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const promoCode = typeof body.promoCode === "string" ? body.promoCode.trim() : "";

  if (!promoCode) {
    return NextResponse.json({ error: "Promo code is required" }, { status: 400 });
  }

  try {
    // Look up the promotion code in Stripe
    const promoCodes = await stripe.promotionCodes.list({
      code: promoCode,
      active: true,
      limit: 1,
      expand: ["data.promotion.coupon"],
    });

    if (promoCodes.data.length === 0) {
      return NextResponse.json({ error: "Invalid or expired promo code" }, { status: 404 });
    }

    const promoCodeObj = promoCodes.data[0];
    const coupon = typeof promoCodeObj.promotion.coupon === "object" ? promoCodeObj.promotion.coupon : null;

    if (!coupon) {
      return NextResponse.json({ error: "Could not resolve coupon details" }, { status: 500 });
    }

    // Build description
    let description = "";
    if (coupon.percent_off) {
      description = `${coupon.percent_off}% off`;
    } else if (coupon.amount_off) {
      description = `$${(coupon.amount_off / 100).toFixed(2)} off`;
    }
    if (coupon.duration === "once") {
      description += " your first month";
    } else if (coupon.duration === "repeating" && coupon.duration_in_months) {
      description += ` for ${coupon.duration_in_months} months`;
    } else if (coupon.duration === "forever") {
      description += " forever";
    }

    // Apply the promotion code to the commander's subscription
    const commander = await prisma.commander.findUnique({
      where: { scopelyId: session.scopelyId },
      select: { stripeSubscriptionId: true },
    });

    if (commander?.stripeSubscriptionId) {
      await stripe.subscriptions.update(commander.stripeSubscriptionId, {
        discounts: [{ promotion_code: promoCodeObj.id }],
      });
    }

    return NextResponse.json({
      description,
      promoCodeId: promoCodeObj.id,
    });
  } catch {
    return NextResponse.json({ error: "Failed to verify promo code" }, { status: 500 });
  }
}
