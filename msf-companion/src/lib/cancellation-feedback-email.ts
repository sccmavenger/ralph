import {
  CANCELLATION_FEEDBACK_REASONS,
  type CancellationFeedbackReason,
} from "@/lib/cancellation-feedback";
import { escapeEmailHtml } from "@/lib/email-content";

export const CANCELLATION_FEEDBACK_EMAIL_SUBJECT =
  "What could The MSF Toolkit do better?";
export const CANCELLATION_FEEDBACK_EMAIL_PREHEADER =
  "One sentence is plenty—or just reply with a number.";

export interface CancellationFeedbackEmailContent {
  displayName: string;
  reasonUrls: Record<CancellationFeedbackReason, string>;
}

export function buildCancellationFeedbackEmailHtml(
  content: CancellationFeedbackEmailContent
): string {
  const name = escapeEmailHtml(content.displayName || "Commander");
  const reasons = CANCELLATION_FEEDBACK_REASONS.map(({ id, number, label }) => {
    const href = escapeEmailHtml(content.reasonUrls[id]);
    return `<tr><td style="width:28px;padding:7px 8px 7px 0;vertical-align:top;color:#9ca3af;font-weight:700">${number}</td><td style="padding:7px 0"><a href="${href}" style="color:#60a5fa;text-decoration:underline">${escapeEmailHtml(label)}</a></td></tr>`;
  }).join("");

  return `<!doctype html><html lang="en"><body style="margin:0;background:#0f0f23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e7eb"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${CANCELLATION_FEEDBACK_EMAIL_PREHEADER}</div><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="text-align:center;padding:20px 0;border-bottom:1px solid #333"><div style="display:inline-block;background:#dc2626;color:#fff;font-weight:800;padding:9px 14px;border-radius:7px;font-size:12px">MSF</div><h1 style="color:#4f9cf7;font-size:24px;margin:14px 0 0">What could The MSF Toolkit do better?</h1></div><div style="padding:20px 0;font-size:15px;line-height:1.7"><p>Hey ${name},</p><p>Thanks for giving The MSF Toolkit Premium a try. Since you decided to cancel, I’d genuinely like to understand what we could have done better.</p><p>I’m not writing to pitch you or ask you to reconsider. I’m trying to learn where the toolkit fell short so we can make better decisions about what to fix, simplify, or improve.</p><p><strong>What was the biggest reason you canceled?</strong></p><p>Just hit Reply and tell me in your own words. One sentence is plenty. Or reply with a number. You can also select a reason below to open a short feedback form:</p><table role="presentation" style="width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:8px;padding:10px 14px"><tbody>${reasons}</tbody></table><p>Thanks again for trying the toolkit. Any candid feedback you’re willing to share will be read and appreciated.</p><p>— The MSF Toolkit team</p></div></div></body></html>`;
}
