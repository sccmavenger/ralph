/**
 * MSF content filters for YouTube video discovery.
 */
/**
 * Returns true if the text contains at least one MSF keyword (case-insensitive).
 */
export declare function containsMsfKeyword(text: string): boolean;
/**
 * Returns true if the title contains a negative keyword (other game) without
 * also containing an MSF keyword. If an MSF keyword is present alongside a
 * negative keyword, the video is kept (MSF keyword takes precedence).
 */
export declare function isNegativeFiltered(title: string, description: string): boolean;
/**
 * Returns true if the video should be included in the knowledge base.
 * - Title or description must contain an MSF keyword
 * - Title must not contain negative keywords (unless also containing MSF keyword)
 */
export declare function isMsfContent(title: string, description: string): boolean;
//# sourceMappingURL=contentFilter.d.ts.map