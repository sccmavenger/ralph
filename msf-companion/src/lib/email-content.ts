import { EMAIL_PREFERENCE_LABELS, type EmailPreferenceKey } from "@/lib/email-preferences";

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}

export function appendMarketingFooter(
  html: string,
  unsubscribeLink: string,
  preference: EmailPreferenceKey
): string {
  const label = EMAIL_PREFERENCE_LABELS[preference];
  const footer = `<div style="text-align:center;padding:20px 0;border-top:1px solid #333;font-size:12px;color:#777"><p style="margin:0 0 8px">MSF Companion — Your Marvel Strike Force Assistant</p><a href="${unsubscribeLink}" style="color:#9ca3af;text-decoration:underline">Manage ${escapeEmailHtml(label.toLowerCase())}</a></div>`;
  return html.includes("</body>")
    ? html.replace("</body>", `${footer}</body>`)
    : `${html}${footer}`;
}
