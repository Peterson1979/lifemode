# LifeMode

**LifeMode** is a modern digital publication and content ecosystem curated across seven editorial pillars:

* **Life** — Intentional modern living, home aesthetics, routines, and personal growth.
* **Travel** — Curated itineraries, boutique stays, slow travel, and destination guides.
* **Tech & AI** — Emerging artificial intelligence, productivity ecosystems, and next-gen gear.
* **Money** — Personal finance frameworks, strategic investing, and wealth building.
* **Wellbeing** — Holistic health, mental clarity, fitness protocols, and longevity science.
* **Discover** — Timeless architecture, curated books, art, and cultural artifacts.
* **Now** — Real-time cultural trends, seasonal recommendations, and timely lifestyle dispatches.

---

## Technology Stack

* **Framework:** [Astro](https://astro.build) (v7 Content Layer)
* **Language:** TypeScript (Strict mode)
* **Content Engine Readiness:** Astro Content Collections with Markdown (`.md`) and MDX (`.mdx`) support (`@astrojs/mdx`)
* **Styling:** Modular Vanilla CSS with design tokens
* **Package Manager:** npm
* **Architecture:** Static Site Generation (SSG) / decoupled content architecture (zero database / zero CMS dependencies)

---

## Project Structure

```text
lifemode/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── Header.astro
│   │   └── Footer.astro
│   ├── content/
│   │   ├── life/
│   │   ├── travel/
│   │   ├── tech-ai/
│   │   ├── money/
│   │   ├── wellbeing/
│   │   ├── discover/
│   │   └── now/
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   └── [pillar]/
│   │       ├── index.astro
│   │       └── [...slug].astro
│   ├── styles/
│   │   └── global.css
│   └── content.config.ts
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── .env.example
└── .gitignore
```

---

## Getting Started

### 1. Prerequisites

* Node.js `v22.12.0` or higher
* npm `v10` or higher

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

The local development server starts at `http://localhost:4321`.

### 4. Build for Production

```bash
npm run build
```

This compiles the static site output into the `dist/` directory.

### 5. Preview Production Build

```bash
npm run preview
```

---

## Cloudflare Pages Deployment

LifeMode is designed for zero-config, static-first deployment to **Cloudflare Pages via GitHub**:

* **Connected Repository:** `Peterson1979/lifemode`
* **Production Branch:** `master`
* **Framework Preset:** `Astro`
* **Build Command:** `npm run build`
* **Build Output Directory:** `dist`
* **Environment Variables:** None required for static site deployment (optional `PUBLIC_SITE_URL` supported for custom domains)
* **Node.js Version:** `22` (conforms to `engines` requirement `>=22.12.0`)

When connected to GitHub, Cloudflare Pages will automatically trigger a build and publish the static `dist/` directory upon commits to `master`.

---

## Editorial Automation V1

LifeMode includes a consolidated, end-to-end editorial automation pipeline orchestrating all editorial subsystems into an automated, deterministic publication flow.

### Pipeline Flow

```text
DISCOVERY           → Ingests signals across Pinterest, Google Trends, and Fixtures
SELECTION           → Deterministically scores, deduplicates against on-disk content, and selects top opportunities
BRIEF               → Generates structured editorial brief with strict target word counts and angles
GENERATION          → Produces structured Markdown article (via Fixture or AI Router)
VALIDATION          → Deterministic gate checking structure, placeholders, and word-count thresholds
REVIEW              → Independent AI quality review across 10 dimensions with strict factuality/safety gates
PUBLISHING_GATE     → Deterministic publishing eligibility validation
STORAGE             → Persists approved article to canonical Markdown (`src/content/<pillar>/<slug>.md`)
GIT_PUBLICATION     → Safe dry-run inspection or optional single-file local Git commit
```

### Safety Defaults & Guarantees

* **Opt-in Execution:** Automation is disabled by default (`EDITORIAL_AUTOMATION_ENABLED=false`).
* **Dry-Run by Default:** Git publication defaults to dry-run (`EDITORIAL_AUTOMATION_DRY_RUN=true`).
* **Zero Remote Push:** The automation runner **NEVER** executes `git push` or calls remote GitHub/Cloudflare APIs. Remote deployment occurs exclusively through standard Cloudflare Pages GitHub triggers on push.
* **Failure Isolation:** Each selected opportunity executes in an isolated error boundary; failures in one candidate do not corrupt the overall pipeline run.
* **Strict Word-Count Preservation:** Length requirements defined in the Content Brief flow through Generation, Deterministic Validation, Review, and Publishing Gates.

### CLI Execution

Execute the automation runner locally:

```bash
# Default deterministic fixture dry-run (safe)
npm run editorial:automation

# Pass custom options
npx tsx scripts/run-editorial-automation.ts --max=1 --min-score=80

# Execute with managed AI Router (when configured)
npx tsx scripts/run-editorial-automation.ts --router

# Allow local Git commit (dryRun: false)
npx tsx scripts/run-editorial-automation.ts --commit
```
