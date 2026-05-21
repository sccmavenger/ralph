/**
 * Reddit fetcher library — fetches and filters top Reddit posts from r/MarvelStrikeForce.
 */
import type { KBDocument } from "./kbGameData.js";
export interface RedditPost {
    id: string;
    title: string;
    selftext: string;
    score: number;
    num_comments: number;
    link_flair_text: string | null;
    created_utc: number;
    permalink: string;
}
export declare function fetchTopPosts(timeframe: "day" | "week"): Promise<RedditPost[]>;
export declare function filterRelevantPosts(posts: RedditPost[]): RedditPost[];
export declare function formatPostAsDocument(post: RedditPost): KBDocument;
//# sourceMappingURL=redditFetcher.d.ts.map