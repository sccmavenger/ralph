"use strict";
/**
 * MSF content filters for YouTube video discovery.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.containsMsfKeyword = containsMsfKeyword;
exports.isNegativeFiltered = isNegativeFiltered;
exports.isMsfContent = isMsfContent;
const MSF_KEYWORDS = [
    "msf",
    "marvel strike force",
    "strike force",
];
const NEGATIVE_KEYWORDS = [
    "marvel rivals",
    "future fight",
    "contest of champions",
    "swgoh",
    "galaxy of heroes",
];
/**
 * Returns true if the text contains at least one MSF keyword (case-insensitive).
 */
function containsMsfKeyword(text) {
    const lower = text.toLowerCase();
    return MSF_KEYWORDS.some((kw) => lower.includes(kw));
}
/**
 * Returns true if the title contains a negative keyword (other game) without
 * also containing an MSF keyword. If an MSF keyword is present alongside a
 * negative keyword, the video is kept (MSF keyword takes precedence).
 */
function isNegativeFiltered(title, description) {
    const lowerTitle = title.toLowerCase();
    const hasNegative = NEGATIVE_KEYWORDS.some((kw) => lowerTitle.includes(kw));
    if (!hasNegative)
        return false;
    // If both MSF and negative keywords are present, MSF wins
    return !containsMsfKeyword(title) && !containsMsfKeyword(description);
}
/**
 * Returns true if the video should be included in the knowledge base.
 * - Title or description must contain an MSF keyword
 * - Title must not contain negative keywords (unless also containing MSF keyword)
 */
function isMsfContent(title, description) {
    if (isNegativeFiltered(title, description))
        return false;
    return containsMsfKeyword(title) || containsMsfKeyword(description);
}
//# sourceMappingURL=contentFilter.js.map