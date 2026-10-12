# LifeMode Editorial Knowledge Base — Phase 1

Status: local safety and inventory work only. No article content, images, credentials, deployment settings, or production data were changed.

## 1. Phase 1 safety change

The scheduled editorial workflow is paused. `.github/workflows/editorial-automation.yml` now sets `LIFEMODE_AUTOMATION_ENABLED`, `LIFEMODE_AUTOMATION_COMMIT`, `LIFEMODE_AUTOMATION_PUSH`, and `LIFEMODE_IMAGE_ENABLED` to `false`. `scripts/run-scheduled-automation.ts` no longer overrides the environment switch with `enabled: true`.

This disables the normal editorial path at its scheduled entry point and prevents automatic editorial image generation. The separate `.github/workflows/social-automation.yml` and `scripts/run-social-automation.ts` path were not changed. Tools, Life Hacks, and Daily Ideas Store remain outside the normal article collection and were not changed.

## 2. Existing architecture to reuse

| Concern | Existing component | Phase 1 finding |
| --- | --- | --- |
| Discovery | `src/lib/editorial/discovery/runner.ts`, `adapters/*`, `storage.ts`, `data/topics/*.json` | Reusable candidate ingestion and persistence. Signals must remain discovery evidence, not factual proof. |
| Editorial runner | `src/lib/editorial/automation/runner.ts`, `scheduler.ts`, `watchdog.ts` | Reusable orchestration, but scheduled execution must remain paused until human approval is a first-class gate. |
| Briefing | `brief.ts`, `fact-sheet.ts`, `generation/brief-adapter.ts` | Good home for reader problem, intent, format, risk, evidence, and structured facts. |
| Research | `research/runner.ts`, `research/types.ts`, `research/providers/*`, `sources/registry.ts` | Reusable evidence contract and provenance. Web research must not be treated as proof without source review. |
| Draft/review | `generation/*`, `review/*`, `validation/*` | Reusable AI-assisted drafting, deterministic validation, and QA; not an approval substitute. |
| Storage/serializer | `storage/repository.ts`, `storage/serializer.ts`, `storage/types.ts` | Reusable filesystem Markdown/frontmatter model and safe path handling. |
| Publishing adapter | `publishing/runner.ts`, `publishing/gate.ts`, `storage/publishing-adapter.ts`, `git-publisher/*` | Reusable package/gate/persistence layers, but a human-approval state must precede live storage/Git publication. |
| Layout | `src/layouts/GuideLayout.astro` | Reusable practical guide shell: direct answer, facts, decision matrix, steps, mistakes, tips, FAQs, sources, and related links. |
| Schema | `src/content.config.ts` | Reusable structured frontmatter schema with optional image fields; the new policy should keep images optional. |
| Search | `src/pages/search.json.ts`, `src/components/SearchModal.astro` | Existing content index/search path can consume approved Markdown without a competing index. |
| Category routes | `src/pages/[category]/index.astro`, `src/pages/[category]/[slug].astro`, plus specialized routes | Reusable normal article routes; Tools and Life Hacks have dedicated routes and must remain separate. |

## 3. Reference project inspected

The local `C:\Users\opeti\EverydayGuide` directory was inspected directly. Relevant files read:

- `src/content/guides/cookware-material-decision-guide.md`
- `src/layouts/GuideLayout.astro`
- `src/content.config.ts`
- `src/pages/guides/index.astro`
- `src/pages/[category]/[slug].astro`
- `src/pages/search.json.ts`
- `src/pages/editorial-standards.astro`
- representative practical guides including `how-to-prepare-home-for-winter.md`, `how-to-remove-coffee-stains.md`, `how-to-store-seasonal-clothes.md`, and `which-refrigerator-size-do-you-need.md`

The reusable principles are visible in the implementation: answer-first summaries, explicit difficulty/time, key facts, decision criteria and comparison rows, step-by-step protocols, common mistakes, FAQs, named sources, and related guide/tool/checklist links. The cookware guide is a decision guide rather than a generic article: it starts with a choice matrix, compares materials against explicit criteria, and states a practical recommendation. Its source block is a useful shape, but its claims should be source-checked before reuse.

## 4. Current normal editorial inventory

Scope here is the 28 Markdown articles in `health`, `home`, `life`, `tech-ai`, and `wealth`. `tools`, `life-hacks`, `daily-ideas`, and the curated store are excluded. Image status means an `image` field is present in the article frontmatter; no image was deleted or regenerated.

| Article | Image in frontmatter | Decision | Evidence-based reason |
| --- | --- | --- | --- |
| `health/biological-age-biomarkers.md` | No | EDIT | Health-testing topic; needs careful evidence boundaries and an early practical answer. |
| `health/cgm-glycemic-variability-guide.md` | No | EDIT | Medical-device topic; claims and risk language need source-led editorial review. |
| `health/circadian-sleep-architecture-protocol.md` | No | EDIT | Protocol format is reusable, but health recommendations need claim-level sourcing. |
| `health/how-to-calculate-daily-protein-intake-leucine-thresholds-and.md` | R2 URL | EDIT | High-specificity nutrition claims plus a generated remote image require source/provenance review. |
| `health/wearable-hrv-autonomic-recovery-tracking.md` | No | EDIT | Measurement/health interpretation topic; avoid overclaiming from wearable metrics. |
| `health/zone-2-aerobic-mitochondrial-training.md` | No | EDIT | Practical format fits, but exercise physiology claims need calibrated evidence. |
| `home/cast-iron-carbon-steel-seasoning-metallurgy.md` | No | KEEP | Concrete household protocol with a clear practical problem; retain as an editorial candidate after source QA. |
| `home/enzyme-detergent-chemistry-stain-removal.md` | No | EDIT | Useful everyday problem, but chemistry and stain-specific claims need concise verification. |
| `home/how-to-prepare-home-for-winter-gutter-cleaning-draft-proofin.md` | R2 URL | EDIT | Strong practical topic; frontmatter lacks a declared `contentType` and carries a generated remote image. |
| `home/preventative-home-envelope-moisture-audit.md` | No | KEEP | Specific troubleshooting/audit guide with clear reader utility. |
| `home/vertical-storage-architecture-small-spaces.md` | No | KEEP | Concrete problem-led household guide; compatible with the reference guide pattern. |
| `life/focus-architecture-low-friction-routines.md` | No | EDIT | Practical routine topic, but should remove generic productivity language and make the protocol testable. |
| `life/how-to-store-seasonal-clothes-moth-prevention-cedar-placemen.md` | R2 URL | EDIT | Useful household guide; image is a generated remote asset and the frontmatter lacks a declared `contentType`. |
| `life/mindful-field-journey-regional-transit.md` | No | EDIT | Travel/planning topic needs a sharper reader question and location/time caveats. |
| `life/permanent-capsule-wardrobe-architecture.md` | No | KEEP | Clear decision/problem framing and practical wardrobe utility. |
| `tech-ai/automating-repetitive-knowledge-workflows.md` | No | EDIT | Practical topic, but product capabilities and current tooling require freshness checks. |
| `tech-ai/ergonomic-workspace-hardware-visual-comfort.md` | No | EDIT | Useful setup guide; ergonomics/health claims need careful sourcing and scope. |
| `tech-ai/how-ordinary-users-can-organize-daily-life-and-work-with-cla.md` | R2 URL | EDIT | Tool-specific and time-sensitive; needs current product verification and provenance review. |
| `tech-ai/how-to-use-ai-vision-features-to-identify-objects-translate.md` | R2 URL | EDIT | Tool capability claims are time-sensitive; retain only after product-by-product verification. |
| `tech-ai/knowledge-worker-ai-stack-comparison.md` | No | EDIT | Comparison format is promising, but software pricing/capability claims age quickly. |
| `tech-ai/local-first-software-data-ownership-markdown.md` | No | KEEP | Durable decision problem with a practical data-ownership angle. |
| `tech-ai/personal-threat-modeling-hardware-keys-backups.md` | No | KEEP | Concrete security checklist topic; retain with current vendor/security-source review. |
| `wealth/a-practical-protocol-for-tax-loss-harvesting-strategy-wash-s.md` | R2 URL | EDIT | High-stakes financial topic; requires jurisdiction scope, primary sources, and human approval. |
| `wealth/high-utility-digital-products-systems.md` | No | EDIT | Practical business topic, but needs a narrower reader question and evidence for economics claims. |
| `wealth/newsletter-unit-economics-audience-ownership.md` | No | EDIT | Decision-guide potential; current platform and monetization claims need evidence. |
| `wealth/niche-ecommerce-operations-logistics-margins.md` | No | EDIT | Practical comparison/decision potential, but margin claims need transparent assumptions. |
| `wealth/productized-micro-consulting-retainers.md` | No | EDIT | Useful decision topic; needs concrete boundaries, examples, and non-guaranteed financial language. |
| `wealth/remote-independent-operator-positioning.md` | No | EDIT | Broad positioning topic should be tightened into a specific reader problem or merged later only if content overlap is demonstrated. |

No defensible duplicate was established from filenames/frontmatter alone, so no article is marked `MERGE` or `RETIRE` in Phase 1. Those decisions require body-level comparison and source review. The five R2-backed images are retained as-is; no image action is proposed. The default for the next workflow is no image.

## 5. Proposed editorial workflow and data model

`topic candidate → research record → source evidence → editorial brief → draft → QA results → human approval → published content → review status`

The existing types can support this with a small lifecycle layer rather than a parallel pipeline:

- Candidate: existing discovery topic and signal provenance in `discovery/types.ts` and `data/topics/candidates.json`.
- Research record/evidence: `research/types.ts` and `EvidenceItem`, with source URL, publisher, authority, access time, claim summary, and limitations.
- Brief: `ContentBrief` plus `factSheet`, reader problem, intent, risk, format, and source requirements.
- Draft: existing generated article/package, stored as a draft artifact rather than a publishable file.
- QA: existing validation, review, visual relevance, source health, and editorial acceptance results.
- Approval: new explicit human decision record (`PENDING`, `APPROVED`, `REJECTED`, reviewer, timestamp, notes) should be required before the publishing adapter is called.
- Published content: existing Markdown frontmatter and serializer; publication should record approval ID and provenance.
- Review status: `DUE`, `CURRENT`, or `NEEDS_REVIEW` with reason and next-review date.

## 6. Research-source capability matrix

| Source/capability | Current status | Limitation |
| --- | --- | --- |
| Fixture signals/research | Works now | Deterministic test data only; never evidence of a live claim. |
| Curated RSS feeds | Works where feed URLs are configured | Discovery signal and link collection; feed availability and terms vary. |
| Google Trends public RSS | Adapter exists; public access may work | Availability is external and can return provider errors; trend is discovery only. |
| Google Search Console | Adapter exists | Requires credentials/property configuration; not active by default. |
| Bing Webmaster | Adapter exists | Requires `BING_WEBMASTER_API_KEY`; not active by default. |
| Pinterest Trends | Adapter exists | Requires `PINTEREST_ACCESS_TOKEN`; access/quotas can restrict use. |
| Reddit public discussion | Adapter exists | Access policy, rate limits, and terms apply; discussion is discovery context, not proof. |
| Stack Exchange | Registry/adapter path exists | Public access and rate limits vary; answers must not be copied as editorial authority. |
| News API | Adapter exists | Requires provider configuration/credentials and has freshness/licensing limits. |
| YouTube trends | Adapter path exists | Requires operational access/configuration; not assumed active. |
| Web research provider | Works as an adapter abstraction | It can collect and classify links, but access restrictions, robots/terms, paywalls, and source quality require editorial review. |
| Government/academic/official sources | Registry classification works now | Classification is not verification; each factual claim still needs a suitable source. |

No unavailable source is represented as active in this report.

## 7. Editorial acceptance and image policy

An article should be accepted only when it answers one explicit reader question early; gives actionable steps, decision criteria, or troubleshooting; distinguishes fact from judgment; supports important factual claims with appropriate sources; states uncertainty and jurisdiction where relevant; passes schema, link, accessibility, and safety validation; avoids filler and unsupported specificity; and has explicit human approval. It must not exist solely to satisfy a cadence or category quota.

Images are optional. A valid article may contain no image and should still render through the existing placeholder/layout behavior. No AI-generated image may be created automatically. Any future image should be a separate, human-approved asset decision with provenance, license/source, alt text, and a reason it improves comprehension.

## 8. Proposed next implementation phase

Implement a small approval-and-draft state around the existing brief/research/generation/review/storage contracts; add source-evidence requirements and claim-level QA; adapt `GuideLayout.astro`/schema only where needed for practical guides and decision guides; add a human approval command/UI boundary; then migrate a small, manually selected pilot set. Do not begin with bulk rewriting, retirement, or image regeneration.
