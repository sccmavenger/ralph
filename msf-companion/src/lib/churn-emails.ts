/**
 * Churn prevention email templates — shared between the webhook route and functions.
 */
import { escapeEmailHtml } from "@/lib/email-content";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://themsftoolkit.com";

export function buildDunningEmailHtml(displayName: string): string {
  const name = escapeEmailHtml(displayName || "Commander");
  return `<html><body style="font-family: -apple-system, sans-serif; background: #0f0f23; color: #e0e0e0; padding: 0; margin: 0;">
<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #333;">
<div style="display: inline-block; background: #dc2626; color: white; font-weight: bold; padding: 8px 12px; border-radius: 6px; font-size: 12px;">MSF</div>
<h1 style="color: #f59e0b; margin: 10px 0 5px;">Action needed</h1>
</div>
<div style="padding: 20px 0;">
<p style="font-size: 15px; line-height: 1.6;">Hey ${name},</p>
<p style="font-size: 15px; line-height: 1.6;">Your MSF Companion Premium renewal couldn't be processed. This usually happens when a card expires or has insufficient funds.</p>
<p style="font-size: 15px; line-height: 1.6;">To keep your premium features active, please update your payment method:</p>
</div>
<div style="text-align: center; padding: 20px 0;">
<a href="${BASE_URL}/subscribe" style="display: inline-block; background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: 600; font-size: 14px;">Update Payment Method →</a>
</div>
<div style="padding: 10px 0;">
<p style="font-size: 13px; color: #888; text-align: center;">We'll automatically retry the payment, but updating your card ensures uninterrupted access.</p>
</div>
<div style="text-align: center; padding: 20px 0; border-top: 1px solid #333; font-size: 12px; color: #666;">
<p>MSF Companion — Your Marvel Strike Force Assistant</p>
</div>
</div></body></html>`;
}
