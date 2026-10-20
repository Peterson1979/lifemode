# LifeMode Sample Article Evaluation

Evaluation date: 2026-10-19
Checklist: `LIFEMODE_ARTICLE_ACCEPTANCE_CHECKLIST.md`
Status: editorial test artifacts only; none are production content or added to `src/content`.

## Final independent review corrections

The previous evaluation's pass results were rechecked against the actual article text and the cited pages. Three limited corrections were made before the final dispositions below:

1. The smoke-alarm article's 10-foot cooking-appliance placement statement now cites the directly checked USFA Smoke Alarm Safety Pictographs page. The previously listed NFPA PDF was removed because it was not accessible during this review and was not needed to support the article.
2. The cutting-board material table no longer makes an unsupported claim about how glass, marble, or pyroceramic affects knives and grip.
3. The cutting-board sanitation section was narrowed to the USDA FSIS-documented bleach solution and label/handling caution; it no longer makes an uncited general-disinfectant claim.

After these corrections, the articles were rechecked against the checklist. No remaining rejection condition was found.

## Evaluation method

Each sample was drafted against `LIFEMODE_MASTER_CONTENT_PROMPT.md`, checked against the active LifeMode article schema fields, and reviewed against the checklist. Claims were limited to the official sources listed in each article. No original EverydayGuide prompt is claimed or inferred. The EverydayGuide quality references used for structure were the restored practical protocols and decision guides, especially the cast-iron, cooked-rice, refrigerator-sizing, and cookware-material examples; their patterns informed structure, not factual claims in these samples.

## 1. How to Test and Replace a Smoke Alarm Safely

File: `docs/editorial/sample-articles/how-to-test-and-replace-a-smoke-alarm-safely.md`
Type: high-risk home-safety protocol
Intended reader problem: keep household smoke alarms testable and replace them without attempting unsafe electrical work.

### Sources checked

- U.S. Fire Administration, “Smoke Alarms”: monthly testing, battery guidance, ten-year replacement, placement, and hardwired-installation boundary.
- U.S. Fire Administration, “Smoke Alarm Safety Pictographs”: monthly testing, ten-year replacement, and the 10-foot cooking-appliance placement guidance.

### Quality assessment

- Direct answer appears before background.
- Steps cover manufacture date/power type, monthly test, battery distinction, ten-year replacement, hardwired boundary, placement, nuisance alarms, failure handling, and common mistakes.
- High-risk wording is intentionally bounded: no wiring instructions, no claim that a test proves complete fire detection, and no advice to disable an alarm.
- Metadata includes active-schema fields and an explicit high risk level.
- The independent review corrected one source-list mismatch: the 10-foot placement statement now has the directly checked USFA pictograph source, and the inaccessible NFPA PDF is no longer presented as supporting evidence.
- After that correction, no checklist criterion failed.

Disposition: **approved for this editorial test artifact**. This is not publication approval; production use would still require a current source recheck, a named human reviewer, and local/product-specific review.

## 2. Which Portable Dehumidifier Capacity Do You Need?

File: `docs/editorial/sample-articles/which-portable-dehumidifier-capacity-do-you-need.md`
Type: medium-risk home-maintenance decision guide
Intended reader problem: choose a portable dehumidifier capacity without treating room area as the only variable or using an appliance to hide a leak.

### Sources checked

- ENERGY STAR, “Dehumidifiers”: capacity ranges by area and moisture condition, plus sizing caveats.
- U.S. EPA, “A Brief Guide to Mold, Moisture and Your Home”: humidity target and moisture-control guidance.
- U.S. EPA, “Mold Course Chapter 2”: relative-humidity and moisture-prevention context.

### Quality assessment

- The comparison table preserves the source's ranges and labels them as starting points rather than exact guarantees.
- The guide defines criteria before recommendation: moisture condition, space, humidity target, and drainage/operation.
- It explains that leaks and recurring water intrusion require source correction, not merely more capacity.
- It distinguishes EPA moisture guidance from ENERGY STAR product-sizing guidance.
- The independent review removed an unsupported knife/grip comparison from the material table and narrowed the sanitation wording to the checked USDA guidance.
- After those corrections, no checklist criterion failed.

Disposition: **approved for this editorial test artifact**. The table must be rechecked against the current ENERGY STAR page whenever product-sizing standards or rating conventions change.

## 3. How to Choose and Care for a Cutting Board

File: `docs/editorial/sample-articles/how-to-choose-and-care-for-a-cutting-board.md`
Type: high-risk food-safety explainer with a care protocol
Intended reader problem: choose a workable board material, prevent cross-contamination, clean it correctly, and recognize when replacement is necessary.

### Sources checked

- USDA FSIS, “Cutting Boards”: wood/nonporous options, separation, cleaning, sanitizing, bamboo, dishwasher limits, and replacement.
- FDA, “Selecting and Serving Produce Safely”: separation and cleaning between raw foods and produce.
- USDA FSIS AskUSDA, “How can I prevent cross-contamination when using cutting boards?”: cleaning and worn-board replacement.

### Quality assessment

- The material table avoids declaring one universal winner and keeps the safety decision centered on separation and cleanability.
- The protocol includes food-contact-safe sanitation boundaries and explicitly prohibits treating general disinfectant as automatically suitable for a food-contact surface.
- The article includes a limitation: cleaning is one control and does not guarantee safety by itself.
- The bleach ratio is transcribed only from USDA FSIS and is paired with label/safety cautions; production review should re-open the source before publication.
- No checklist criterion failed.

Disposition: **approved for this editorial test artifact**. Because this is food-safety guidance, production publication would require a fresh official-source check and human sign-off.

## Cross-sample results

| Criterion | Smoke alarm | Dehumidifier | Cutting board |
| --- | --- | --- | --- |
| Clear reader problem and direct answer | Pass | Pass | Pass |
| Meaningfully different article type | Protocol | Decision/comparison | Explainer/protocol |
| Reliable source class matched to risk | Pass | Pass | Pass |
| Explicit conditions and limitations | Pass | Pass | Pass |
| No fabricated facts or citations | Pass | Pass | Pass |
| No generic filler or keyword stuffing | Pass | Pass | Pass |
| Metadata and internal-link scope appropriate | Pass | Pass | Pass |
| Issues found in independent review | Source-list mismatch, corrected | None | Two unsupported/overbroad statements, corrected |

## Limitations and maintenance

- These samples are documentation artifacts, not routed or published content. They were not placed in `src/content` and have no public routes.
- The frontmatter demonstrates the active schema fields but was not loaded into the Astro collection because the task explicitly excludes application/content changes.
- Official guidance, manufacturer instructions, product-rating conventions, and local requirements can change. A production article would need a dated recheck and a named human reviewer before publication.
- The evaluation verifies the claims against the listed sources and the stated checklist. It does not claim that the articles have undergone a legal, electrical, fire-code, clinical, or building-science review.
