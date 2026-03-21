
# PRD: G-Force Social Media

## Introduction

G-Force Social Media is an Instagram-first **responsive web application** for a small mobile development company in St. Louis, Missouri. It addresses three core business pains:

- Difficulty consistently creating high-quality Instagram posts.
- Uncertainty about which hashtags and topics reach the right audience.
- Limited account growth and lead generation due to manual, inconsistent operations.

v1 scope remains Instagram-only and desktop-first, but must deliver a strong mobile web experience. The product automates the core workflow: generate content, recommend hashtags, schedule/publish, and optimize based on outcomes.

## Goals

- Generate Instagram-ready post drafts tailored to startup founders who need mobile app development.
- Recommend audience-fit hashtags that improve discoverability while reducing risk.
- Automate scheduling and publishing to reduce manual account management effort.
- Increase qualified inbound leads from Instagram within 90 days.
- Deliver reliable desktop and mobile web experiences for all core workflows.
- Establish a source-backed, standards-based security and accessibility baseline from day one.

## User Stories

### US-001: Connect Instagram Professional Account
**Description:** As a business owner, I want to securely connect my Instagram professional account so the app can publish and read insights.

**Acceptance Criteria:**
- [ ] User can connect one Instagram Business or Creator account using OAuth.
- [ ] Connection prerequisites are validated and surfaced with actionable errors.
- [ ] Access and refresh tokens are encrypted at rest and never logged in plaintext.
- [ ] User can disconnect account and revoke access cleanly.
- [ ] Connection state is visible as Connected, Expired, or Error.
- [ ] Typecheck/lint passes.

### US-002: Business Profile and Audience Setup
**Description:** As a business owner, I want to define business context and audience so generated content is relevant.

**Acceptance Criteria:**
- [ ] Onboarding captures services, niche, tone, audience, and location.
- [ ] Default location is St. Louis, Missouri and can be edited.
- [ ] Profile changes are versioned and recoverable.
- [ ] Generation jobs require valid business profile context.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-003: AI Content Draft Generation
**Description:** As a business owner, I want weekly post ideas and captions generated so I can maintain a consistent publishing cadence.

**Acceptance Criteria:**
- [ ] User can request a weekly content batch with configurable count.
- [ ] Each draft includes hook, caption, CTA, and visual brief.
- [ ] Drafts can be edited and approved before scheduling.
- [ ] System stores generation metadata (provider, model, prompt template version).
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-004: Hashtag Intelligence and Risk Filtering
**Description:** As a business owner, I want grouped hashtag recommendations with rationale so posts reach startup founders and local prospects.

**Acceptance Criteria:**
- [ ] Each draft gets 15-30 hashtags grouped by broad, niche, and local.
- [ ] Every hashtag includes rationale tags (audience, service, location, trend).
- [ ] High-risk or blocked hashtags are excluded by default.
- [ ] User can save reusable hashtag sets and lock preferred tags.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-005: Automated Scheduling and Publishing
**Description:** As a business owner, I want approved content automatically scheduled and published so my account stays active without manual posting.

**Acceptance Criteria:**
- [ ] User can define weekly posting cadence by day/time.
- [ ] Approved drafts are assigned to next available slots.
- [ ] System publishes via API at scheduled times.
- [ ] Publish failures retry with policy and emit alerts.
- [ ] Publish attempts and outcomes are audit logged.
- [ ] Typecheck/lint passes.

### US-006: Performance and Lead Tracking Dashboard
**Description:** As a business owner, I want visibility into follower growth and lead outcomes so I can improve strategy.

**Acceptance Criteria:**
- [ ] Dashboard shows followers, reach, profile visits, link clicks, and engagement.
- [ ] Leads are attributable via UTM/tracked link strategy.
- [ ] Dashboard supports 7-day and 30-day trend analysis.
- [ ] Filters exist for date, hashtag set, and content type.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-007: Responsive Web UX (Desktop-First, Mobile-Strong)
**Description:** As a user, I want a seamless experience on desktop and mobile web so I can manage content anywhere.

**Acceptance Criteria:**
- [ ] Core workflows are fully usable at desktop and 320px mobile widths.
- [ ] No horizontal scrolling in core app screens at 320px width.
- [ ] Touch targets meet minimum 24x24 CSS pixels on mobile views.
- [ ] Navigation and forms are keyboard accessible.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

### US-008: AI Provider Connectors (Optional in v1)
**Description:** As a business owner, I want optional AI provider configuration so I can choose OpenAI, Azure OpenAI, or Perplexity later.

**Acceptance Criteria:**
- [ ] App supports pluggable provider interface for OpenAI, Azure OpenAI, and Perplexity.
- [ ] v1 can ship with provider integration disabled by default.
- [ ] Provider credentials are stored securely and rotated without downtime.
- [ ] Provider failures degrade gracefully with fallback messaging.
- [ ] Typecheck/lint passes.

### US-009: Security Baseline and Verification
**Description:** As a product owner, I want security controls aligned to recognized standards so the app can be trusted.

**Acceptance Criteria:**
- [ ] Security requirements map to OWASP ASVS v5.0.0 Level 2 control set.
- [ ] OWASP Top 10 (2025) threat coverage is documented per release.
- [ ] Secrets management, encryption, and audit logging requirements are testable.
- [ ] SAST/dependency scanning runs in CI for all PRs.
- [ ] Typecheck/lint passes.

### US-010: Viral Confidence Score (Pre-Publish Prediction)
**Description:** As a business owner, I want a data-driven confidence score predicting each post's viral potential before publishing so I can prioritize high-impact content and improve weaker drafts.

**Acceptance Criteria:**
- [ ] Every draft displays a composite Viral Confidence Score (0.00–1.00) before approval.
- [ ] Score breakdown shows individual sub-scores for each scoring dimension so the user understands _why_ and _what to improve_.
- [ ] Sub-scores cover at minimum: Content Quality, Engagement Potential, Account Health, and Virality Indicators.
- [ ] Score is recalculated automatically when the user edits a draft (caption, hashtags, media, or scheduled time).
- [ ] Score includes a plain-language recommendation for the single highest-impact improvement.
- [ ] Historical post performance (from Instagram Insights API) feeds back into the scoring model to calibrate future predictions.
- [ ] Score tiers are visually distinct: Low (0.00–0.39 red), Moderate (0.40–0.59 yellow), Good (0.60–0.79 green), High (0.80–1.00 gold).
- [ ] Score accuracy is tracked: predicted score vs actual reach/engagement is logged per post for model improvement.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

## Functional Requirements

- FR-1: The system must support secure OAuth connection to one Instagram professional account.
- FR-2: The system must require and persist business profile context (service, audience, location, tone).
- FR-3: The system must generate structured content drafts (hook, body, CTA, visual brief).
- FR-4: The system must generate and classify hashtags as broad, niche, and local.
- FR-5: The system must enforce hashtag risk filtering before approval/publishing.
- FR-6: The system must support reusable hashtag libraries.
- FR-7: The system must support automated scheduling with user-defined cadence.
- FR-8: The system must publish scheduled posts to Instagram and record response IDs.
- FR-9: The system must retry failed publishes using configurable retry policy.
- FR-10: The system must log publish and automation events in an immutable audit trail.
- FR-11: The system must provide analytics for growth, engagement, and profile actions.
- FR-12: The system must support lead attribution via tracked links/UTMs.
- FR-13: The system must provide trend reporting for 7-day and 30-day windows.
- FR-14: The web app must provide complete functionality on desktop and mobile web form factors.
- FR-15: The app must implement a provider abstraction for OpenAI, Azure OpenAI, and Perplexity.
- FR-16: AI providers must be optional at v1 launch and configurable post-launch.
- FR-16a: If multiple AI providers are enabled, the user must select provider per workflow (no global default provider requirement).
- FR-17: The system must implement ASVS-aligned authentication, authorization, validation, and logging controls.
- FR-18: The system must maintain documented source links for major technical and policy decisions.
- FR-19: The architecture must preserve compatibility for optional Resend integration in a future iteration.
- FR-20: Local targeting controls must be optional per campaign and not globally forced.
- FR-21: Full auto-publish must require both blocked-term validation and minimum confidence-threshold validation.
- FR-22: Auto-publish confidence threshold is set to 0.80 for v1.
- FR-23: High-intent DM lead qualification must require one or more of the following signals: budget mention, delivery timeline mention, pricing/proposal request, call/meeting request, or concrete website/app idea details.
- FR-24: The system must compute a composite Viral Confidence Score (0.00–1.00) for every content draft before it is approved or published.
- FR-25: The Viral Confidence Score must be derived from four weighted dimensions: Content Quality (0.25), Engagement Potential (0.25), Account Health (0.15), and Virality Indicators (0.35).
- FR-26: Content Quality sub-score must evaluate hook strength, caption quality (length, readability, CTA presence), visual quality (resolution, no watermarks, no borders, proper aspect ratio), and format alignment (Reel vs Carousel vs Photo trend fit).
- FR-27: Engagement Potential sub-score must evaluate hashtag relevance (from FR-4/FR-5), posting time optimization (alignment with audience active hours from Insights API), topic trend alignment, and target audience fit.
- FR-28: Account Health sub-score must evaluate account recommendation eligibility (no guideline violations), historical engagement rate baseline, and follower growth velocity.
- FR-29: Virality Indicators sub-score must evaluate shareability (likelihood of reshare — the dominant Explore/Reels distribution signal), save-worthiness (educational/reference value), comment trigger potential, and for video content, predicted watch-through rate.
- FR-30: The system must use AI provider analysis (when an AI provider is enabled via FR-15/FR-16) to assess caption strength, hook quality, shareability, and save-worthiness as inputs to the score.
- FR-31: The system must implement a calibration feedback loop that compares predicted Viral Confidence Score against actual post performance (reach, engagement rate, saves, shares from Instagram Insights API) and persists prediction-vs-actual logs for ongoing model accuracy improvement.

## Non-Goals (Out of Scope)

- Native iOS and Android apps in v1.
- Multi-platform posting (Facebook, LinkedIn, X, TikTok) in v1.
- Paid ad campaign management in v1.
- DM automation/chatbot flows in v1.
- Full CRM/pipeline management replacement in v1.
- Resend-powered email delivery in v1 (deferred to later iteration).

## Design Considerations

- Desktop-first information density, with mobile-first touch usability standards.
- Single daily workflow emphasis: plan, approve, schedule, monitor.
- Confidence indicators for hashtags, AI suggestions, and viral potential.
- Clear automation state: manual, approval-required, fully automated.
- Progressive disclosure to keep solo-owner workflow fast and low-friction.
- Viral Confidence Score displayed as a prominent gauge/badge on each draft card with color-coded tier (red/yellow/green/gold).
- Score breakdown expandable panel showing each sub-score with explanatory label and one-line improvement tip.
- Before/after score comparison when user edits a draft, so the impact of each change is visible.

## Technical Considerations

- Validate Instagram API constraints early (professional account requirements, publish limits, media requirements).
- Use a background job queue for scheduling/retries and idempotent publish operations.
- Implement provider abstraction layer for optional AI integrations.
- Apply OWASP ASVS v5.0.0 Level 2 control mapping and evidence tracking.
- Use secure secret storage with key rotation process for all provider/API keys.
- Build responsive design with accessibility target of WCAG 2.2 AA.
- Reserve notification architecture so Resend can be enabled in future iterations.
- Viral Confidence Score engine must be modular: each sub-score dimension is an independent scorer behind a common interface so weights and scorers can be tuned without rewriting the composite.
- Instagram Insights API data (reach, engagement, saves, shares, views) must be ingested on a scheduled cadence (at least daily) to feed the calibration loop and Account Health sub-score.
- For v1 the scoring model is rule-based and heuristic-weighted (not ML); weights are configurable per environment so they can be tuned as real data accumulates.
- If no AI provider is enabled, Content Quality sub-score falls back to rule-based heuristics (caption length, hashtag count, media resolution checks) rather than AI analysis.
- Prediction-vs-actual logs must be stored in a structured format to enable future migration to a trained ML model when sufficient historical data exists.

## Security and Compliance Baseline

- Primary baseline: OWASP ASVS v5.0.0 Level 2.
- Risk awareness baseline: OWASP Top 10 (2025).
- Web accessibility baseline: WCAG 2.2 AA.
- Authentication and session handling must be documented and tested.
- Input validation and output encoding must be centralized and testable.
- Audit logs for auth, publish, and policy actions are required.

## Success Metrics

- Increase qualified inbound leads from Instagram by at least 30% within 90 days.
- Qualified inbound lead definition for v1: high-intent Instagram DM.
- High-intent DM signal set for v1: budget mention, timeline mention, pricing/proposal request, call/meeting request, or concrete app/business details.
- Reduce weekly account-management time by at least 50%.
- Achieve at least 90% on-time auto-publish success rate.
- Improve average engagement per post by at least 20% over baseline.
- Achieve 95% task success rate for top 5 workflows on mobile web usability testing.
- Viral Confidence Score prediction accuracy: achieve ≥ 0.60 rank correlation (Spearman's ρ) between predicted score and actual reach within 90 days of launch.
- Posts scoring ≥ 0.80 Viral Confidence must outperform account average engagement rate by at least 2× within the first 30 published posts.
- Users who edit drafts based on score recommendations should see measurable score improvement on ≥ 70% of re-scored drafts.

## Recommendations

- Recommendation 1: Keep provider feature flags so OpenAI, Azure OpenAI, and Perplexity can be enabled independently by environment.
- Recommendation 2: Instrument DM intent scoring rubric now so high-intent lead classification is measurable and auditable.
- Recommendation 3: Add a publish-safety checklist before full automation is enabled on an account.
- Recommendation 4: Add source-traceability metadata to architecture decision records (ADR) for all major choices.
- Recommendation 5: Keep Resend in the architecture runway, but prioritize delivery only after post-v1 metrics justify email automation.
- Recommendation 6: Start the Viral Confidence Score as a rule-based heuristic engine with configurable weights. Once 100+ prediction-vs-actual data points accumulate, evaluate migrating to a lightweight regression model for improved accuracy.
- Recommendation 7: Weight Virality Indicators (shares, saves, comment triggers) highest (0.35) because Meta's official algorithm documentation confirms these are the dominant signals for Explore and Reels distribution to non-followers.
- Recommendation 8: Surface the single highest-impact improvement suggestion alongside the score (e.g., "Add a question to your caption to boost comment trigger potential") to make the score actionable, not just informational.
- Recommendation 9: Log every score prediction alongside actual post performance permanently. This dataset becomes the foundation for a future ML model and is the most valuable proprietary asset the product will generate.

## Open Questions

- Do you want AI-generated image prompts only, or direct image generation in a later phase?
- Do you want high-intent lead classification to require any one signal or at least two signals?

## Source-Backed Decision Log

- Instagram publishing constraints and rate-limit logic are based on Meta Instagram Platform docs and content publishing docs.
- Responsive/mobile accessibility requirements are based on WCAG 2.2 success criteria and conformance guidance.
- Security verification baseline uses OWASP ASVS v5.0.0 and OWASP Top 10 (2025).
- Optional AI connectors are based on official provider API documentation for OpenAI, Azure OpenAI, and Perplexity.
- Future email-provider pathway is based on Resend documentation as an email API for developers.
- Viral Confidence Score dimension weights are grounded in Meta's official algorithm ranking posts (Adam Mosseri, 2023). Shares and saves are weighted highest because Meta's Explore and Reels ranking documentation explicitly states popularity signals (how many and how quickly people like, comment, share, and save) "matter much more in Explore than they do in Feed or in Stories."
- Virality Indicators include shareability as the dominant signal because Reels ranking predicts "how likely you are to reshare a reel" as the #1 prediction factor.
- Anti-virality checks (watermarks, low-resolution, borders, majority text) are sourced from Meta's Reels Recommendation Guidelines which state these factors cause reels to be "less visible."
- Account Health scoring is informed by Instagram's Account Status feature and Recommendation Guidelines — accounts with repeated guideline violations are ineligible for recommendation for a period of time.
- Watch-through rate for video content is included because Reels ranking uses "watch a reel all the way through" as a top prediction signal.
- Calibration feedback loop uses Instagram Insights API metrics (reach, engagement, views, saves, shares) as documented in Meta's Insights API and IG Media Insights reference.

## Sources

- Meta Instagram Platform overview: https://developers.facebook.com/docs/instagram-platform
- Meta Instagram content publishing guide: https://developers.facebook.com/docs/instagram-platform/content-publishing
- OWASP ASVS project (v5.0.0 references): https://owasp.org/www-project-application-security-verification-standard/
- OWASP Top 10 (2025): https://owasp.org/www-project-top-ten/
- WCAG 2.2 (W3C Recommendation): https://www.w3.org/TR/WCAG22/
- OpenAI platform overview: https://platform.openai.com/docs/overview
- Azure OpenAI overview: https://learn.microsoft.com/azure/ai-services/openai/overview
- Perplexity API docs: https://docs.perplexity.ai/
- Resend documentation: https://resend.com/docs
- Instagram Ranking Explained (Adam Mosseri, May 2023 — official algorithm ranking signals): https://about.instagram.com/blog/announcements/instagram-ranking-explained
- Shedding More Light on How Instagram Works (Adam Mosseri, June 2021 — original algorithm transparency post): https://about.instagram.com/blog/announcements/shedding-more-light-on-how-instagram-works
- Instagram Media Insights API reference (available metrics for calibration): https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
- Instagram Insights guide (account-level metrics): https://developers.facebook.com/docs/instagram-platform/insights
