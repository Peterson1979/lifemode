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
