"use strict";
/**
 * Reddit fetcher library — fetches and filters top Reddit posts from r/MarvelStrikeForce.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTopPosts = fetchTopPosts;
exports.filterRelevantPosts = filterRelevantPosts;
exports.formatPostAsDocument = formatPostAsDocument;
const EXCLUDED_FLAIRS = ["humor", "meme", "shitpost", "fan art", "fan content"];
async function fetchTopPosts(timeframe) {
    const response = await fetch(`https://www.reddit.com/r/MarvelStrikeForce/top.json?t=${timeframe}&limit=50`, {
        headers: {
            "User-Agent": "MSFCompanion/1.0 (KB Sync; reddit@themsftoolkit.com)",
        },
    });
    if (!response.ok)
        return [];
    const data = (await response.json());
    return (data.data?.children || [])
        .filter((c) => c.data.is_self)
        .map((c) => ({
        id: c.data.id,
        title: c.data.title,
        selftext: c.data.selftext,
        score: c.data.score,
        num_comments: c.data.num_comments,
        link_flair_text: c.data.link_flair_text,
        created_utc: c.data.created_utc,
        permalink: c.data.permalink,
    }));
}
function filterRelevantPosts(posts) {
    return posts.filter((post) => {
        if (post.score < 30)
            return false;
        if (!post.selftext || post.selftext.trim().length === 0)
            return false;
        if (post.link_flair_text) {
            const flair = post.link_flair_text.toLowerCase();
            if (EXCLUDED_FLAIRS.some((ef) => flair.includes(ef)))
                return false;
        }
        return true;
    });
}
function classifyRedditCategory(title, flair) {
    const lower = ((flair || "") + " " + title).toLowerCase();
    if (lower.includes("war") || lower.includes("alliance"))
        return "war-meta";
    if (lower.includes("crucible") || lower.includes("arena"))
        return "crucible";
    if (lower.includes("dark dimension") || lower.includes("dd"))
        return "dark-dimension";
    if (lower.includes("iso") || lower.includes("gear"))
        return "iso-8";
    if (lower.includes("team") || lower.includes("comp") || lower.includes("build"))
        return "team-comp";
    if (lower.includes("farm") || lower.includes("unlock"))
        return "farming";
    return "general";
}
function formatPostAsDocument(post) {
    const createdDate = new Date(post.created_utc * 1000).toISOString().split("T")[0];
    const category = classifyRedditCategory(post.title, post.link_flair_text);
    return {
        id: `reddit-${post.id}`,
        content: `${post.title}\n\n${post.selftext}`.slice(0, 5000),
        category,
        sourceCreatorName: "Reddit Community",
        sourceVideoTitle: post.title,
        sourceUrl: `https://www.reddit.com${post.permalink}`,
        sourceDate: createdDate,
        sourceTier: 3,
        sourceType: "reddit-post",
    };
}
//# sourceMappingURL=redditFetcher.js.map