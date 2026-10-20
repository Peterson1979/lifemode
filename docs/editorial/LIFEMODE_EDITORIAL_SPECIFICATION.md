# LifeMode Editorial Specification

Status: operational recommendation derived from the original EverydayGuide evidence  
Applies to: future LifeMode reference guides, decision guides, household protocols, and related structured content  
This document is a specification, not a content-generation prompt. No article generation is authorized by this document.

## 1. Evidence status and labels

Every rule in this document should be read with one of these labels:

- **Inherited / documented:** explicitly stated in the original EverydayGuide editorial-standards page or content schema.
- **Inherited / observed:** a recurring pattern across the 13 original guides and their layouts/components.
- **LifeMode recommendation:** a new operational control added to make the standard reproducible, auditable, and compatible with LifeMode.

The historical source files do not recover original prompts, models, generation scripts, or approval logs. Future teams must not describe this specification as the original prompt or claim that it reproduces an undocumented historical workflow.

## 2. Editorial mission and intended reader

### Inherited / documented

The original EverydayGuide standard requires real, actionable, scientifically sound solutions to everyday problems and says a piece should remain useful to a human reader even if search engines disappear. It explicitly rejects automated content farming, repetitive AI filler, and unverified statistical claims. LifeMode inherits this principle for its reference work.

### Inherited / observed

The original reader is usually trying to do something, decide something, prevent damage, or understand a practical household risk. The guides speak to a general reader without assuming specialist training, but they explain enough mechanism to make the recommendation understandable.

### LifeMode recommendation

Every assignment must identify:

1. The reader's concrete question or problem.
2. The action or decision the reader needs to complete.
3. The conditions that change the answer.
4. The harm caused by a wrong or incomplete answer.
5. The appropriate level of expertise and any professional boundary.

Reject topics that cannot be expressed as a useful reader problem, decision, protocol, or carefully bounded explanation.

## 3. Topic selection and reader-problem identification

### Inherited / observed

The original corpus favors durable practical problems: stain removal, food storage, cookware care, appliance odors, winterization, pantry space, fabric care, and capacity decisions. Titles usually name the object or problem and the desired outcome.

### LifeMode recommendation

Before research begins, create a short problem brief containing:

- Primary reader question, written in natural language.
- One-sentence answer hypothesis, marked provisional.
- Primary intent: reference, how-to, decision, safety, maintenance, or comparison.
- Relevant category and content type.
- High-risk claims likely to require primary-source verification.
- Expected reader action or decision.
- Existing LifeMode guide/tool/checklist relationships.

Prefer topics with a clear answer boundary and a practical outcome. Do not select topics solely because a keyword appears popular.

## 4. Search intent and keyword use

### Historical status

The original files do not document a keyword-research workflow, keyword-density target, or ranking formula. The problem-led titles are observed patterns, not proof of a search strategy.

### LifeMode recommendation

Use search language to understand how readers phrase the problem, not to replace editorial judgment.

- Put the reader's actual question or task in the title when natural.
- Use one primary question or decision per article.
- Use related terms only when they improve clarity or cover a necessary condition.
- Do not repeat a keyword unnaturally or create headings that exist only for search engines.
- Do not broaden a focused question into an unfocused article to capture unrelated queries.
- Add an FAQ only when it answers a real follow-up question supported by the research.

The article must still make sense if search-oriented phrasing is removed.

## 5. Article type and structure

### Required guide metadata

The original guide schema requires:

- `title`
- `category`
- `publishedDate`
- `updatedDate`
- `quickSummary`

Use `contentType` explicitly as `reference` or `decision` when the default would be ambiguous. Include `seoTitle` and `seoDescription` only when they accurately summarize the article; they must not promise more than the article delivers.

Use author and reviewer metadata honestly. Do not invent credentials or imply a professional review that did not occur.

### Recommended frontmatter by article type

#### Reference or how-to guide

Use, when relevant:

- `difficulty`
- `timeNeeded`
- `keyFacts`
- `materialsNeeded`
- `toolsNeeded`
- `steps`
- `commonMistakes`
- `proTips`
- `faqs`
- `sources`
- related guides/tools/checklists

#### Decision guide

Use, when relevant:

- explicit decision criteria;
- comparison table with consistent columns;
- trade-offs and “best for” conditions;
- limitations and cases where no option is suitable;
- FAQs for likely edge cases;
- sources for quantitative, safety, durability, or regulatory claims.

Do not add empty fields merely to satisfy a template. Use the smallest complete structure that answers the question.

### Reader-facing order

Follow the original layout sequence where applicable:

1. Specific headline.
2. Direct quick summary answering the question.
3. Author/reviewer/date context.
4. Key facts or decision criteria.
5. Explanation of the relevant mechanism or context.
6. Steps, comparison, or decision path.
7. Conditions, warnings, common mistakes, and limitations.
8. FAQs.
9. Sources and related resources.

The introduction should establish the answer and the practical stakes quickly. Do not make the reader pass through a generic scene-setting essay before receiving useful information.

## 6. Headline, introduction, and headings

### Inherited / observed

Original titles commonly combine the task with a meaningful outcome or constraint, such as removing a specific stain, preventing frozen pipes, or choosing refrigerator capacity. Body headings often explain a mechanism: biofilm, stain chemistry, glass residue, water exclusion, respiration, or textile pests.

### LifeMode recommendation

- Make the main question and outcome unmistakable.
- Avoid sensational certainty such as “definitive” unless the scope truly supports it.
- Use headings that help a reader scan for action, conditions, mechanism, or exceptions.
- Do not use a heading merely to create a keyword variation.
- Keep each section focused on one reader need.
- State meaningful uncertainty near the claim it qualifies.

## 7. Depth, specificity, and practical usefulness

### Inherited / observed

The strongest original guides provide concrete quantities, durations, temperatures, materials, tools, decision criteria, warnings, and explanations of why the action works. The cast-iron guide, for example, gives a five-step cleaning protocol, thermal-shock warning, oil quantity, drying time, mistakes, FAQs, and source metadata. The refrigerator guide uses a formula and comparison matrix instead of pretending one size fits all households.

### LifeMode recommendation

Depth is complete coverage of the reader's decision or task, not a word count. An article is complete when a reasonable reader can:

- identify the correct starting condition;
- follow the action in the correct order;
- recognize when the normal method does not apply;
- avoid the most consequential mistakes;
- understand the basis and limits of important claims;
- know when to stop and seek professional or official help.

Do not impose an arbitrary minimum or maximum word count. A short answer is preferable when the problem is narrow; a complex decision needs more comparison and qualification.

## 8. Steps, examples, decision criteria, and checklists

### Inherited / observed

Procedural guides use numbered steps with optional tips and warnings. Decision guides use criteria, matrices, formulas, and trade-offs. Checklists and tools are treated as related practical utilities rather than decorative links.

### LifeMode recommendation

For every step, specify as many of these as the task requires:

- starting condition;
- materials or tools;
- action;
- quantity, duration, temperature, or sequence;
- expected result;
- safety warning;
- exception or stop condition.

Use examples only when they clarify a boundary or decision. Label examples as examples; do not present one household's preference as a universal rule.

For decisions, define the criteria before recommending an option. Include trade-offs, “best for” conditions, and disqualifying constraints. For recurring maintenance, a checklist may be more useful than prose; link to or create a checklist only when it is actually maintained and functional.

## 9. Evidence, source selection, and citations

### Inherited / documented

The original source hierarchy prioritizes USDA FSIS, FDA, university extension services, ACI, textile standards, safety organizations, ENERGY STAR, manufacturer documentation, and relevant technical or peer-reviewed sources depending on the subject.

### LifeMode recommendation

Match source authority to claim risk:

- Food safety, health, chemicals, fire, electrical, structural, or legal claims require primary authorities, official guidance, standards, or qualified professional sources.
- Product operation and maintenance should use the manufacturer manual or current manufacturer guidance when available.
- Material-science or biological explanations should use a credible technical or peer-reviewed source when the explanation changes the recommendation.
- Consumer or trade organizations may supplement, but should not silently replace, primary guidance for high-risk claims.

For every important claim, record:

- the exact claim;
- the source title and publisher;
- a stable URL or document identifier where available;
- the relevant date or version;
- what the source actually supports;
- any limitation or disagreement.

Do not cite a source merely because its name sounds authoritative. Do not create a source, journal title, URL, statistic, quotation, or study result. If a claim cannot be verified, remove it, qualify it clearly, or label it as an editorial suggestion rather than fact.

The visible `sources` field is not proof of verification. Editors must inspect the source and confirm that it supports the wording used.

## 10. Uncertainty, changing information, safety, and professional advice

### Inherited / documented

The original standards require dated updates and routine audits because practical standards and manufacturer guidance change.

### LifeMode recommendation

- Put dates on changing recommendations and update them when source guidance changes.
- Distinguish a measured fact, an official recommendation, a reasonable household practice, and an editorial preference.
- State uncertainty when evidence is limited, ranges vary, or the answer depends on equipment or conditions.
- Use explicit warnings for thermal shock, chemicals, foodborne illness, fire, electrical hazards, structural damage, and any other consequential risk.
- Do not provide a false sense of safety from a general household article.
- Tell the reader when to stop and contact a qualified professional, manufacturer, emergency service, clinician, or local authority.
- Never turn a medical, legal, structural, electrical, or food-safety uncertainty into confident invented precision.

## 11. AI-assisted writing limitations

### Inherited / documented

The original standards allow AI assistance for topic clustering, outline structuring, grammar QA, and formatting, while prohibiting raw unverified output and requiring manual review of every guide, metric, step, and temperature threshold.

### LifeMode recommendation

AI may assist with organization or mechanical editing only under human ownership of the result. It must not be treated as a source or reviewer.

Required safeguards:

- Research claims independently before drafting.
- Keep a claim-to-source record for high-risk facts.
- Never accept an AI-generated citation without opening and checking the source.
- Never invent a missing detail to make a draft sound complete.
- Treat exact numbers, dates, thresholds, product compatibility, and safety advice as untrusted until verified.
- Run a repetition and generic-language edit.
- Record substantive human review before approval.

Do not use AI to mass-produce near-duplicate articles, pad length, simulate expertise, or create fictional authors, reviewers, sources, tests, or lived experience.

## 12. Originality, repetition, and content-farming prevention

Reject or rewrite material that:

- repeats the same advice in multiple sections without adding a new condition;
- uses generic introductions that could fit any topic;
- restates the title as a conclusion without operational detail;
- adds headings solely to increase length or keyword coverage;
- claims “experts say” without naming and checking the source;
- uses formulaic filler such as broad promises, empty reassurance, or unsupported superlatives;
- duplicates an existing LifeMode article without a clearly different question, audience, or decision;
- substitutes affiliate or promotional material for independent guidance.

Originality means a clear reader purpose, accurate synthesis, useful structure, and genuine editorial value. It does not require novelty for its own sake.

## 13. Metadata, related content, and schema quality

At minimum, a guide must have valid required schema fields and an accurate title, category, publication date, update date, and quick summary. The summary must answer the question in compressed form; it must not be a vague teaser.

Use related content only when the destination exists and materially helps the reader. The original corpus contains one unresolved related-guide reference, `how-to-keep-bread-fresh`, which demonstrates why link validation must be part of acceptance.

FAQs must be real, non-repetitive questions. Sources must be specific enough for another editor to identify and inspect. Author and reviewer fields must describe actual responsibility, not decorative authority.

## 14. Operational workflow

### Stage 1: Brief and scope

1. Write the reader problem and desired outcome.
2. Choose reference, protocol, decision, comparison, or checklist format.
3. Identify risk level and required source class.
4. Check existing LifeMode content for overlap and useful related tools.

### Stage 2: Research

1. Gather primary or authoritative sources appropriate to the claim.
2. Record claims, source support, dates, limitations, and unresolved disagreements.
3. Separate facts from recommendations and editorial preferences.
4. Identify exceptions, failure modes, hazards, and professional boundaries.

### Stage 3: Outline

1. Put the direct answer first.
2. Choose the smallest complete set of structured fields.
3. Design steps, criteria, examples, warnings, FAQs, and related links around the reader problem.
4. Decide where uncertainty must appear.

### Stage 4: Draft

1. Draft from the verified claim record.
2. Use plain language and specific actions.
3. Explain mechanisms only when they improve correct execution or decision quality.
4. Avoid unsupported precision and generic filler.

### Stage 5: Fact-check and safety review

1. Verify every high-risk claim against its source.
2. Check quantities, units, dates, thresholds, product compatibility, and conditions.
3. Confirm that warnings are visible and proportionate.
4. Confirm that citations support the wording, not merely the topic.

### Stage 6: Editorial edit

1. Test the headline against the actual answer.
2. Remove repetition and unnecessary introduction.
3. Check terminology, sequence, headings, summary, FAQs, and related links.
4. Check author/reviewer wording and disclosure requirements.

### Stage 7: Schema, link, and build validation

1. Validate frontmatter against the active collection schema.
2. Confirm every related guide/tool/checklist exists.
3. Confirm route, canonical, metadata, and structured-data output.
4. Run the build and relevant tests.

Build success proves technical validity only. It does not prove factual accuracy or editorial quality.

### Stage 8: Approval and maintenance

Approval requires a named human editor, review date, and disposition: approved, revise, rejected, or held for evidence. Set an update trigger for changing standards, product guidance, regulations, or safety information.

## 15. Article acceptance checklist

An editor should mark every applicable item before approval.

### Reader problem and answer

- [ ] The article answers one identifiable reader question or decision.
- [ ] The first useful section gives a direct, accurate answer.
- [ ] The title matches the actual scope and does not overpromise.
- [ ] The summary is specific enough to guide the reader.
- [ ] The article states conditions that change the answer.

### Usefulness and completeness

- [ ] Actions are concrete rather than generic advice.
- [ ] Required materials, tools, quantities, times, temperatures, or sequence are present where relevant.
- [ ] Steps include starting conditions and expected results.
- [ ] Important exceptions, limitations, and stop conditions are present.
- [ ] Common mistakes address real failure modes.
- [ ] Decision articles define criteria and trade-offs rather than naming an unexplained winner.
- [ ] Checklists and tools are used only where they improve execution.

### Evidence and safety

- [ ] Every consequential factual claim has an appropriate source.
- [ ] Sources are real, identifiable, and actually support the claim.
- [ ] URLs and source versions were checked where available.
- [ ] Numbers, thresholds, dates, and technical terms were independently verified.
- [ ] Food, chemical, health, fire, electrical, structural, or legal risks have proportionate warnings.
- [ ] Uncertainty is visible and not hidden by confident wording.
- [ ] Professional or official help is recommended when the topic exceeds household guidance.

### Structure and language

- [ ] Headings help the reader find actions, explanations, decisions, or exceptions.
- [ ] The introduction is not generic or unnecessarily long.
- [ ] No section repeats another without adding a condition or new reasoning.
- [ ] Terminology, units, names, and instructions are consistent.
- [ ] The article contains no fabricated experience, authority, quotation, statistic, or citation.
- [ ] AI-assisted text, if any, was human-reviewed and source-checked.
- [ ] The article is not a keyword-stuffed, affiliate-led, or near-duplicate page.

### Metadata and technical integrity

- [ ] Required schema fields are present and accurate.
- [ ] `contentType` matches the article's actual structure.
- [ ] Author and reviewer fields are truthful.
- [ ] Publication and update dates are accurate.
- [ ] FAQs are relevant and non-repetitive.
- [ ] Sources and related-content fields are complete and accurate.
- [ ] Every internal related link resolves to an existing route.
- [ ] Canonical, structured data, and visible metadata match the article.
- [ ] Build and relevant automated checks pass.

## 16. Clear rejection conditions

Reject the article, or return it for revision, if any of the following applies:

1. It does not answer the stated reader question.
2. It gives generic advice without enough detail to act safely.
3. A material claim is unsupported, unverifiable, or contradicted by the cited source.
4. It contains fabricated citations, statistics, quotations, tests, credentials, or experience.
5. It omits a known hazard, condition, limitation, or exception that could change the outcome.
6. A headline materially misrepresents the article.
7. The article is repetitive, padded, keyword-stuffed, or evidently produced as content-farm filler.
8. Required metadata is missing, misleading, or incompatible with the active schema.
9. Related links, route data, or structured metadata are broken in a way that affects reader use.
10. The reviewer cannot determine what was verified, what remains uncertain, or who approved it.

Do not approve an article merely because it renders, passes schema validation, or contains a source list.

## 17. Future reusable master prompt requirements

If this specification is later converted into a master prompt, the prompt should require the future system to:

- state the reader problem and article type before drafting;
- ask for or use a verified claim/source record;
- separate verified facts, reasonable recommendations, uncertainty, and editorial choices;
- produce only the schema-supported fields that are justified by the topic;
- put the direct answer before background exposition;
- include conditions, exceptions, warnings, and professional boundaries;
- avoid unsupported precision, invented sources, repetitive filler, and search-engine padding;
- preserve the distinction between research assistance and editorial approval;
- output a self-audit listing unresolved claims, missing sources, and related-link risks;
- defer publication until a human editor completes the acceptance checklist.

Task-specific instructions should define the subject, audience, risk level, source hierarchy, article type, and required structured elements. They should not silently override the evidence and safety rules in this specification.

## 18. LifeMode-specific adaptations

These are deliberate recommendations for LifeMode, not claims about historical EverydayGuide practice:

- Retain LifeMode branding, navigation, protected tools, Life Hacks, Daily Ideas Store, and application disclosures separately from the restored EverydayGuide guide corpus.
- Use LifeMode's active content schema and routing while preserving the original guide fields and presentation logic.
- Require explicit claim-to-source review for future AI-assisted or automation-adjacent workflows.
- Validate links and rendered routes as part of editorial acceptance, not only during deployment.
- Treat existing LifeMode automation code as a separate system that must not be used to attribute undocumented provenance to the original EverydayGuide articles.

## Final operating principle

Publish only work that is useful, specific, source-aware, honest about uncertainty, safe within its scope, and reviewed by a human who can explain why every important recommendation is present. Technical validity is necessary; it is never sufficient.
