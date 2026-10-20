# EverydayGuide Editorial Analysis

Status: evidence report for the restored LifeMode project  
Scope: the original local EverydayGuide project and the corresponding restored files in LifeMode  
Historical evidence boundary: no prompt files, generation scripts, model configuration, or automated editorial workflow were found in the inspected original source tree; inaccessible records cannot be ruled out.

## Executive summary

EverydayGuide is a structured practical-reference site, not a general lifestyle magazine. Its content is organized around concrete household problems: cleaning, food storage, cookware, home maintenance, storage, laundry, and purchase decisions. The strongest recurring pattern is a direct answer followed by a usable protocol, conditions and warnings, common mistakes, practical tips, FAQs, sources, and related utilities.

The original project explicitly requires useful, scientifically sound guidance, authoritative source checking, human review of every factual claim, transparent update dates, editorial independence, and rejection of unverified AI output. The articles demonstrate those principles through structured frontmatter and reusable presentation components, but the source files do not prove that a particular prompt, model, or automated production process created them.

The restored LifeMode implementation retains the original guide/checklist/tool model and the 13 original guides. LifeMode-specific branding and protected tools remain separate from the EverydayGuide evidence base.

## Files examined

### Original EverydayGuide

- `C:\Users\opeti\EverydayGuide\src\pages\editorial-standards.astro`
- `C:\Users\opeti\EverydayGuide\src\content.config.ts`
- `C:\Users\opeti\EverydayGuide\src\layouts\GuideLayout.astro`
- `C:\Users\opeti\EverydayGuide\src\layouts\BaseLayout.astro`
- `C:\Users\opeti\EverydayGuide\src\components\QuickAnswer.astro`
- `C:\Users\opeti\EverydayGuide\src\components\KeyFacts.astro`
- `C:\Users\opeti\EverydayGuide\src\components\StepList.astro`
- `C:\Users\opeti\EverydayGuide\src\components\CommonMistakes.astro`
- `C:\Users\opeti\EverydayGuide\src\components\ProTips.astro`
- `C:\Users\opeti\EverydayGuide\src\components\FaqAccordion.astro`
- `C:\Users\opeti\EverydayGuide\src\components\SourcesList.astro`
- `C:\Users\opeti\EverydayGuide\src\components\RelatedCluster.astro`
- all 13 files in `C:\Users\opeti\EverydayGuide\src\content\guides\`
- the original checklist and tool files under `C:\Users\opeti\EverydayGuide\src\content\checklists\` and `...\tools\`

### Restored LifeMode

- `C:\Users\opeti\LifeMode\lifemode\src\content.config.ts`
- `C:\Users\opeti\LifeMode\lifemode\src\layouts\GuideLayout.astro`
- `C:\Users\opeti\LifeMode\lifemode\src\pages\[category]\[slug].astro`
- `C:\Users\opeti\LifeMode\lifemode\src\pages\[category]\index.astro`
- `C:\Users\opeti\LifeMode\lifemode\src\pages\guides\index.astro`
- the restored guide files under `C:\Users\opeti\LifeMode\lifemode\src\content\guides\`
- the protected LifeMode tool, Life Hacks, Daily Ideas, and application-promotion files for preservation checks

## Original content inventory

The original project contains:

| Collection | Count | Organization |
|---|---:|---|
| Guides | 13 | Markdown files grouped by five category slugs |
| Checklists | 4 | Markdown files with sections and checkable items |
| Tools | 4 | Markdown metadata plus interactive Astro components |

The 13 guides are:

1. `cookware-material-decision-guide.md`
2. `home-maintenance-checklist.md`
3. `how-to-clean-cast-iron-pan.md`
4. `how-to-clean-washing-machine.md`
5. `how-to-clean-windows-without-streaks.md`
6. `how-to-organize-small-pantry.md`
7. `how-to-prepare-home-for-winter.md`
8. `how-to-remove-coffee-stains.md`
9. `how-to-store-cooked-rice.md`
10. `how-to-store-fresh-herbs.md`
11. `how-to-store-seasonal-clothes.md`
12. `how-to-wash-different-fabrics.md`
13. `which-refrigerator-size-do-you-need.md`

The five category values in the original guide schema are `food-kitchen`, `cleaning-laundry`, `home-maintenance`, `storage-organization`, and `everyday-how-to`.

## Explicitly documented principles

These are rules stated in the original project, not interpretations.

### Mission and usefulness

Under `1. Our Editorial Mission` in `src/pages/editorial-standards.astro`, EverydayGuide says it exists to provide “real, actionable, and scientifically sound solutions” and that each piece must be genuinely useful to a human reader even if search engines disappeared. This is the clearest original standard against search-first filler.

### Source hierarchy

Under `2. Source Hierarchy & Fact Verification`, the original page names:

- USDA FSIS, FDA Food Code, and university agricultural extension services for food and storage safety.
- American Cleaning Institute, textile standards, and verified material safety data sheets for household chemistry and laundry.
- NFPA, ENERGY STAR documentation, and certified manufacturer manuals for home upkeep.

The page specifically calls out factual claims about food safety, temperature thresholds, chemical stain interactions, and appliance maintenance as requiring cross-reference.

### Human review and AI limits

Under `3. Internal AI Usage & Quality Safeguards`, the original page permits AI assistance for initial topic clustering, outline structuring, grammar QA, and formatting. It then states that no raw, unverified AI output is published; every guide, metric, step, and temperature threshold is manually reviewed, fact-checked against authoritative sources, and edited for human clarity. It also explicitly prohibits automated content farming, repetitive AI filler language, and unverified statistical claims.

This is a documented principle. It is not evidence that AI was used to create any particular original article.

### Dates, corrections, and independence

The original standards page requires initial publication and “Last Updated & Verified” dates, routine audits as standards change, a corrections channel, and disclosure of future affiliate or sponsor relationships. It says recommendations should be formulated on functional merit, durability, and practical efficacy.

## Schema and presentation evidence

The original `src/content.config.ts` defines three collections: `guides`, `tools`, and `checklists`.

### Guide schema

Required guide fields are:

- `title`
- `category`
- `publishedDate`
- `updatedDate`
- `quickSummary`

The schema also supports `seoTitle`, `seoDescription`, `contentType`, `readTime`, author and reviewer objects, difficulty, time needed, key facts, materials, tools, steps, common mistakes, pro tips, decision criteria, comparison tables, FAQs, sources, related guides/tools/checklists, and optional video metadata.

Defaults are meaningful: `contentType` defaults to `reference`, read time defaults to `4 min read`, and the default author/reviewer identities describe an editorial team and technical QA board.

### Guide rendering order

`GuideLayout.astro` presents the guide in a deliberate reader sequence:

1. Breadcrumbs and category/type badges.
2. Headline and quick summary.
3. Author and reviewer card with dates and read time.
4. Quick direct answer.
5. Key facts, difficulty, and time needed.
6. Optional video.
7. Decision matrix for decision content.
8. Main Markdown explanation.
9. Step-by-step protocol.
10. Common mistakes and pro tips.
11. FAQs.
12. Sources and related content.

This sequence is explicit implementation evidence of the intended reading experience. It is not itself a documented writing prompt.

## Representative guide comparisons

### Practical protocol: cast-iron care

`how-to-clean-cast-iron-pan.md` is the most complete procedural example. It provides a direct operational summary, four key facts, materials, tools, five numbered steps, warnings about thermal shock and moisture, three common mistakes, three pro tips, three FAQs, two sources, and an instructional video record. Its body explains the chemistry of seasoning rather than merely saying “do not use soap.”

Observed strength: the reader can act immediately and can understand why the instructions exist.

Editorial caution: some technical claims and the named journal source should still be independently verified before reuse. The presence of a citation field is not proof that the citation was checked.

### Food-safety protocol: cooked rice

`how-to-store-cooked-rice.md` uses a hazard-led structure. Its title foregrounds the “1-Hour Safety Rule,” its body explains *Bacillus cereus*, and its metadata includes four steps, two mistakes, two FAQs, and FDA/USDA source entries.

Observed strength: the article connects a concrete household action to a specific biological hazard and gives storage/reheating behavior rather than generic freshness advice.

Editorial caution: time and temperature thresholds are high-risk claims and require current primary-source verification on every update.

### Decision guide: refrigerator size

`which-refrigerator-size-do-you-need.md` is a decision article rather than a step protocol. It includes decision criteria, a comparison table, two mistakes, one FAQ, an ENERGY STAR/DOE source entry, and a sizing formula. The reader is guided through capacity, dimensions, household needs, and door-clearance considerations.

Observed strength: the article translates a purchase question into criteria and trade-offs.

Editorial caution: dimensions and capacity ranges are product- and market-sensitive. They need a dated source or explicit uncertainty statement.

### Decision guide: cookware material

`cookware-material-decision-guide.md` uses four decision criteria and a six-column comparison table covering applications, heat retention, maintenance, lifespan, and dishwasher safety. It also includes common mistakes, a pro tip, FAQs, sources, and related content.

Observed strength: it supports a choice instead of declaring one universal winner.

Editorial caution: durability ranges, chemical-reactivity claims, and PFAS-related claims need source-level verification and careful wording.

### Household protocols: cleaning, storage, and maintenance

`how-to-clean-washing-machine.md`, `how-to-clean-windows-without-streaks.md`, `how-to-organize-small-pantry.md`, `how-to-prepare-home-for-winter.md`, `how-to-remove-coffee-stains.md`, `how-to-store-fresh-herbs.md`, and `how-to-store-seasonal-clothes.md` share a practical pattern: a named mechanism or failure mode, a material/tool list when needed, numbered actions, mistakes, FAQs or tips, and related utilities.

The titles are generally problem-led and specific: sour odors, streaks, coffee stains, frozen pipes, moths, and food waste. The body headings often explain a mechanism such as biofilm, glass residue, water exclusion, stain chemistry, respiration, or textile pests.

## Observed patterns versus documented rules

### Consistent patterns observed in the 13 guides

- Concrete household problem in the title.
- Strong, usually one-paragraph quick answer in frontmatter.
- Practical specificity: tools, materials, quantities, durations, temperatures, conditions, warnings, or decision criteria.
- Mechanism-based explanations instead of purely generic advice.
- Structured metadata used to drive visible reader aids.
- Common-mistake prevention is frequent.
- FAQs address likely follow-up questions.
- Related guides, tools, and checklists create a knowledge cluster.
- Source metadata usually names an institution, journal, manufacturer, or standards body.
- Different article types are represented instead of forcing every topic into the same format.

### Not proven by the source files

- A universal article word count or minimum length.
- A specific keyword-research process or ranking methodology.
- A particular AI model, provider, prompt, temperature, or generation order.
- A human authoring timeline or number of editorial review passes.
- That every named source was actually consulted or that every URL was verified.
- That every video was original, reviewed, or still available.

## Source and link quality observations

The guides usually identify credible source organizations, but source metadata is uneven. Some entries have URLs; others name only a publisher and title. This is enough to show an intended source hierarchy, not enough to certify every claim.

The restored original corpus contains one observable unresolved related-content reference: `how-to-store-fresh-herbs.md` links to `how-to-keep-bread-fresh`, which is not present in the 13-guide inventory or the restored tool/checklist inventories. This should be corrected before publication or marked as unavailable. Other related references resolve within the inspected original inventory.

The source files contain a YouTube identifier `dQw4w4WgXcQ` for the coffee-stain guide. This report records the identifier as source data; it does not infer whether it is intentional, placeholder content, or suitable for publication.

## Evidence unavailable

The following were not found in the inspected original EverydayGuide source tree during the prior audit and were not reconstructed:

- Original writing prompts or system prompts.
- Generation scripts or editorial automation scripts.
- Model names, model settings, provider configuration, or API records.
- Editorial briefs, topic queues, approval logs, or review history.
- A readable original Git history. Direct access to `C:\Users\opeti\EverydayGuide\.git` was denied in the working environment.

The inspected original project does contain ordinary Astro configuration, content schemas, components, layouts, and the public editorial-standards page. Those are the evidence base used here.

## Restored versus preserved files

Restored into LifeMode:

- The 13 original guide Markdown files under `C:\Users\opeti\LifeMode\lifemode\src\content\guides\`.
- The original five-category guide model and category routing behavior.
- The original homepage/library presentation pattern, adapted for LifeMode branding.
- The original editorial-standards content, adapted only for LifeMode naming and canonical metadata.

Preserved as LifeMode-specific:

- LifeMode logo and favicon.
- Existing interactive tools and their current content, including LifeMode-only tools.
- Life Hacks and Daily Ideas Store routes/content.
- AI Zodiac, Dreamly AI, and GetAISet application cards.
- LifeMode application and editorial automation code, which is not evidence of the original EverydayGuide production process.

## Conclusion

The reliable historical standard is a human-reviewed, source-aware, practical reference format with structured answer support. The operational specification in `LIFEMODE_EDITORIAL_SPECIFICATION.md` preserves those verified principles, labels observed patterns separately, and adds only clearly marked LifeMode recommendations needed for repeatable future work.
