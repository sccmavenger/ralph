/**
 * MSF Blog Scraper — fetches and processes official MSF blog posts.
 */
export interface BlogPost {
    id: string;
    url: string;
    title: string;
    publishedDate: string;
    source: "official_blog";
    content: string;
    structured: BlogStructuredData;
    scrapedAt: string;
}
export interface BlogStructuredData {
    type: "patch_notes" | "character_kit" | "event_calendar" | "release_notes" | "general";
    patchNotes?: {
        changes: Array<{
            character?: string;
            change: string;
        }>;
    };
    characterKit?: {
        name: string;
        abilities: Array<{
            name: string;
            description: string;
        }>;
    };
    eventCalendar?: {
        events: Array<{
            name: string;
            startDate?: string;
            endDate?: string;
            requirements?: string;
        }>;
    };
    releaseNotes?: {
        version: string;
        highlights: string[];
    };
}
export interface BlogScraperDeps {
    fetchPage: (url: string) => Promise<string | null>;
    getStoredUrls: () => Promise<Set<string>>;
    storeBlogPost: (post: BlogPost) => Promise<void>;
}
/**
 * Extract blog post links from the MSF updates page.
 */
export declare function extractBlogLinks(html: string): Array<{
    url: string;
    title: string;
}>;
/**
 * Classify blog post type from title and content.
 */
export declare function classifyBlogPost(title: string, content: string): BlogStructuredData["type"];
/**
 * Extract structured data from blog post HTML content.
 */
export declare function extractStructuredData(html: string, type: BlogStructuredData["type"]): BlogStructuredData;
/**
 * Run the blog scraper pipeline.
 */
export declare function scrapeBlog(deps: BlogScraperDeps): Promise<{
    newPosts: number;
    skipped: number;
    errors: number;
}>;
//# sourceMappingURL=blogScraper.d.ts.map