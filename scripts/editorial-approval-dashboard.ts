import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve, extname, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { listDrafts, getDraft, saveDraft, deleteDraft, slugify } from '../src/lib/editorial/cms/drafts.ts';
import { listPublishedGuides, getPublishedGuide, processArticleMetadata, parseArticleTitleAndBody } from '../src/lib/editorial/cms/guides.ts';
import { listPublishedTools, getPublishedTool } from '../src/lib/editorial/cms/tools.ts';
import { listPublishedChecklists, getPublishedChecklist, renderChecklistStructuredPreview } from '../src/lib/editorial/cms/checklists.ts';
import { listPublishedLifeHacks, getPublishedLifeHack, renderLifeHackPreview } from '../src/lib/editorial/cms/life-hacks.ts';
import { listMediaAssets, uploadMediaAsset } from '../src/lib/editorial/cms/media.ts';
import { publishGuide, publishTool, publishChecklist, publishLifeHack } from '../src/lib/editorial/cms/publisher.ts';
import {
  VALID_GUIDE_CATEGORIES,
  VALID_TOOL_CATEGORIES,
  VALID_TOOL_TYPES,
  VALID_CHECKLIST_CATEGORIES,
  type GuideCategory,
  type ToolCategory,
  type ToolType,
  type ChecklistCategory,
  type LifeHackVideo,
  type CmsDraftItem,
} from '../src/lib/editorial/cms/types.ts';
import { renderMarkdownToHtml } from '../src/utils/markdown-renderer.ts';
import { CloudflareR2SocialAssetStorageProvider } from '../src/lib/social/images/storage/r2.ts';
import {
  listCmsAffiliateOffers,
  getCmsAffiliateOffer,
  quickAddAffiliateOffer,
  saveCmsAffiliateOffer,
  deleteCmsAffiliateOffer,
  scanGuideAffiliateProducts,
  importGuideAffiliateOffer,
} from '../src/lib/editorial/cms/affiliates.ts';
import { getPrimaryProductImage, type ProductImage } from '../src/lib/commerce/types.ts';

// Autoload Cloudflare R2 secrets if present in user AppData and not yet set in process.env
try {
  const localAppData = process.env.LOCALAPPDATA || (process.platform === 'win32' ? join(process.env.USERPROFILE || 'C:\\Users\\opeti', 'AppData', 'Local') : '');
  if (localAppData) {
    const credPath = join(localAppData, 'LifeMode', 'secrets', 'daily-ideas-r2.json');
    const rawCred = await readFile(credPath, 'utf8').catch(() => null);
    if (rawCred) {
      const parsed = JSON.parse(rawCred);
      const keys = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_BASE_URL'];
      for (const k of keys) {
        if (!process.env[k] && parsed[k]) {
          process.env[k] = parsed[k];
        }
      }
    }
  }
} catch {
  // Graceful fallback
}

const host = '127.0.0.1';
const port = Number(process.env.LIFEMODE_APPROVAL_PORT || 4311);
const token = randomBytes(32).toString('hex');
const defaultUrlFile = join(process.cwd(), 'logs', 'editorial-operations.url');
const urlFile = process.env.LIFEMODE_APPROVAL_URL_FILE || defaultUrlFile;

function isAuthorized(request: IncomingMessage): boolean {
  const header = request.headers.authorization || '';
  return header === `Bearer ${token}`;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<any> {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 10_000_000) throw new Error('Request body is too large (max 10 MB).');
  }
  return JSON.parse(body || '{}');
}

function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>LifeMode Editorial Operations</title>
<style>
:root{
  --font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --bg:#f8fafc;--card-bg:#ffffff;--text:#0f172a;--muted:#64748b;--border:#e2e8f0;
  --primary:#0f766e;--primary-hover:#115e59;--danger:#dc2626;--danger-hover:#b91c1c;
  --success:#16a34a;--info:#0284c7;--warning:#d97706;
}
*{box-sizing:border-box}
body{font-family:var(--font-sans);background:var(--bg);color:var(--text);margin:0;padding:1.5rem;line-height:1.5}
header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:1rem;margin-bottom:1.5rem}
header h1{margin:0;font-size:1.5rem;font-weight:700;color:var(--text)}
.badge-pill{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .6rem;border-radius:9999px;font-size:.75rem;font-weight:600;background:#e2e8f0;color:#334155}
.badge-pill.green{background:#ecfdf5;color:#059669;border:1px solid #a7f3d0}
.badge-pill.blue{background:#e0f2fe;color:#0284c7;border:1px solid #bae6fd}
.badge-pill.amber{background:#fef3c7;color:#b45309;border:1px solid #fde68a}
.badge-pill.purple{background:#f3e8ff;color:#7e22ce;border:1px solid #e9d5ff}
.badge-pill.cyan{background:#ecfeff;color:#0891b2;border:1px solid #a5f3fc}
.tabs{display:flex;gap:.5rem;border-bottom:2px solid var(--border);margin-bottom:1.5rem;flex-wrap:wrap}
.tab-btn{padding:.65rem 1.1rem;background:transparent;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;font-size:.9rem;font-weight:600;color:var(--muted);cursor:pointer;transition:all .15s}
.tab-btn:hover{color:var(--text)}
.tab-btn.active{color:var(--primary);border-bottom-color:var(--primary)}
.tab-pane{display:none}
.tab-pane.active{display:block}
.card{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.04);margin-bottom:1.5rem}
.form-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;margin-bottom:1rem}
.form-group{display:flex;flex-direction:column;gap:.35rem;margin-bottom:1rem}
.form-group label{font-size:.85rem;font-weight:600;color:#334155}
.form-group input,.form-group select,.form-group textarea{width:100%;padding:.55rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.9rem;font-family:inherit}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 2px rgba(15,118,110,.15)}
.split-view{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
@media(max-width:960px){.split-view{grid-template-columns:1fr}}
.editor-toolbar{display:flex;gap:.35rem;background:#f1f5f9;border:1px solid var(--border);border-bottom:none;border-radius:6px 6px 0 0;padding:.4rem;flex-wrap:wrap}
.editor-toolbar button{padding:.25rem .6rem;background:#fff;border:1px solid var(--border);border-radius:4px;font-size:.8rem;font-weight:600;cursor:pointer}
.editor-toolbar button:hover{background:#e2e8f0}
.editor-textarea{border-radius:0 0 6px 6px!important;min-height:380px;font-family:monospace;font-size:.85rem;line-height:1.45}
.preview-pane{border:1px solid var(--border);border-radius:6px;padding:1.25rem;background:#fff;min-height:380px;max-height:600px;overflow-y:auto}
.preview-pane h1,.preview-pane h2,.preview-pane h3{margin-top:0;color:#0f172a}
.preview-pane img{max-width:100%;border-radius:6px}
.actions-bar{display:flex;gap:.75rem;align-items:center;justify-content:flex-end;margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);flex-wrap:wrap}
.btn{padding:.55rem 1.1rem;border-radius:6px;font-size:.9rem;font-weight:600;cursor:pointer;border:1px solid transparent;transition:all .15s;display:inline-flex;align-items:center;gap:.4rem}
.btn-primary{background:var(--primary);color:#fff}
.btn-primary:hover{background:var(--primary-hover)}
.btn-secondary{background:#fff;border-color:var(--border);color:#334155}
.btn-secondary:hover{background:#f1f5f9}
.btn-danger{background:var(--danger);color:#fff}
.btn-danger:hover{background:var(--danger-hover)}
.btn-sm{padding:.3rem .6rem;font-size:.8rem}
.status-msg{font-size:.85rem;margin-right:auto;font-weight:600}
.status-msg.success{color:var(--success)}
.status-msg.error{color:var(--danger)}
.status-msg.info{color:var(--info)}
.list-table{width:100%;border-collapse:collapse;margin-top:.5rem}
.list-table th,.list-table td{padding:.65rem .75rem;border-bottom:1px solid var(--border);text-align:left;font-size:.85rem}
.list-table th{background:#f8fafc;font-weight:600;color:var(--muted)}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem}
.media-card{border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff;padding:.5rem;display:flex;flex-direction:column}
.media-card img{width:100%;height:120px;object-fit:cover;border-radius:4px}
.media-card .pdf-thumb{width:100%;height:120px;background:#fee2e2;color:#b91c1c;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:700;font-size:1.5rem;border-radius:4px}
.media-meta{font-size:.75rem;color:var(--muted);margin:.4rem 0;word-break:break-all}
.media-card button{margin-top:auto;font-size:.75rem;padding:.3rem .5rem}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);align-items:center;justify-content:center;z-index:999}
.modal.open{display:flex}
.modal-content{background:#fff;padding:1.5rem;border-radius:8px;max-width:700px;width:92%;max-height:85vh;overflow-y:auto}
.filter-pills{display:flex;gap:.4rem;margin-bottom:1rem;flex-wrap:wrap}
.filter-pill{padding:.3rem .75rem;border-radius:9999px;font-size:.8rem;font-weight:600;background:#f1f5f9;border:1px solid var(--border);cursor:pointer}
.filter-pill.active{background:var(--primary);color:#fff;border-color:var(--primary)}
.section-builder-card{background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem}
.section-header-row{display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem}
.item-builder-row{display:grid;grid-template-columns:70px 1fr 1fr 100px 32px;gap:.5rem;margin-bottom:.5rem;align-items:center}
@media(max-width:720px){.item-builder-row{grid-template-columns:1fr;gap:.25rem;background:#fff;padding:.5rem;border:1px solid #e2e8f0;border-radius:4px}}
.featured-image-widget{display:flex;align-items:center;gap:1rem;background:#f8fafc;border:1px dashed var(--border);border-radius:8px;padding:.6rem .85rem;min-height:85px}
.featured-image-thumb{width:140px;height:95px;min-width:140px;min-height:95px;object-fit:cover;border-radius:6px;border:1px solid var(--border);display:block;flex-shrink:0;background:#f1f5f9}
.featured-image-placeholder{width:140px;height:95px;min-width:140px;min-height:95px;background:#e2e8f0;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:.75rem;text-align:center;padding:.25rem;flex-shrink:0}
.metadata-review-card{background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:1.25rem;margin-top:1.25rem}
</style>
</head>
<body>
<header>
  <div>
    <h1>LifeMode Editorial Operations</h1>
    <span style="font-size:.85rem;color:var(--muted)">Manual Content Management System — Guides, Tools, Checklists &amp; Life Hacks</span>
  </div>
  <div style="display:flex;gap:.5rem;align-items:center">
    <div id="storage-status" class="badge-pill">Checking storage…</div>
  </div>
</header>

<nav class="tabs" role="tablist">
  <button type="button" class="tab-btn active" data-tab="editor">📘 Guides Editor</button>
  <button type="button" class="tab-btn" data-tab="tools-editor">⚙️ Tools Editor</button>
  <button type="button" class="tab-btn" data-tab="checklists-editor">📋 Checklists Editor</button>
  <button type="button" class="tab-btn" data-tab="lifehacks-editor">🎬 Life Hacks Editor</button>
  <button type="button" class="tab-btn" data-tab="drafts">📝 Drafts (<span id="drafts-count">0</span>)</button>
  <button type="button" class="tab-btn" data-tab="history">📚 Publication History (<span id="history-count">0</span>)</button>
  <button type="button" class="tab-btn" data-tab="media">🖼️ Media Library (<span id="media-count">0</span>)</button>
  <button type="button" class="tab-btn" data-tab="affiliates">🛍️ Affiliate Offers Management (<span id="affiliates-count">0</span>)</button>
</nav>

<!-- Tab 1: Guides Editor -->
<section id="tab-editor" class="tab-pane active">
  <div class="card" style="margin-bottom:1rem;padding:.75rem 1.25rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
    <div><strong>Create &amp; Edit Guide Article</strong> — <span style="font-size:.85rem;color:var(--muted)">Complete Article Editor</span></div>
    <div style="display:flex;align-items:center;gap:.5rem">
      <label for="select-load-guide" style="font-size:.8rem;color:var(--muted)">Load Published Guide:</label>
      <select id="select-load-guide" style="font-size:.85rem;padding:.3rem .5rem"><option value="">-- Choose Guide --</option></select>
    </div>
  </div>

  <form id="guide-form" class="card">
    <input type="hidden" name="id" id="field-id">

    <!-- Configuration Row: Category & Featured Image Direct Upload -->
    <div class="form-row" style="margin-bottom:1.25rem">
      <div class="form-group" style="margin-bottom:0">
        <label for="field-category" style="font-weight:700">Guide Category *</label>
        <select id="field-category" name="category" required style="font-size:.95rem;padding:.6rem .75rem">
          <option value="food-kitchen">Food &amp; Kitchen</option>
          <option value="home-maintenance">Home Maintenance</option>
          <option value="cleaning-laundry">Cleaning &amp; Laundry</option>
          <option value="home-organization">Home Organization</option>
          <option value="smart-home">Smart Home</option>
          <option value="home-garden">Home &amp; Garden</option>
        </select>
        <small style="color:var(--muted);margin-top:.25rem">Official LifeMode category for content routing and navigation.</small>
      </div>

      <div class="form-group" style="margin-bottom:0">
        <label style="font-weight:700">Featured Image</label>
        <input type="hidden" id="field-image" name="image">
        <input type="file" id="guide-direct-file-input" accept="image/jpeg,image/png,image/webp" style="display:none">
        <div style="display:flex;gap:.5rem;margin-bottom:.5rem">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-upload-featured-image">📷 Upload Image</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-pick-featured-image">🖼️ Select from Media</button>
        </div>
        <div id="guide-image-preview-container" class="featured-image-widget">
          <div class="featured-image-placeholder">No image selected</div>
          <div style="flex:1;font-size:.8rem;color:var(--muted)">Upload a JPG, PNG, or WebP image directly, or choose from Media Library.</div>
        </div>
      </div>
    </div>

    <!-- Complete Article Editor and Live Preview Split View -->
    <div class="split-view">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.35rem">
          <label style="font-size:.85rem;font-weight:700;color:#334155">Complete Article (Markdown) *</label>
          <span style="font-size:.75rem;color:var(--muted)">Includes title (H1), intro, headings, tables &amp; affiliate links</span>
        </div>
        <div class="editor-toolbar">
          <button type="button" onclick="insertMd('guide', '**', '**', 'bold text')"><strong>B</strong></button>
          <button type="button" onclick="insertMd('guide', '*', '*', 'italic text')"><em>I</em></button>
          <button type="button" onclick="insertMd('guide', '## ', '', 'Section Heading')">H2</button>
          <button type="button" onclick="insertMd('guide', '### ', '', 'Subsection Heading')">H3</button>
          <button type="button" onclick="insertMd('guide', '- ', '', 'List item')">• List</button>
          <button type="button" onclick="insertMd('guide', '1. ', '', 'Step item')">1. Num</button>
          <button type="button" onclick="insertMd('guide', '[', '](https://example.com)', 'Link text')">Link</button>
          <button type="button" onclick="insertTable('guide')">Table</button>
          <button type="button" onclick="openAffiliateSelectorModal()" style="margin-left:auto;background:#fef3c7;border-color:#fde68a;color:#92400e;font-weight:700" title="Find Guides-eligible offers and insert product boxes or links into this article">🔍 Affiliate Inspector (Insert Link/Box)</button>
        </div>
        <textarea id="article-content" class="editor-textarea" style="min-height:440px" required placeholder="# Article Title

Write or paste the complete ready-to-publish article here.
Start with your main title as an H1 heading (e.g. # How to Clean a Cast-Iron Skillet).

## First Step or Section
Include your practical instructions, bullet lists, comparison tables, and any affiliate links."></textarea>

        <div style="margin-top:.75rem;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" id="btn-process-guide" style="background:#0284c7">⚡ Process Article &amp; Generate Metadata</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-editor">Clear Form</button>
        </div>
      </div>

      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.35rem">
          <label style="font-size:.85rem;font-weight:700;color:#334155">Live Formatted Preview</label>
          <span id="preview-reading-time" style="font-size:.75rem;color:var(--muted)"></span>
        </div>
        <div id="preview-output" class="preview-pane" style="min-height:480px">
          <p class="muted">Live preview will appear here as you write or process the article…</p>
        </div>
      </div>
    </div>

    <!-- Reviewable Generated Metadata Section -->
    <div id="guide-metadata-review-card" class="metadata-review-card" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <div>
          <strong style="color:var(--primary);font-size:.95rem">Generated Metadata (Review &amp; Optional Edit)</strong>
          <span style="font-size:.8rem;color:var(--muted);margin-left:.5rem">Populated automatically; manual editing is optional</span>
        </div>
        <span id="metadata-source-pill" class="badge-pill green">✓ Auto-Generated</span>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="field-title">Extracted Title *</label>
          <input id="field-title" name="title" required placeholder="Article title">
        </div>
        <div class="form-group">
          <label for="field-slug">URL Slug * <small>(e.g. /guides/your-slug/)</small></label>
          <input id="field-slug" name="slug" required placeholder="your-article-slug">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="field-seo-title">SEO Title (SERP Display)</label>
          <input id="field-seo-title" name="seoTitle" placeholder="Custom SERP title">
        </div>
        <div class="form-group">
          <label for="field-primary-keyword">Primary Target Keyword</label>
          <input id="field-primary-keyword" name="primaryKeyword" placeholder="Primary keyword">
        </div>
      </div>

      <div class="form-group" style="margin-bottom:0">
        <label for="field-description">Short Description / Excerpt * <small>(Used for SERP snippet &amp; social cards)</small></label>
        <textarea id="field-description" name="description" rows="2" required placeholder="Summary of the article"></textarea>
        <input type="hidden" id="field-seo-desc" name="seoDescription">
      </div>
    </div>

    <div class="actions-bar">
      <span id="editor-status" class="status-msg"></span>
      <button type="button" class="btn btn-secondary" id="btn-save-draft">💾 Save Draft</button>
      <button type="button" class="btn btn-primary" id="btn-publish-guide">🚀 Publish Guide</button>
    </div>
  </form>
</section>

<!-- Tab 2: Tools Editor -->
<section id="tab-tools-editor" class="tab-pane">
  <div class="card" style="margin-bottom:1rem;padding:.75rem 1.25rem;display:flex;align-items:center;justify-content:space-between">
    <div><strong>Create &amp; Edit Interactive Tool</strong></div>
    <div style="display:flex;align-items:center;gap:.5rem">
      <label for="select-load-tool" style="font-size:.8rem;color:var(--muted)">Load Published Tool:</label>
      <select id="select-load-tool" style="font-size:.85rem;padding:.3rem .5rem"><option value="">-- Choose Tool --</option></select>
    </div>
  </div>

  <form id="tool-form" class="card">
    <input type="hidden" name="id" id="tool-field-id">
    <div class="form-row">
      <div class="form-group">
        <label for="tool-field-title">Tool Title *</label>
        <input id="tool-field-title" name="title" required placeholder="e.g. Cookware Material Decision Finder">
      </div>
      <div class="form-group">
        <label for="tool-field-slug">URL Slug * <small>(e.g. /tools/your-tool-slug/)</small></label>
        <input id="tool-field-slug" name="slug" required placeholder="cookware-material-finder">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="tool-field-category">Category *</label>
        <select id="tool-field-category" name="category" required>
          <option value="food-kitchen">Food &amp; Kitchen</option>
          <option value="home-maintenance">Home Maintenance</option>
          <option value="cleaning-laundry">Cleaning &amp; Laundry</option>
          <option value="home-organization">Home Organization</option>
          <option value="smart-home">Smart Home</option>
          <option value="home-garden">Home &amp; Garden</option>
          <option value="storage-organization">Storage &amp; Organization</option>
          <option value="everyday-how-to">Everyday How-To</option>
        </select>
      </div>
      <div class="form-group">
        <label for="tool-field-type">Tool Type *</label>
        <select id="tool-field-type" name="toolType" required>
          <option value="cookware-selector">Cookware Selector</option>
          <option value="fabric-care-advisor">Fabric Care Advisor</option>
          <option value="food-storage">Food Storage Calculator</option>
          <option value="stain-solver">Stain Solver</option>
          <option value="protein-calculator">Protein Calculator</option>
          <option value="maintenance-planner">Seasonal Maintenance Planner</option>
          <option value="storage-planner">Storage Planner</option>
          <option value="heart-rate-calculator">Heart Rate Calculator</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label for="tool-field-summary">Tool Summary * <small>(Min. 10 chars)</small></label>
      <textarea id="tool-field-summary" name="summary" rows="2" required placeholder="Comprehensive description of the tool and its benefits."></textarea>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="tool-field-badge">Badge (Optional)</label>
        <input id="tool-field-badge" name="badge" placeholder="e.g. Interactive Finder">
      </div>
      <div class="form-group">
        <label for="tool-field-instructions">Instructions (Optional)</label>
        <input id="tool-field-instructions" name="instructions" placeholder="e.g. Select your cooking priorities to discover your optimal pan material.">
      </div>
    </div>

    <details style="margin-bottom:1rem;border:1px dashed var(--border);border-radius:6px;padding:.5rem .75rem">
      <summary style="font-size:.85rem;font-weight:600;cursor:pointer;color:var(--primary)">SEO &amp; Related Cross-Links</summary>
      <div class="form-row" style="margin-top:.75rem">
        <div class="form-group">
          <label for="tool-field-seo-title">SEO Title</label>
          <input id="tool-field-seo-title" name="seoTitle" placeholder="Custom SERP title">
        </div>
        <div class="form-group">
          <label for="tool-field-seo-desc">SEO Description</label>
          <input id="tool-field-seo-desc" name="seoDescription" placeholder="Custom meta description">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="tool-field-related-guides">Related Guides <small>(comma-separated slugs)</small></label>
          <input id="tool-field-related-guides" name="relatedGuides" placeholder="how-to-clean-and-maintain-kitchen-knives">
        </div>
        <div class="form-group">
          <label for="tool-field-related-checklists">Related Checklists <small>(comma-separated slugs)</small></label>
          <input id="tool-field-related-checklists" name="relatedChecklists" placeholder="kitchen-deep-clean-checklist">
        </div>
        <div class="form-group">
          <label for="tool-field-related-videos">Related Videos <small>(comma-separated slugs)</small></label>
          <input id="tool-field-related-videos" name="relatedVideos" placeholder="pan-heating-technique, clean-season-cast-iron">
        </div>
      </div>
    </details>

    <div class="split-view">
      <div>
        <label style="font-size:.85rem;font-weight:600;color:#334155;margin-bottom:.35rem;display:block">Science &amp; Guide Markdown Body *</label>
        <div class="editor-toolbar">
          <button type="button" onclick="insertMd('tool', '**', '**', 'bold text')"><strong>B</strong></button>
          <button type="button" onclick="insertMd('tool', '*', '*', 'italic text')"><em>I</em></button>
          <button type="button" onclick="insertMd('tool', '## ', '', 'Heading 2')">H2</button>
          <button type="button" onclick="insertMd('tool', '### ', '', 'Heading 3')">H3</button>
          <button type="button" onclick="insertMd('tool', '- ', '', 'List item')">• List</button>
          <button type="button" onclick="insertMd('tool', '1. ', '', 'Numbered item')">1. Num</button>
          <button type="button" onclick="insertMd('tool', '[', '](https://example.com)', 'Link text')">Link</button>
          <button type="button" onclick="insertTable('tool')">Table</button>
          <button type="button" onclick="openMediaPickerForEditor('tool')">Insert Image</button>
        </div>
        <textarea id="tool-article-content" class="editor-textarea" required placeholder="Detailed culinary or home science guide and explanations..."></textarea>
      </div>

      <div>
        <label style="font-size:.85rem;font-weight:600;color:#334155;margin-bottom:.35rem;display:block">Live Guide Preview</label>
        <div id="tool-preview-output" class="preview-pane">
          <p class="muted">Live preview will appear here as you write…</p>
        </div>
      </div>
    </div>

    <div class="actions-bar">
      <span id="tool-status" class="status-msg"></span>
      <button type="button" class="btn btn-secondary" id="btn-clear-tool">Clear Form</button>
      <button type="button" class="btn btn-secondary" id="btn-save-tool-draft">💾 Save Tool Draft</button>
      <button type="button" class="btn btn-primary" id="btn-publish-tool">🚀 Publish Tool</button>
    </div>
  </form>
</section>

<!-- Tab 3: Checklists Editor -->
<section id="tab-checklists-editor" class="tab-pane">
  <div class="card" style="margin-bottom:1rem;padding:.75rem 1.25rem;display:flex;align-items:center;justify-content:space-between">
    <div><strong>Create &amp; Edit Printable &amp; Interactive Checklist</strong></div>
    <div style="display:flex;align-items:center;gap:.5rem">
      <label for="select-load-checklist" style="font-size:.8rem;color:var(--muted)">Load Published Checklist:</label>
      <select id="select-load-checklist" style="font-size:.85rem;padding:.3rem .5rem"><option value="">-- Choose Checklist --</option></select>
    </div>
  </div>

  <form id="checklist-form" class="card">
    <input type="hidden" name="id" id="checklist-field-id">
    <div class="form-row">
      <div class="form-group">
        <label for="checklist-field-title">Checklist Title *</label>
        <input id="checklist-field-title" name="title" required placeholder="e.g. Master Kitchen Deep Clean Checklist">
      </div>
      <div class="form-group">
        <label for="checklist-field-slug">URL Slug * <small>(e.g. /checklists/your-slug/)</small></label>
        <input id="checklist-field-slug" name="slug" required placeholder="kitchen-deep-clean-checklist">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="checklist-field-category">Category *</label>
        <select id="checklist-field-category" name="category" required>
          <option value="cleaning-laundry">Cleaning &amp; Laundry</option>
          <option value="home-maintenance">Home Maintenance</option>
          <option value="food-kitchen">Food &amp; Kitchen</option>
          <option value="home-organization">Home Organization</option>
          <option value="smart-home">Smart Home</option>
          <option value="home-garden">Home &amp; Garden</option>
          <option value="storage-organization">Storage &amp; Organization</option>
          <option value="everyday-how-to">Everyday How-To</option>
        </select>
      </div>
      <div class="form-group">
        <label for="checklist-field-time">Estimated Time</label>
        <input id="checklist-field-time" name="estimatedTime" placeholder="e.g. 2.5 to 3 hours or 5 mins per load">
      </div>
      <div class="form-group">
        <label for="checklist-field-subtitle">Print Subtitle (Optional)</label>
        <input id="checklist-field-subtitle" name="printSubtitle" placeholder="e.g. Complete Kitchen Deep Sanitation Protocol">
      </div>
    </div>

    <div class="form-group">
      <label for="checklist-field-summary">Summary * <small>(Min. 10 chars)</small></label>
      <textarea id="checklist-field-summary" name="summary" rows="2" required placeholder="A systematic top-to-bottom sanitation framework..."></textarea>
    </div>

    <!-- Interactive Sections & Items Builder -->
    <div style="margin:1.5rem 0;border-top:1px solid var(--border);padding-top:1rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
        <div>
          <h3 style="margin:0;font-size:1.1rem;color:#0f172a">Checklist Sections &amp; Tasks *</h3>
          <span style="font-size:.8rem;color:var(--muted)">Organize tasks into structured sections with optional tips and frequency badges</span>
        </div>
        <button type="button" class="btn btn-secondary" id="btn-add-section">+ Add Section</button>
      </div>
      
      <div id="checklist-sections-container"></div>
    </div>

    <details style="margin-bottom:1rem;border:1px dashed var(--border);border-radius:6px;padding:.5rem .75rem">
      <summary style="font-size:.85rem;font-weight:600;cursor:pointer;color:var(--primary)">SEO, Attachments &amp; Related Cross-Links</summary>
      <div class="form-row" style="margin-top:.75rem">
        <div class="form-group">
          <label for="checklist-field-seo-title">SEO Title</label>
          <input id="checklist-field-seo-title" name="seoTitle" placeholder="Custom SERP title">
        </div>
        <div class="form-group">
          <label for="checklist-field-seo-desc">SEO Description</label>
          <input id="checklist-field-seo-desc" name="seoDescription" placeholder="Custom meta description">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="checklist-field-related-tools">Related Tools <small>(comma-separated slugs)</small></label>
          <input id="checklist-field-related-tools" name="relatedTools" placeholder="food-storage-calculator">
        </div>
        <div class="form-group">
          <label for="checklist-field-related-guides">Related Guides <small>(comma-separated slugs)</small></label>
          <input id="checklist-field-related-guides" name="relatedGuides" placeholder="how-to-organize-your-refrigerator">
        </div>
        <div class="form-group">
          <label for="checklist-field-related-videos">Related Videos <small>(comma-separated slugs)</small></label>
          <input id="checklist-field-related-videos" name="relatedVideos" placeholder="clean-season-cast-iron">
        </div>
      </div>
    </details>

    <div class="split-view">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.35rem">
          <label style="font-size:.85rem;font-weight:600;color:#334155">Guidelines &amp; Best Practices Body (Markdown) *</label>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openMediaPickerForEditor('checklist')">📎 Attach File / PDF</button>
        </div>
        <div class="editor-toolbar">
          <button type="button" onclick="insertMd('checklist', '**', '**', 'bold text')"><strong>B</strong></button>
          <button type="button" onclick="insertMd('checklist', '*', '*', 'italic text')"><em>I</em></button>
          <button type="button" onclick="insertMd('checklist', '## ', '', 'Heading 2')">H2</button>
          <button type="button" onclick="insertMd('checklist', '### ', '', 'Heading 3')">H3</button>
          <button type="button" onclick="insertMd('checklist', '- ', '', 'Bullet item')">• List</button>
          <button type="button" onclick="insertMd('checklist', '1. ', '', 'Numbered item')">1. Num</button>
          <button type="button" onclick="insertMd('checklist', '[', '](https://example.com)', 'Link text')">Link</button>
          <button type="button" onclick="insertTable('checklist')">Table</button>
        </div>
        <textarea id="checklist-article-content" class="editor-textarea" required placeholder="In-depth principles, safety warnings, and cleaning protocols..."></textarea>
      </div>

      <div>
        <label style="font-size:.85rem;font-weight:600;color:#334155;margin-bottom:.35rem;display:block">Live Interactive Checklist Preview</label>
        <div id="checklist-preview-output" class="preview-pane">
          <p class="muted">Live checklist preview will update here as you add tasks…</p>
        </div>
      </div>
    </div>

    <div class="actions-bar">
      <span id="checklist-status" class="status-msg"></span>
      <button type="button" class="btn btn-secondary" id="btn-clear-checklist">Clear Form</button>
      <button type="button" class="btn btn-secondary" id="btn-save-checklist-draft">💾 Save Checklist Draft</button>
      <button type="button" class="btn btn-primary" id="btn-publish-checklist">🚀 Publish Checklist</button>
    </div>
  </form>
</section>

<!-- Tab 4: Life Hacks Editor -->
<section id="tab-lifehacks-editor" class="tab-pane">
  <div class="card" style="margin-bottom:1rem;padding:.75rem 1.25rem;display:flex;align-items:center;justify-content:space-between">
    <div><strong>Create &amp; Edit Life Hacks Video</strong></div>
    <div style="display:flex;align-items:center;gap:.5rem">
      <label for="select-load-lifehack" style="font-size:.8rem;color:var(--muted)">Load Published Video:</label>
      <select id="select-load-lifehack" style="font-size:.85rem;padding:.3rem .5rem"><option value="">-- Choose Video --</option></select>
    </div>
  </div>

  <form id="lifehack-form" class="card">
    <div class="form-row">
      <div class="form-group">
        <label for="lh-field-title">Video Title *</label>
        <input id="lh-field-title" name="title" required placeholder="e.g. How to Clean and Season a Cast-Iron Pan">
      </div>
      <div class="form-group">
        <label for="lh-field-id">Video ID / Slug * <small>(e.g. clean-season-cast-iron)</small></label>
        <input id="lh-field-id" name="id" required placeholder="clean-season-cast-iron">
      </div>
    </div>

    <div class="form-group">
      <label for="lh-field-desc">Video Description * <small>(Min. 10 chars)</small></label>
      <textarea id="lh-field-desc" name="description" rows="2" required placeholder="Actionable visual explanation and techniques demonstrated in the video..."></textarea>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="lh-field-url">YouTube Video URL *</label>
        <input id="lh-field-url" name="videoUrl" required placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/...">
        <small style="color:var(--muted);display:block;margin-top:.25rem">Supports standard watch URLs, youtu.be, and YouTube Shorts. The thumbnail is auto-generated upon entry.</small>
      </div>
      <div class="form-group">
        <label for="lh-field-thumb">Thumbnail Image URL <small>(Auto-generated or custom override)</small></label>
        <div style="display:flex;gap:.5rem">
          <input id="lh-field-thumb" name="thumbnail" placeholder="Auto-generated from YouTube ID or custom URL">
          <button type="button" class="btn btn-secondary" id="btn-pick-thumb" style="white-space:nowrap">Pick / Upload Image</button>
        </div>
        <small style="color:var(--muted);display:block;margin-top:.25rem">Leave empty to use official YouTube HQ thumbnail, or paste/pick a custom image.</small>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="lh-field-category">Category (Optional)</label>
        <input id="lh-field-category" name="category" placeholder="e.g. Cookware Care, Kitchen Skill, Plumbing & Drainage, Organization">
      </div>
      <div class="form-group">
        <label for="lh-field-duration">Duration (e.g. 4:20)</label>
        <input id="lh-field-duration" name="duration" placeholder="e.g. 3:45">
      </div>
      <div class="form-group">
        <label for="lh-field-creator">Creator / Channel Attribution</label>
        <input id="lh-field-creator" name="creator" placeholder="e.g. America's Test Kitchen, This Old House, Rouxbe">
      </div>
    </div>

    <details style="margin-bottom:1rem;border:1px dashed var(--border);border-radius:6px;padding:.5rem .75rem">
      <summary style="font-size:.85rem;font-weight:600;cursor:pointer;color:var(--primary)">Companion Resources, Content Ordering &amp; Visibility</summary>
      <div class="form-row" style="margin-top:.75rem">
        <div class="form-group">
          <label for="lh-field-guide-slug">Companion Guide Slug</label>
          <input id="lh-field-guide-slug" placeholder="e.g. how-to-clean-and-season-a-cast-iron-skillet">
        </div>
        <div class="form-group">
          <label for="lh-field-guide-title">Companion Guide Title</label>
          <input id="lh-field-guide-title" placeholder="e.g. Cast-Iron Skillet Seasoning & Care Guide">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="lh-field-tool-slug">Companion Tool Slug</label>
          <input id="lh-field-tool-slug" placeholder="e.g. cookware-material-finder">
        </div>
        <div class="form-group">
          <label for="lh-field-tool-title">Companion Tool Title</label>
          <input id="lh-field-tool-title" placeholder="e.g. Cookware Material Finder">
        </div>
      </div>
      <div class="form-row" style="align-items:center">
        <div class="form-group">
          <label for="lh-field-order">Position in Catalog (0 = Top)</label>
          <input type="number" id="lh-field-order" placeholder="Leave blank to preserve current order">
        </div>
        <div class="form-group" style="margin-top:1.2rem">
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer">
            <input type="checkbox" id="lh-field-hidden" style="width:18px;height:18px">
            <span>Hidden from public catalog (Consolidated duplicate / draft)</span>
          </label>
        </div>
      </div>
    </details>

    <div class="split-view">
      <div>
        <label style="font-size:.85rem;font-weight:600;color:#334155;margin-bottom:.35rem;display:block">Video Status &amp; Upload Guidance</label>
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:6px;padding:1rem;font-size:.85rem;color:#475569;line-height:1.5">
          <p style="margin-top:0"><strong>Supported Video Formats:</strong> MP4 (H.264 / AAC), WebM, QuickTime MOV, or external YouTube video URLs.</p>
          <p>Videos uploaded via <strong>+ Upload MP4</strong> are stored directly in Cloudflare R2 under the <code>life-hacks/</code> directory and served with global CDN edge delivery.</p>
          <div id="lh-upload-status" class="status-msg"></div>
        </div>
      </div>

      <div>
        <label style="font-size:.85rem;font-weight:600;color:#334155;margin-bottom:.35rem;display:block">Live LifeMode Video Card Presentation</label>
        <div id="lh-preview-output" class="preview-pane" style="display:flex;justify-content:center;background:#f8fafc">
          <p class="muted">Live preview will appear here as you enter video details…</p>
        </div>
      </div>
    </div>

    <div class="actions-bar">
      <span id="lh-status" class="status-msg"></span>
      <button type="button" class="btn btn-secondary" id="btn-clear-lh">Clear Form</button>
      <button type="button" class="btn btn-secondary" id="btn-save-lh-draft">💾 Save Life Hack Draft</button>
      <button type="button" class="btn btn-primary" id="btn-publish-lh">🚀 Publish Life Hack</button>
    </div>
  </form>
</section>

<!-- Tab 5: Drafts -->
<section id="tab-drafts" class="tab-pane">
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <div class="filter-pills">
        <button type="button" class="filter-pill active" onclick="filterDrafts('all')">All Drafts</button>
        <button type="button" class="filter-pill" onclick="filterDrafts('guide')">Guides</button>
        <button type="button" class="filter-pill" onclick="filterDrafts('tool')">Tools</button>
        <button type="button" class="filter-pill" onclick="filterDrafts('checklist')">Checklists</button>
        <button type="button" class="filter-pill" onclick="filterDrafts('life-hack')">Life Hacks</button>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="loadDrafts()">Refresh</button>
    </div>
    <div id="drafts-table-container">Loading drafts…</div>
  </div>
</section>

<!-- Tab 6: Publication History -->
<section id="tab-history" class="tab-pane">
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <div class="filter-pills">
        <button type="button" class="filter-pill active" onclick="filterHistory('all')">All Published</button>
        <button type="button" class="filter-pill" onclick="filterHistory('guide')">Guides (<span id="count-hist-guides">0</span>)</button>
        <button type="button" class="filter-pill" onclick="filterHistory('tool')">Tools (<span id="count-hist-tools">0</span>)</button>
        <button type="button" class="filter-pill" onclick="filterHistory('checklist')">Checklists (<span id="count-hist-checklists">0</span>)</button>
        <button type="button" class="filter-pill" onclick="filterHistory('life-hack')">Life Hacks (<span id="count-hist-lifehacks">0</span>)</button>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="loadHistory()">Refresh</button>
    </div>
    <div id="history-table-container">Loading published content…</div>
  </div>
</section>

<!-- Tab 7: Media Library -->
<section id="tab-media" class="tab-pane">
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:1rem">
      <div>
        <h2 style="margin:0 0 .25rem 0;font-size:1.15rem">Cloudflare R2 Media &amp; Attachment Library</h2>
        <span style="font-size:.8rem;color:var(--muted)">Upload and manage JPEG, PNG, WebP images, PDF documents, and MP4 videos.</span>
      </div>
      <div style="display:flex;gap:.5rem;align-items:center">
        <input type="file" id="media-file-input" accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/webm,video/quicktime" style="display:none">
        <button class="btn btn-primary" onclick="document.querySelector('#media-file-input').click()">+ Upload File / Video</button>
        <button class="btn btn-secondary btn-sm" onclick="loadMedia()">Refresh</button>
      </div>
    </div>
    <div id="upload-progress" class="status-msg" style="margin-bottom:1rem"></div>
    <div id="media-grid" class="media-grid">Loading media…</div>
  </div>
</section>

<!-- Tab 8: Affiliate Offers Management -->
<section id="tab-affiliates" class="tab-pane">
  <!-- Top Header Bar -->
  <div class="card" style="margin-bottom:1.25rem">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
      <div>
        <h2 style="margin:0 0 .25rem 0;font-size:1.25rem">🛍️ Unified Affiliate Offers Management</h2>
        <span style="font-size:.85rem;color:var(--muted)">Create, edit, manage product images, and set independent destination eligibility across Guides, Daily Ideas Store, and LifeMode Picks.</span>
      </div>
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn btn-primary" onclick="resetAffiliateFormForNew()">+ Add New Affiliate Offer</button>
        <button type="button" class="btn btn-secondary" onclick="openGuideImportModal()">📥 Import from Guides (<span id="uncataloged-guides-count">0</span>)</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="loadAffiliates()">🔄 Refresh</button>
      </div>
    </div>
  </div>

  <!-- Interactive Management Form (Create & Edit) -->
  <div id="affiliate-management-card" class="card" style="margin-bottom:1.5rem;border:2px solid #0284c7;background:#ffffff">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;border-bottom:1px solid var(--border);padding-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
      <div>
        <h3 id="affiliate-form-heading" style="margin:0;font-size:1.15rem;color:#0f172a">Add New Affiliate Offer</h3>
        <span id="affiliate-form-subheading" style="font-size:.8rem;color:var(--muted)">Paste an affiliate link or enter product details to add a new recommendation to data/commerce/products.json</span>
      </div>
      <div style="display:flex;gap:.5rem;align-items:center">
        <span id="affiliate-mode-badge" class="badge-pill green">New Offer Mode</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="resetAffiliateFormForNew()">Reset Form</button>
      </div>
    </div>

    <form id="form-affiliate-management" novalidate onsubmit="handleSaveAffiliateManagement(event)">
      <input type="hidden" id="manage-aff-id">

      <!-- Section: Destination URL & Fast Prefill -->
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:1rem;margin-bottom:1.25rem">
        <div class="form-group" style="margin-bottom:0">
          <label for="manage-aff-url" style="font-weight:700;color:#0369a1">Affiliate Destination URL * <small style="font-weight:normal;color:var(--muted)">(Amazon, ShareASale, CJ, Partnerize, or Direct)</small></label>
          <div style="display:flex;gap:.5rem;margin-top:.25rem">
            <input type="text" id="manage-aff-url" required placeholder="https://www.amazon.com/dp/... or https://..." style="font-family:monospace;font-size:.85rem;flex:1;padding:.55rem .75rem;border:1px solid #7dd3fc;border-radius:6px" oninput="handleUrlInputAutoFill(this.value)">
            <button type="button" class="btn btn-secondary btn-sm" onclick="handleAutoFillFromUrl()" style="white-space:nowrap">⚡ Auto-Fill Details</button>
          </div>
          <small style="color:#0369a1;display:block;margin-top:.35rem">✓ Exact affiliate tracking URL is preserved byte-for-byte in the catalog.</small>
        </div>
      </div>

      <!-- Core Details Row 1 -->
      <div class="form-row">
        <div class="form-group">
          <label for="manage-aff-title" style="font-weight:700">Product Title / Display Name *</label>
          <input type="text" id="manage-aff-title" required placeholder="e.g. Cuisinart Chef's Classic Stainless Cookware Set" style="font-size:.9rem;padding:.55rem .75rem">
        </div>
        <div class="form-group">
          <label for="manage-aff-custom-id" style="font-weight:700">Unique Product ID <small style="font-weight:normal;color:var(--muted)">(Auto-assigned or custom)</small></label>
          <input type="text" id="manage-aff-custom-id" placeholder="e.g. cuisinart-stainless-cookware-set" style="font-family:monospace;font-size:.85rem;padding:.55rem .75rem">
        </div>
      </div>

      <!-- Core Details Row 2 -->
      <div class="form-row">
        <div class="form-group">
          <label for="manage-aff-brand">Brand / Creator</label>
          <input type="text" id="manage-aff-brand" placeholder="e.g. Cuisinart, Apple, Coursera, Logitech">
        </div>
        <div class="form-group">
          <label for="manage-aff-merchant">Merchant / Network</label>
          <input type="text" id="manage-aff-merchant" placeholder="e.g. Amazon, ShareASale, Direct, Target">
        </div>
        <div class="form-group">
          <label for="manage-aff-asin">ASIN <small style="font-weight:normal;color:var(--muted)">(Optional, Amazon items only)</small></label>
          <input type="text" id="manage-aff-asin" placeholder="e.g. B005H05SXM">
        </div>
      </div>

      <!-- Core Details Row 3: Type, Status, Price -->
      <div class="form-row">
        <div class="form-group">
          <label for="manage-aff-type" style="font-weight:700">Offer Type *</label>
          <select id="manage-aff-type" style="padding:.55rem .75rem">
            <option value="physical">Physical Product</option>
            <option value="digital">Digital Product</option>
            <option value="course">Course / Education</option>
            <option value="software">Software / SaaS</option>
            <option value="travel">Travel / Stay</option>
            <option value="service">Service</option>
            <option value="other">Other Offer</option>
          </select>
        </div>
        <div class="form-group">
          <label for="manage-aff-status" style="font-weight:700">Publication Status *</label>
          <select id="manage-aff-status" style="padding:.55rem .75rem">
            <option value="ACTIVE">ACTIVE (Published to eligible destinations)</option>
            <option value="DRAFT">DRAFT (Hidden from all public destinations)</option>
            <option value="ARCHIVED">ARCHIVED (Deactivated / Inactive)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="manage-aff-price">Price Range / Note</label>
          <input type="text" id="manage-aff-price" placeholder="e.g. $149, $29–$39, $15/mo, Free trial">
        </div>
      </div>

      <!-- Row 4: Badge & Default CTA -->
      <div class="form-row">
        <div class="form-group">
          <label for="manage-aff-badge">Editorial Badge <small style="font-weight:normal;color:var(--muted)">(Optional)</small></label>
          <input type="text" id="manage-aff-badge" placeholder="e.g. Editor's Choice, Top Pick, Best Value">
        </div>
        <div class="form-group">
          <label for="manage-aff-cta">Default CTA Button Text</label>
          <input type="text" id="manage-aff-cta" placeholder="View recommendation">
        </div>
      </div>

      <!-- CRITICAL REQUIREMENT C: Three Independent Eligibility Controls -->
      <div style="background:#f8fafc;border:2px solid #cbd5e1;border-radius:8px;padding:1.1rem;margin-bottom:1.25rem">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem">
          <strong style="font-size:.95rem;color:#0f172a">🎯 Destination Eligibility Controls (Independent Settings)</strong>
          <span style="font-size:.75rem;color:var(--muted);background:#fff;border:1px solid var(--border);padding:.2rem .5rem;border-radius:4px">Never automatically all enabled</span>
        </div>
        <p style="margin:0 0 .85rem 0;font-size:.8rem;color:#64748b">
          Select which destinations may display this offer. Each flag operates independently; toggling one does not affect the others.
        </p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:1rem">
          <!-- Control 1: Guides -->
          <label style="display:flex;align-items:flex-start;gap:.6rem;background:#fff;padding:.75rem;border:1px solid var(--border);border-radius:6px;cursor:pointer">
            <input type="checkbox" id="manage-aff-elig-guides" style="margin-top:.2rem;transform:scale(1.2)">
            <div>
              <strong style="font-size:.85rem;color:#0369a1;display:block">1. Guides (eligibleForGuides)</strong>
              <span style="font-size:.75rem;color:var(--muted)">Allows offer to be inserted into Guide articles as product boxes or contextual links, and surfaced in the Inspector.</span>
            </div>
          </label>

          <!-- Control 2: Daily Ideas Store -->
          <label style="display:flex;align-items:flex-start;gap:.6rem;background:#fff;padding:.75rem;border:1px solid var(--border);border-radius:6px;cursor:pointer">
            <input type="checkbox" id="manage-aff-elig-store" style="margin-top:.2rem;transform:scale(1.2)">
            <div>
              <strong style="font-size:.85rem;color:#b45309;display:block">2. Daily Ideas Store (eligibleForStore)</strong>
              <span style="font-size:.75rem;color:var(--muted)">Displays product cards in the Daily Ideas Store (/daily-ideas).</span>
            </div>
          </label>

          <!-- Control 3: LifeMode Picks -->
          <label style="display:flex;align-items:flex-start;gap:.6rem;background:#fff;padding:.75rem;border:1px solid var(--border);border-radius:6px;cursor:pointer">
            <input type="checkbox" id="manage-aff-elig-picks" style="margin-top:.2rem;transform:scale(1.2)">
            <div>
              <strong style="font-size:.85rem;color:#7e22ce;display:block">3. LifeMode Picks (eligibleForPicks)</strong>
              <span style="font-size:.75rem;color:var(--muted)">Displays curated offer cards in the LifeMode Picks public destination (/picks).</span>
            </div>
          </label>
        </div>
      </div>

      <!-- Descriptions -->
      <div class="form-group">
        <label for="manage-aff-desc">Short Description / Summary</label>
        <textarea id="manage-aff-desc" rows="2" placeholder="Key specs, summary, or highlights of this recommendation"></textarea>
      </div>

      <div class="form-group">
        <label for="manage-aff-note">Editorial Recommendation Note</label>
        <textarea id="manage-aff-note" rows="2" placeholder="Why our editors recommend it: durability, practical utility, value"></textarea>
      </div>

      <!-- CRITICAL REQUIREMENT D: Product Image Management -->
      <div style="border:1px solid var(--border);border-radius:8px;padding:1.1rem;margin-bottom:1.25rem;background:#fafafa">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
          <div>
            <strong style="font-size:.9rem;color:#0f172a">🖼️ Product Image Management (Multi-Image Support)</strong>
            <span style="font-size:.75rem;color:var(--muted);display:block">Upload new images, pick from Media Library, or paste image URLs. The Primary image is used in cards, boxes, and previews.</span>
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <input type="file" id="manage-aff-file-input" accept="image/jpeg,image/png,image/webp" style="display:none">
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.querySelector('#manage-aff-file-input').click()">📷 Upload Image to R2</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="openMediaPickerForEditor('manage-aff-image')">🖼️ Select from Media</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addManageImageRow()">+ Add Image URL</button>
          </div>
        </div>

        <div id="manage-aff-upload-status" style="font-size:.8rem;font-weight:600;margin-bottom:.5rem"></div>
        <div id="manage-aff-images-list" style="display:flex;flex-direction:column;gap:.5rem;max-height:260px;overflow-y:auto">
          <!-- Dynamic image cards -->
        </div>
      </div>

      <!-- Management Actions Bar -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:1rem;border-top:1px solid var(--border);flex-wrap:wrap;gap:.75rem">
        <span id="manage-aff-feedback" class="status-msg"></span>
        <div style="display:flex;gap:.5rem;align-items:center">
          <button type="button" class="btn btn-danger btn-sm" id="btn-manage-aff-delete" style="display:none" onclick="handleDeleteCurrentOffer()">🗑️ Delete Offer</button>
          <button type="button" class="btn btn-secondary" onclick="resetAffiliateFormForNew()">Clear Form</button>
          <button type="submit" class="btn btn-primary" id="btn-manage-aff-save" style="background:#0284c7">💾 Save Affiliate Offer</button>
        </div>
      </div>
    </form>
  </div>

  <!-- Catalog Browser Table -->
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1rem">
      <div>
        <h3 style="margin:0 0 .25rem 0;font-size:1.1rem">All Catalog Offers (<span id="affiliates-list-count">0</span>)</h3>
        <span style="font-size:.8rem;color:var(--muted)">Select any offer below to load and edit its product information in the management form above.</span>
      </div>
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <input type="text" id="affiliate-search-input" placeholder="Search by name, brand, merchant, or ID…" oninput="handleAffiliateSearch()" style="padding:.4rem .65rem;border:1px solid var(--border);border-radius:6px;font-size:.85rem;width:260px">
        <select id="affiliate-dest-filter" onchange="filterAffiliates('dest', this.value)" style="padding:.4rem .65rem;border:1px solid var(--border);border-radius:6px;font-size:.85rem">
          <option value="all">All Destinations</option>
          <option value="guides">Guides Eligible</option>
          <option value="store">Store Eligible</option>
          <option value="picks">Picks Eligible</option>
        </select>
        <select id="affiliate-status-filter" onchange="filterAffiliates('status', this.value)" style="padding:.4rem .65rem;border:1px solid var(--border);border-radius:6px;font-size:.85rem">
          <option value="all">All Statuses</option>
          <option value="ACTIVE">ACTIVE Only</option>
          <option value="DRAFT">DRAFT Only</option>
          <option value="ARCHIVED">ARCHIVED Only</option>
        </select>
      </div>
    </div>

    <!-- Type Pills -->
    <div class="filter-pills" id="affiliate-type-filters" style="margin-bottom:1rem">
      <button type="button" class="filter-pill active" onclick="filterAffiliates('type', 'all')">All Types</button>
      <button type="button" class="filter-pill" onclick="filterAffiliates('type', 'physical')">Physical</button>
      <button type="button" class="filter-pill" onclick="filterAffiliates('type', 'digital')">Digital</button>
      <button type="button" class="filter-pill" onclick="filterAffiliates('type', 'course')">Courses</button>
      <button type="button" class="filter-pill" onclick="filterAffiliates('type', 'software')">Software / SaaS</button>
      <button type="button" class="filter-pill" onclick="filterAffiliates('type', 'travel')">Travel</button>
      <button type="button" class="filter-pill" onclick="filterAffiliates('type', 'service')">Services</button>
    </div>

    <!-- Table Container -->
    <div id="affiliates-table-container">Loading affiliate offers…</div>
  </div>
</section>

<!-- Media Picker Modal -->
<div id="media-modal" class="modal">
  <div class="modal-content">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <h3 style="margin:0;font-size:1.1rem">Select Asset from Media Library</h3>
      <button type="button" class="btn btn-secondary btn-sm" onclick="closeMediaModal()">&times; Close</button>
    </div>
    <div id="modal-media-grid" class="media-grid" style="max-height:450px;overflow-y:auto"></div>
  </div>
</div>

<!-- Import Guide Offers Modal -->
<div id="modal-guide-import" class="modal">
  <div class="modal-content" style="max-width:840px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;border-bottom:1px solid var(--border);padding-bottom:.75rem">
      <div>
        <h3 style="margin:0;font-size:1.15rem">📥 Import Affiliate Recommendations from Published Guides</h3>
        <span style="font-size:.8rem;color:var(--muted)">Discovered affiliate links embedded in published guides that are not yet cataloged in the unified system.</span>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="closeGuideImportModal()">&times; Close</button>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;background:#f8fafc;padding:.75rem 1rem;border-radius:6px;border:1px solid var(--border);flex-wrap:wrap;gap:.5rem">
      <div style="font-size:.85rem">
        <span id="guide-import-summary" style="font-weight:600">Scanning guides…</span>
      </div>
      <div style="display:flex;gap:.5rem">
        <button type="button" class="btn btn-secondary btn-sm" onclick="loadGuideImportScan()">🔄 Re-Scan</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-import-all-selected" onclick="importAllSelectedGuideOffers()">Import All Selected</button>
      </div>
    </div>
    <div id="guide-import-list" style="max-height:460px;overflow-y:auto;display:flex;flex-direction:column;gap:.75rem">
      Loading scanned recommendations…
    </div>
  </div>
</div>

<!-- Affiliate Selector Modal (For Guide Editor) -->
<div id="affiliate-selector-modal" class="modal">
  <div class="modal-content" style="max-width:760px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;border-bottom:1px solid var(--border);padding-bottom:.75rem">
      <div>
        <h3 style="margin:0;font-size:1.15rem">🛍️ Affiliate Recommendations Inspector</h3>
        <span style="font-size:.8rem;color:var(--muted)">Browse active catalog offers eligible for Guides, or import uncataloged recommendations.</span>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="closeAffiliateSelectorModal()">&times; Close</button>
    </div>

    <!-- Guide-specific uncataloged banner -->
    <div id="selector-guide-uncataloged-banner" style="display:none;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:.65rem .85rem;margin-bottom:.85rem;font-size:.85rem;color:#92400e;align-items:center;justify-content:space-between">
      <div>
        <strong>Notice:</strong> Found <span id="selector-guide-uncataloged-count">0</span> uncataloged recommendation(s) in published guides.
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="openGuideImportModal()" style="font-size:.8rem;background:#fff">📥 Review &amp; Import</button>
    </div>

    <!-- Actions Legend / Helper -->
    <div style="background:#f8fafc;border:1px solid var(--border);border-radius:6px;padding:.6rem .85rem;margin-bottom:.85rem;font-size:.78rem;color:#475569;display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:.4rem">
      <div><strong>➕ Insert Box:</strong> Inserts <code>::product-box{id="..."}</code> at cursor</div>
      <div><strong>🔗 Insert Link:</strong> Inserts <code>[Text](aff:id)</code> at cursor</div>
      <div><strong>📋 Copy Box / Link:</strong> Copies markdown snippet to clipboard</div>
      <div><strong>🆔 Copy ID:</strong> Copies offer ID for manual shortcode use</div>
    </div>

    <div style="margin-bottom:1rem">
      <input type="text" id="selector-affiliate-search" placeholder="Search by product name, brand, or merchant…" oninput="renderAffiliateSelectorList()" style="width:100%;padding:.55rem .75rem;border:1px solid var(--border);border-radius:6px;font-size:.9rem">
    </div>
    <div id="selector-affiliate-results" style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:.6rem">Loading offers…</div>
  </div>
</div>

<script>
const token = new URLSearchParams(window.location.search).get('token') || '';
let currentDrafts = [];
let currentPublished = { guides: [], tools: [], checklists: [], lifeHacks: [] };
let currentMedia = [];
let currentAffiliates = [];
let affiliateTypeFilter = 'all';
let affiliateDestFilter = 'all';
let affiliateStatusFilter = 'all';
let affiliateSearchQuery = '';
let currentEditImages = [];
let mediaPickerTarget = null;
let draftsFilter = 'all';
let historyFilter = 'all';

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'draft';
}

async function api(path, options = {}) {
  const headers = { 'Authorization': 'Bearer ' + token, ...(options.headers || {}) };
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    alert('Session expired or unauthorized. Please launch dashboard with desktop script.');
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || ('Request failed with ' + res.status));
  }
  return data;
}

// -------------------------------------------------------------
// Tabs Navigation
// -------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    const pane = document.querySelector('#tab-' + target);
    if (pane) pane.classList.add('active');

    if (target === 'drafts') loadDrafts();
    if (target === 'history') loadHistory();
    if (target === 'media') loadMedia();
    if (target === 'affiliates') loadAffiliates();
  });
});

// -------------------------------------------------------------
// Overview & Counts
// -------------------------------------------------------------
async function refreshCounts() {
  try {
    const data = await api('/api/overview');
    document.querySelector('#drafts-count').textContent = data.draftsCount || 0;
    document.querySelector('#history-count').textContent = data.publishedCount || 0;
    document.querySelector('#media-count').textContent = data.mediaCount || 0;
    if (document.querySelector('#affiliates-count')) {
      document.querySelector('#affiliates-count').textContent = data.affiliatesCount || 0;
    }
    if (document.querySelector('#uncataloged-guides-count')) {
      document.querySelector('#uncataloged-guides-count').textContent = data.uncatalogedGuidesCount || 0;
    }
    document.querySelector('#count-hist-guides').textContent = data.guidesCount || 0;
    document.querySelector('#count-hist-tools').textContent = data.toolsCount || 0;
    document.querySelector('#count-hist-checklists').textContent = data.checklistsCount || 0;
    document.querySelector('#count-hist-lifehacks').textContent = data.lifeHacksCount || 0;

    const st = document.querySelector('#storage-status');
    if (data.storageConfigured) {
      st.className = 'badge-pill green';
      st.textContent = '✓ Cloudflare R2 Connected';
    } else {
      st.className = 'badge-pill amber';
      st.textContent = '⚡ Local Fallback Storage';
    }
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

// -------------------------------------------------------------
// 1. Guides Editor Logic (Simplified Single-Article Workflow)
// -------------------------------------------------------------
const guideTitleEl = document.querySelector('#field-title');
const guideSlugEl = document.querySelector('#field-slug');
const guideCategoryEl = document.querySelector('#field-category');
const guideContentEl = document.querySelector('#article-content');

guideTitleEl.addEventListener('input', () => {
  if (!guideSlugEl.dataset.manual) {
    guideSlugEl.value = slugify(guideTitleEl.value);
  }
});
guideSlugEl.addEventListener('input', () => {
  guideSlugEl.dataset.manual = 'true';
});
guideCategoryEl.addEventListener('change', updateGuidePreview);

let guidePreviewDebounce = null;
guideContentEl.addEventListener('input', () => {
  clearTimeout(guidePreviewDebounce);
  guidePreviewDebounce = setTimeout(updateGuidePreview, 250);
});

// Cursor position tracking for article content
let lastGuideCursorPos = { start: -1, end: -1 };
function saveGuideCursorPos() {
  if (guideContentEl) {
    lastGuideCursorPos = {
      start: guideContentEl.selectionStart,
      end: guideContentEl.selectionEnd,
    };
  }
}
guideContentEl.addEventListener('keyup', saveGuideCursorPos);
guideContentEl.addEventListener('click', saveGuideCursorPos);
guideContentEl.addEventListener('select', saveGuideCursorPos);
guideContentEl.addEventListener('blur', saveGuideCursorPos);

// Featured Image helpers & direct file picker
function updateFeaturedImageDisplay() {
  const url = document.querySelector('#field-image').value.trim();
  const container = document.querySelector('#guide-image-preview-container');
  if (!container) return;
  if (url) {
    const filename = url.split('/').pop() || 'image';
    container.innerHTML = '<div style="position:relative;width:140px;height:95px;min-width:140px;min-height:95px;flex-shrink:0">' +
      '<img class="featured-image-thumb" alt="' + esc(filename) + '">' +
      '<div class="featured-image-placeholder" style="display:none;position:absolute;top:0;left:0;width:140px;height:95px;font-size:.75rem;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;align-items:center;justify-content:center;text-align:center;padding:.25rem">Preview unavailable</div>' +
      '</div>' +
      '<div style="flex:1"><strong style="font-size:.85rem;word-break:break-all">' + esc(filename) + '</strong><br>' +
      '<button type="button" class="btn btn-danger btn-sm" onclick="removeFeaturedImage()" style="margin-top:.35rem">Remove Image</button></div>';
    const img = container.querySelector('img.featured-image-thumb');
    if (img) {
      img.onerror = () => handleFeaturedImageError(img, url);
      img.src = url;
    }
  } else {
    container.innerHTML = '<div class="featured-image-placeholder">No image selected</div><div style="flex:1;font-size:.8rem;color:var(--muted)">Upload a JPG, PNG, or WebP image directly, or choose from Media Library.</div>';
  }
}
window.handleFeaturedImageError = (img, origUrl) => {
  if (!img.dataset.retried) {
    img.dataset.retried = '1';
    const sep = origUrl.includes('?') ? '&' : '?';
    setTimeout(() => { img.src = origUrl + sep + 't=' + Date.now(); }, 250);
  } else {
    img.style.display = 'none';
    const fallback = img.nextElementSibling;
    if (fallback) fallback.style.display = 'flex';
  }
};
window.removeFeaturedImage = () => {
  document.querySelector('#field-image').value = '';
  const fileInput = document.querySelector('#guide-direct-file-input');
  if (fileInput) fileInput.value = '';
  updateFeaturedImageDisplay();
  updateGuidePreview();
};

document.querySelector('#btn-upload-featured-image')?.addEventListener('click', () => {
  const fileInput = document.querySelector('#guide-direct-file-input');
  if (fileInput) fileInput.value = '';
  fileInput?.click();
});
document.querySelector('#btn-pick-featured-image')?.addEventListener('click', () => {
  openMediaPickerForEditor('guide-featured-direct');
});
document.querySelector('#guide-direct-file-input')?.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!file.type.match(new RegExp('^image/(jpeg|png|webp)$', 'i'))) {
    alert('Unsupported image format. Please select a JPG, PNG, or WebP image.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    alert('File is too large. Maximum size is 10 MB.');
    return;
  }
  const st = document.querySelector('#editor-status');
  st.className = 'status-msg info';
  st.textContent = 'Uploading featured image to storage…';
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await api('/api/media/upload', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, base64Data: reader.result })
      });
      document.querySelector('#field-image').value = res.url;
      updateFeaturedImageDisplay();
      updateGuidePreview();
      st.className = 'status-msg success';
      st.textContent = '✓ Featured image uploaded and set.';
      refreshCounts();
      e.target.value = '';
    } catch (err) {
      st.className = 'status-msg error';
      st.textContent = 'Image upload failed: ' + err.message;
    }
  };
  reader.readAsDataURL(file);
});

async function updateGuidePreview() {
  const md = guideContentEl.value;
  const cat = document.querySelector('#field-category').value;
  const imgUrl = document.querySelector('#field-image').value.trim();
  const title = document.querySelector('#field-title').value.trim();
  const slug = document.querySelector('#field-slug').value.trim();
  const primaryKw = document.querySelector('#field-primary-keyword').value.trim();
  const desc = document.querySelector('#field-description').value.trim();

  const words = md.trim() ? md.trim().split(new RegExp('\\\\s+')).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 200));
  const readingTime = words > 0 ? (minutes + ' min read') : '';
  const rtEl = document.querySelector('#preview-reading-time');
  if (rtEl) rtEl.textContent = readingTime ? ('⏱️ ' + readingTime) : '';

  try {
    const res = await api('/api/preview', { method: 'POST', body: JSON.stringify({ markdown: md }) });
    let headerHtml = '<div style="margin-bottom:1.25rem;padding-bottom:1rem;border-bottom:1px solid #e2e8f0">';
    headerHtml += '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem">';
    headerHtml += '<span class="badge-pill blue">' + esc(cat) + '</span>';
    if (readingTime) {
      headerHtml += '<span style="font-size:.8rem;color:var(--muted)">⏱️ ' + readingTime + '</span>';
    }
    headerHtml += '</div>';

    if (imgUrl) {
      headerHtml += '<div style="margin-bottom:1rem;border-radius:8px;overflow:hidden;max-height:260px;background:#f1f5f9;display:flex;align-items:center;justify-content:center">' +
        '<img src="' + esc(imgUrl) + '" style="width:100%;max-height:260px;object-fit:cover" alt="Featured Image">' +
      '</div>';
    }

    if (title || slug) {
      headerHtml += '<div style="background:#f8fafc;padding:.75rem 1rem;border-radius:6px;border:1px solid #e2e8f0;font-size:.85rem;margin-bottom:1rem">';
      if (title) headerHtml += '<div><strong>Target Title:</strong> ' + esc(title) + '</div>';
      if (slug) headerHtml += '<div style="color:var(--muted)"><strong>URL:</strong> /guides/' + esc(slug) + '/</div>';
      if (primaryKw) headerHtml += '<div style="color:var(--muted)"><strong>Keyword:</strong> ' + esc(primaryKw) + '</div>';
      if (desc) headerHtml += '<div style="color:var(--muted);margin-top:.25rem;font-style:italic">' + esc(desc) + '</div>';
      headerHtml += '</div>';
    }
    headerHtml += '</div>';

    document.querySelector('#preview-output').innerHTML = headerHtml + (res.html || '<p class="muted">Empty article body.</p>');
  } catch {}
}

async function processGuideArticle() {
  const content = guideContentEl.value.trim();
  if (!content) {
    alert('Please write or paste your article Markdown into the editor first.');
    return;
  }
  const st = document.querySelector('#editor-status');
  st.className = 'status-msg info';
  st.textContent = 'Analyzing article and generating metadata…';
  const btn = document.querySelector('#btn-process-guide');
  if (btn) btn.disabled = true;
  try {
    const res = await api('/api/guides/process', {
      method: 'POST',
      body: JSON.stringify({ markdown: content, category: document.querySelector('#field-category').value })
    });
    document.querySelector('#field-title').value = res.title || '';
    document.querySelector('#field-slug').value = res.slug || '';
    document.querySelector('#field-seo-title').value = res.seoTitle || '';
    document.querySelector('#field-primary-keyword').value = res.primaryKeyword || '';
    document.querySelector('#field-description').value = res.seoDescription || '';
    document.querySelector('#field-seo-desc').value = res.seoDescription || '';

    const reviewCard = document.querySelector('#guide-metadata-review-card');
    if (reviewCard) reviewCard.style.display = 'block';

    const pill = document.querySelector('#metadata-source-pill');
    if (pill) {
      pill.textContent = res.source === 'ai' ? '🤖 AI-Generated' : '⚡ Smart Fallback';
      pill.className = res.source === 'ai' ? 'badge-pill purple' : 'badge-pill green';
    }

    if (res.readingTime) {
      const rtEl = document.querySelector('#preview-reading-time');
      if (rtEl) rtEl.textContent = '⏱️ ' + res.readingTime + ' read';
    }

    st.className = 'status-msg success';
    st.textContent = '✓ Article processed (' + (res.source === 'ai' ? 'AI' : 'Fallback') + '). Metadata ready.';
    updateGuidePreview();
  } catch (err) {
    st.className = 'status-msg error';
    st.textContent = 'Processing failed: ' + err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}
document.querySelector('#btn-process-guide')?.addEventListener('click', processGuideArticle);

function ensureGuideMetadata() {
  const content = guideContentEl.value.trim();
  if (!content) return;
  let title = document.querySelector('#field-title').value.trim();
  if (!title) {
    const m = content.match(new RegExp('^#\\\\s+(.+)$', 'm'));
    if (m) title = m[1].trim();
    else {
      const firstLine = content.split(String.fromCharCode(10))[0].replace(new RegExp('^[#\\\\s*_-]+'), '').trim();
      title = firstLine.slice(0, 80) || 'Untitled Guide';
    }
    document.querySelector('#field-title').value = title;
  }
  let slug = document.querySelector('#field-slug').value.trim();
  if (!slug && title) {
    slug = slugify(title);
    document.querySelector('#field-slug').value = slug;
  }
  let desc = document.querySelector('#field-description').value.trim();
  if (!desc) {
    const cleaned = content.replace(new RegExp('^#+.*$', 'gm'), '').trim();
    const para = cleaned.split(new RegExp('\\\\n\\\\s*\\\\n'))[0] || '';
    const mdChars = ['*', '_', '#', String.fromCharCode(96), '[', ']'];
    desc = para.split('').filter(function(c) { return mdChars.indexOf(c) === -1; }).join('').trim().slice(0, 155) || title;
    document.querySelector('#field-description').value = desc;
    document.querySelector('#field-seo-desc').value = desc;
  }
  const reviewCard = document.querySelector('#guide-metadata-review-card');
  if (reviewCard) reviewCard.style.display = 'block';
}

function getFormGuideData() {
  return {
    id: document.querySelector('#field-id').value || undefined,
    contentType: 'guide',
    title: document.querySelector('#field-title').value.trim(),
    slug: document.querySelector('#field-slug').value.trim(),
    category: document.querySelector('#field-category').value,
    image: document.querySelector('#field-image').value.trim(),
    description: document.querySelector('#field-description').value.trim(),
    seoTitle: document.querySelector('#field-seo-title').value.trim() || undefined,
    seoDescription: document.querySelector('#field-seo-desc').value.trim() || undefined,
    primaryKeyword: document.querySelector('#field-primary-keyword').value.trim() || undefined,
    content: guideContentEl.value.trim(),
  };
}

function loadGuideIntoEditor(guide) {
  document.querySelector('#field-id').value = guide.id || '';
  document.querySelector('#field-title').value = guide.title || '';
  document.querySelector('#field-slug').value = guide.slug || '';
  document.querySelector('#field-category').value = guide.category || 'food-kitchen';
  document.querySelector('#field-image').value = guide.image || guide.featuredImage || guide.heroImage || '';
  document.querySelector('#field-description').value = guide.description || guide.summary || '';
  document.querySelector('#field-seo-title').value = guide.seoTitle || '';
  document.querySelector('#field-seo-desc').value = guide.seoDescription || '';
  document.querySelector('#field-primary-keyword').value = guide.primaryKeyword || '';

  let content = guide.content || '';
  if (guide.title && !content.trim().startsWith('# ')) {
    content = '# ' + guide.title + '\\n\\n' + content;
  }
  guideContentEl.value = content;
  guideSlugEl.dataset.manual = 'true';

  updateFeaturedImageDisplay();
  if (guide.title || guide.slug) {
    const reviewCard = document.querySelector('#guide-metadata-review-card');
    if (reviewCard) reviewCard.style.display = 'block';
  }

  document.querySelector('[data-tab="editor"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateGuidePreview();
}

document.querySelector('#btn-clear-editor').addEventListener('click', () => {
  document.querySelector('#guide-form').reset();
  document.querySelector('#field-id').value = '';
  document.querySelector('#field-image').value = '';
  delete guideSlugEl.dataset.manual;
  updateFeaturedImageDisplay();
  const reviewCard = document.querySelector('#guide-metadata-review-card');
  if (reviewCard) reviewCard.style.display = 'none';
  const rtEl = document.querySelector('#preview-reading-time');
  if (rtEl) rtEl.textContent = '';
  document.querySelector('#preview-output').innerHTML = '<p class="muted">Live preview will appear here as you write or process the article…</p>';
});

document.querySelector('#btn-save-draft').addEventListener('click', async () => {
  if (!document.querySelector('#field-title').value.trim()) {
    if (guideContentEl.value.trim()) {
      await processGuideArticle().catch(() => {});
    }
    ensureGuideMetadata();
  }
  const guide = getFormGuideData();
  const st = document.querySelector('#editor-status');
  st.className = 'status-msg info';
  st.textContent = 'Saving guide draft…';
  try {
    const saved = await api('/api/drafts', { method: 'POST', body: JSON.stringify(guide) });
    document.querySelector('#field-id').value = saved.id;
    st.className = 'status-msg success';
    st.textContent = '✓ Guide draft saved successfully (' + saved.title + ').';
    refreshCounts();
  } catch (err) {
    st.className = 'status-msg error';
    st.textContent = 'Could not save draft: ' + err.message;
  }
});

document.querySelector('#btn-publish-guide').addEventListener('click', async () => {
  if (!document.querySelector('#field-title').value.trim()) {
    if (guideContentEl.value.trim()) {
      await processGuideArticle().catch(() => {});
    }
    ensureGuideMetadata();
  }
  const guide = getFormGuideData();
  if (!confirm('Publish guide "' + (guide.title || 'Untitled') + '" to the live website?\\n\\nThis will write to src/content/guides/' + guide.slug + '.md, create a git commit, and push to origin/master.')) {
    return;
  }
  const st = document.querySelector('#editor-status');
  st.className = 'status-msg info';
  st.textContent = 'Validating and publishing guide…';
  const btn = document.querySelector('#btn-publish-guide');
  btn.disabled = true;
  try {
    const result = await api('/api/publish', { method: 'POST', body: JSON.stringify({ contentType: 'guide', guide }) });
    if (result.status === 'validation-failed') {
      st.className = 'status-msg error';
      st.textContent = result.message;
    } else {
      st.className = 'status-msg success';
      st.textContent = '✓ ' + result.message;
      refreshCounts();
    }
  } catch (err) {
    st.className = 'status-msg error';
    st.textContent = 'Publish failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// -------------------------------------------------------------
// 2. Tools Editor Logic
// -------------------------------------------------------------
const toolTitleEl = document.querySelector('#tool-field-title');
const toolSlugEl = document.querySelector('#tool-field-slug');
toolTitleEl.addEventListener('input', () => {
  if (!toolSlugEl.dataset.manual) {
    toolSlugEl.value = slugify(toolTitleEl.value);
  }
});
toolSlugEl.addEventListener('input', () => {
  toolSlugEl.dataset.manual = 'true';
});

let toolPreviewDebounce = null;
const toolContentEl = document.querySelector('#tool-article-content');
toolContentEl.addEventListener('input', () => {
  clearTimeout(toolPreviewDebounce);
  toolPreviewDebounce = setTimeout(updateToolPreview, 250);
});

async function updateToolPreview() {
  const md = toolContentEl.value;
  try {
    const res = await api('/api/preview', { method: 'POST', body: JSON.stringify({ markdown: md }) });
    document.querySelector('#tool-preview-output').innerHTML = res.html || '<p class="muted">Empty tool guide preview.</p>';
  } catch {}
}

function parseCsv(str) {
  return String(str || '').split(',').map(s => s.trim()).filter(Boolean);
}

function getFormToolData() {
  return {
    id: document.querySelector('#tool-field-id').value || undefined,
    contentType: 'tool',
    title: toolTitleEl.value.trim(),
    slug: toolSlugEl.value.trim(),
    category: document.querySelector('#tool-field-category').value,
    toolType: document.querySelector('#tool-field-type').value,
    summary: document.querySelector('#tool-field-summary').value.trim(),
    badge: document.querySelector('#tool-field-badge').value.trim() || undefined,
    instructions: document.querySelector('#tool-field-instructions').value.trim() || undefined,
    seoTitle: document.querySelector('#tool-field-seo-title').value.trim() || undefined,
    seoDescription: document.querySelector('#tool-field-seo-desc').value.trim() || undefined,
    relatedGuides: parseCsv(document.querySelector('#tool-field-related-guides').value),
    relatedChecklists: parseCsv(document.querySelector('#tool-field-related-checklists').value),
    relatedVideos: parseCsv(document.querySelector('#tool-field-related-videos').value),
    content: toolContentEl.value.trim(),
  };
}

function loadToolIntoEditor(tool) {
  document.querySelector('#tool-field-id').value = tool.id || '';
  toolTitleEl.value = tool.title || '';
  toolSlugEl.value = tool.slug || '';
  document.querySelector('#tool-field-category').value = tool.category || 'food-kitchen';
  document.querySelector('#tool-field-type').value = tool.toolType || 'cookware-selector';
  document.querySelector('#tool-field-summary').value = tool.summary || tool.description || '';
  document.querySelector('#tool-field-badge').value = tool.badge || '';
  document.querySelector('#tool-field-instructions').value = tool.instructions || '';
  document.querySelector('#tool-field-seo-title').value = tool.seoTitle || '';
  document.querySelector('#tool-field-seo-desc').value = tool.seoDescription || '';
  document.querySelector('#tool-field-related-guides').value = (tool.relatedGuides || []).join(', ');
  document.querySelector('#tool-field-related-checklists').value = (tool.relatedChecklists || []).join(', ');
  document.querySelector('#tool-field-related-videos').value = (tool.relatedVideos || []).join(', ');
  toolContentEl.value = tool.content || '';
  toolSlugEl.dataset.manual = 'true';

  document.querySelector('[data-tab="tools-editor"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateToolPreview();
}

document.querySelector('#btn-clear-tool').addEventListener('click', () => {
  document.querySelector('#tool-form').reset();
  document.querySelector('#tool-field-id').value = '';
  delete toolSlugEl.dataset.manual;
  document.querySelector('#tool-preview-output').innerHTML = '<p class="muted">Live preview will appear here as you write…</p>';
});

document.querySelector('#btn-save-tool-draft').addEventListener('click', async () => {
  const tool = getFormToolData();
  const st = document.querySelector('#tool-status');
  st.className = 'status-msg info';
  st.textContent = 'Saving tool draft…';
  try {
    const saved = await api('/api/drafts', { method: 'POST', body: JSON.stringify(tool) });
    document.querySelector('#tool-field-id').value = saved.id;
    st.className = 'status-msg success';
    st.textContent = '✓ Tool draft saved successfully (' + saved.title + ').';
    refreshCounts();
  } catch (err) {
    st.className = 'status-msg error';
    st.textContent = 'Could not save draft: ' + err.message;
  }
});

document.querySelector('#btn-publish-tool').addEventListener('click', async () => {
  const tool = getFormToolData();
  if (!confirm('Publish tool "' + (tool.title || 'Untitled') + '" to the live website?\\n\\nThis will write to src/content/tools/' + tool.slug + '.md, commit, and push to origin/master.')) {
    return;
  }
  const st = document.querySelector('#tool-status');
  st.className = 'status-msg info';
  st.textContent = 'Validating and publishing tool…';
  const btn = document.querySelector('#btn-publish-tool');
  btn.disabled = true;
  try {
    const result = await api('/api/publish', { method: 'POST', body: JSON.stringify({ contentType: 'tool', tool }) });
    if (result.status === 'validation-failed') {
      st.className = 'status-msg error';
      st.textContent = result.message;
    } else {
      st.className = 'status-msg success';
      st.textContent = '✓ ' + result.message;
      refreshCounts();
    }
  } catch (err) {
    st.className = 'status-msg error';
    st.textContent = 'Publish failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// -------------------------------------------------------------
// 3. Checklists Editor Logic
// -------------------------------------------------------------
const checkTitleEl = document.querySelector('#checklist-field-title');
const checkSlugEl = document.querySelector('#checklist-field-slug');
checkTitleEl.addEventListener('input', () => {
  if (!checkSlugEl.dataset.manual) {
    checkSlugEl.value = slugify(checkTitleEl.value);
  }
});
checkSlugEl.addEventListener('input', () => {
  checkSlugEl.dataset.manual = 'true';
});

let checkPreviewDebounce = null;
const checkContentEl = document.querySelector('#checklist-article-content');
checkContentEl.addEventListener('input', () => {
  clearTimeout(checkPreviewDebounce);
  checkPreviewDebounce = setTimeout(updateChecklistPreview, 300);
});

async function updateChecklistPreview() {
  const data = getFormChecklistData();
  try {
    const res = await api('/api/preview/checklist', { method: 'POST', body: JSON.stringify(data) });
    document.querySelector('#checklist-preview-output').innerHTML = res.html || '<p class="muted">Checklist preview.</p>';
  } catch {}
}

let checklistSections = [];

function renderSectionsBuilder() {
  const container = document.querySelector('#checklist-sections-container');
  if (!checklistSections.length) {
    container.innerHTML = '<div style="text-align:center;padding:1.5rem;background:#f8fafc;border:1px dashed var(--border);border-radius:8px;color:var(--muted)">No sections created yet. Click <strong>+ Add Section</strong> to begin.</div>';
    return;
  }

  container.innerHTML = checklistSections.map((sec, sIdx) => {
    const itemsHtml = (sec.items || []).map((it, iIdx) =>
      '<div class="item-builder-row">' +
        '<input type="text" placeholder="ID (e.g. k-1)" value="' + esc(it.id) + '" onchange="updateChecklistItem(' + sIdx + ', ' + iIdx + ', \\'id\\', this.value)" style="font-family:monospace;font-size:.8rem" />' +
        '<input type="text" placeholder="Actionable task text *" value="' + esc(it.text) + '" onchange="updateChecklistItem(' + sIdx + ', ' + iIdx + ', \\'text\\', this.value)" required />' +
        '<input type="text" placeholder="Note / Pro-Tip (optional)" value="' + esc(it.note || '') + '" onchange="updateChecklistItem(' + sIdx + ', ' + iIdx + ', \\'note\\', this.value)" />' +
        '<input type="text" placeholder="Frequency" value="' + esc(it.frequency || '') + '" onchange="updateChecklistItem(' + sIdx + ', ' + iIdx + ', \\'frequency\\', this.value)" />' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="removeChecklistItem(' + sIdx + ', ' + iIdx + ')" title="Delete task" style="color:var(--danger)">&times;</button>' +
      '</div>'
    ).join('');

    return '<div class="section-builder-card">' +
      '<div class="section-header-row">' +
        '<span style="font-weight:700;color:var(--primary);font-size:.9rem">Section ' + (sIdx + 1) + ':</span>' +
        '<input type="text" placeholder="Section Title (e.g. Appliance Deep Care) *" value="' + esc(sec.title) + '" onchange="updateSectionTitle(' + sIdx + ', this.value)" style="flex:1;font-weight:600" required />' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="addChecklistItem(' + sIdx + ')">+ Add Task</button>' +
        '<button type="button" class="btn btn-danger btn-sm" onclick="removeSection(' + sIdx + ')">Delete Section</button>' +
      '</div>' +
      '<div style="padding-left:.5rem">' +
        itemsHtml +
      '</div>' +
    '</div>';
  }).join('');
}

document.querySelector('#btn-add-section').addEventListener('click', () => {
  checklistSections.push({ title: 'New Section', items: [{ id: 'task-' + (Date.now().toString(36).slice(-4)), text: 'First task', note: '', frequency: '' }] });
  renderSectionsBuilder();
  updateChecklistPreview();
});

window.updateSectionTitle = (sIdx, title) => {
  if (checklistSections[sIdx]) {
    checklistSections[sIdx].title = title;
    updateChecklistPreview();
  }
};

window.removeSection = (sIdx) => {
  checklistSections.splice(sIdx, 1);
  renderSectionsBuilder();
  updateChecklistPreview();
};

window.addChecklistItem = (sIdx) => {
  if (checklistSections[sIdx]) {
    const nextNum = (checklistSections[sIdx].items?.length || 0) + 1;
    checklistSections[sIdx].items.push({ id: 'item-' + nextNum, text: '', note: '', frequency: '' });
    renderSectionsBuilder();
    updateChecklistPreview();
  }
};

window.updateChecklistItem = (sIdx, iIdx, field, value) => {
  if (checklistSections[sIdx]?.items[iIdx]) {
    checklistSections[sIdx].items[iIdx][field] = value;
    updateChecklistPreview();
  }
};

window.removeChecklistItem = (sIdx, iIdx) => {
  if (checklistSections[sIdx]?.items) {
    checklistSections[sIdx].items.splice(iIdx, 1);
    renderSectionsBuilder();
    updateChecklistPreview();
  }
};

function getFormChecklistData() {
  return {
    id: document.querySelector('#checklist-field-id').value || undefined,
    contentType: 'checklist',
    title: checkTitleEl.value.trim(),
    slug: checkSlugEl.value.trim(),
    category: document.querySelector('#checklist-field-category').value,
    summary: document.querySelector('#checklist-field-summary').value.trim(),
    estimatedTime: document.querySelector('#checklist-field-time').value.trim() || undefined,
    printSubtitle: document.querySelector('#checklist-field-subtitle').value.trim() || undefined,
    sections: checklistSections,
    relatedTools: parseCsv(document.querySelector('#checklist-field-related-tools').value),
    relatedGuides: parseCsv(document.querySelector('#checklist-field-related-guides').value),
    relatedVideos: parseCsv(document.querySelector('#checklist-field-related-videos').value),
    seoTitle: document.querySelector('#checklist-field-seo-title').value.trim() || undefined,
    seoDescription: document.querySelector('#checklist-field-seo-desc').value.trim() || undefined,
    content: checkContentEl.value.trim(),
  };
}

function loadChecklistIntoEditor(checklist) {
  document.querySelector('#checklist-field-id').value = checklist.id || '';
  checkTitleEl.value = checklist.title || '';
  checkSlugEl.value = checklist.slug || '';
  document.querySelector('#checklist-field-category').value = checklist.category || 'cleaning-laundry';
  document.querySelector('#checklist-field-summary').value = checklist.summary || checklist.description || '';
  document.querySelector('#checklist-field-time').value = checklist.estimatedTime || '';
  document.querySelector('#checklist-field-subtitle').value = checklist.printSubtitle || '';
  document.querySelector('#checklist-field-seo-title').value = checklist.seoTitle || '';
  document.querySelector('#checklist-field-seo-desc').value = checklist.seoDescription || '';
  document.querySelector('#checklist-field-related-tools').value = (checklist.relatedTools || []).join(', ');
  document.querySelector('#checklist-field-related-guides').value = (checklist.relatedGuides || []).join(', ');
  document.querySelector('#checklist-field-related-videos').value = (checklist.relatedVideos || []).join(', ');
  checkContentEl.value = checklist.content || '';
  checklistSections = JSON.parse(JSON.stringify(checklist.sections || []));
  checkSlugEl.dataset.manual = 'true';

  renderSectionsBuilder();
  document.querySelector('[data-tab="checklists-editor"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateChecklistPreview();
}

document.querySelector('#btn-clear-checklist').addEventListener('click', () => {
  document.querySelector('#checklist-form').reset();
  document.querySelector('#checklist-field-id').value = '';
  checklistSections = [];
  renderSectionsBuilder();
  delete checkSlugEl.dataset.manual;
  document.querySelector('#checklist-preview-output').innerHTML = '<p class="muted">Checklist preview.</p>';
});

document.querySelector('#btn-save-checklist-draft').addEventListener('click', async () => {
  const checklist = getFormChecklistData();
  const st = document.querySelector('#checklist-status');
  st.className = 'status-msg info';
  st.textContent = 'Saving checklist draft…';
  try {
    const saved = await api('/api/drafts', { method: 'POST', body: JSON.stringify(checklist) });
    document.querySelector('#checklist-field-id').value = saved.id;
    st.className = 'status-msg success';
    st.textContent = '✓ Checklist draft saved successfully (' + saved.title + ').';
    refreshCounts();
  } catch (err) {
    st.className = 'status-msg error';
    st.textContent = 'Could not save draft: ' + err.message;
  }
});

document.querySelector('#btn-publish-checklist').addEventListener('click', async () => {
  const checklist = getFormChecklistData();
  if (!confirm('Publish checklist "' + (checklist.title || 'Untitled') + '" to the live website?\\n\\nThis will write to src/content/checklists/' + checklist.slug + '.md, commit, and push to origin/master.')) {
    return;
  }
  const st = document.querySelector('#checklist-status');
  st.className = 'status-msg info';
  st.textContent = 'Validating and publishing checklist…';
  const btn = document.querySelector('#btn-publish-checklist');
  btn.disabled = true;
  try {
    const result = await api('/api/publish', { method: 'POST', body: JSON.stringify({ contentType: 'checklist', checklist }) });
    if (result.status === 'validation-failed') {
      st.className = 'status-msg error';
      st.textContent = result.message;
    } else {
      st.className = 'status-msg success';
      st.textContent = '✓ ' + result.message;
      refreshCounts();
    }
  } catch (err) {
    st.className = 'status-msg error';
    st.textContent = 'Publish failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

// -------------------------------------------------------------
// 4. Life Hacks Editor Logic
// -------------------------------------------------------------
const lhTitleEl = document.querySelector('#lh-field-title');
const lhIdEl = document.querySelector('#lh-field-id');
const lhUrlEl = document.querySelector('#lh-field-url');
const lhThumbEl = document.querySelector('#lh-field-thumb');

function extractYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();
  const shortMatch = clean.match(new RegExp('(?:https?://)?(?:www\\\\.)?youtu\\\\.be/([a-zA-Z0-9_-]{11})'));
  if (shortMatch) return shortMatch[1];
  const standardMatch = clean.match(new RegExp('(?:https?://)?(?:[a-zA-Z0-9-]+\\\\.)?youtube\\\\.com/(?:watch\\\\?.*v=|shorts/|embed/|v/)([a-zA-Z0-9_-]{11})'));
  if (standardMatch) return standardMatch[1];
  return null;
}

lhTitleEl.addEventListener('input', () => {
  if (!lhIdEl.dataset.manual) {
    lhIdEl.value = slugify(lhTitleEl.value);
  }
  updateLifeHackPreview();
});
lhIdEl.addEventListener('input', () => {
  lhIdEl.dataset.manual = 'true';
  updateLifeHackPreview();
});

lhUrlEl.addEventListener('input', () => {
  const url = lhUrlEl.value.trim();
  const ytId = extractYouTubeVideoId(url);
  if (ytId && (!lhThumbEl.value.trim() || lhThumbEl.dataset.autoGenerated === 'true')) {
    lhThumbEl.value = 'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg';
    lhThumbEl.dataset.autoGenerated = 'true';
  }
  updateLifeHackPreview();
});

lhThumbEl.addEventListener('input', () => {
  delete lhThumbEl.dataset.autoGenerated;
  updateLifeHackPreview();
});

['#lh-field-desc', '#lh-field-duration', '#lh-field-category', '#lh-field-creator', '#lh-field-hidden'].forEach(sel => {
  document.querySelector(sel)?.addEventListener('input', () => {
    updateLifeHackPreview();
  });
});

let lhPreviewDebounce = null;
async function updateLifeHackPreview() {
  clearTimeout(lhPreviewDebounce);
  lhPreviewDebounce = setTimeout(async () => {
    const video = getFormLifeHackData();
    try {
      const res = await api('/api/preview/life-hack', { method: 'POST', body: JSON.stringify(video) });
      document.querySelector('#lh-preview-output').innerHTML = res.html || '<p class="muted">Live preview.</p>';
    } catch {}
  }, 250);
}

function getFormLifeHackData() {
  const gSlug = document.querySelector('#lh-field-guide-slug').value.trim();
  const gTitle = document.querySelector('#lh-field-guide-title').value.trim();
  const tSlug = document.querySelector('#lh-field-tool-slug').value.trim();
  const tTitle = document.querySelector('#lh-field-tool-title').value.trim();
  const orderVal = document.querySelector('#lh-field-order').value.trim();

  return {
    contentType: 'life-hack',
    id: lhIdEl.value.trim(),
    slug: lhIdEl.value.trim(),
    title: lhTitleEl.value.trim(),
    description: document.querySelector('#lh-field-desc').value.trim(),
    videoUrl: lhUrlEl.value.trim(),
    thumbnail: lhThumbEl.value.trim(),
    duration: document.querySelector('#lh-field-duration').value.trim() || undefined,
    category: document.querySelector('#lh-field-category').value.trim() || undefined,
    creator: document.querySelector('#lh-field-creator').value.trim() || undefined,
    hidden: document.querySelector('#lh-field-hidden').checked,
    relatedGuide: gSlug ? { slug: gSlug, title: gTitle || gSlug } : undefined,
    relatedTool: tSlug ? { slug: tSlug, title: tTitle || tSlug } : undefined,
    orderIndex: orderVal ? Number(orderVal) : undefined,
  };
}

function loadLifeHackIntoEditor(video) {
  lhTitleEl.value = video.title || '';
  lhIdEl.value = video.id || '';
  document.querySelector('#lh-field-desc').value = video.description || '';
  lhUrlEl.value = video.videoUrl || '';
  lhThumbEl.value = video.thumbnail || '';
  delete lhThumbEl.dataset.autoGenerated;
  document.querySelector('#lh-field-duration').value = video.duration || '';
  document.querySelector('#lh-field-category').value = video.category || '';
  document.querySelector('#lh-field-creator').value = video.creator || '';
  document.querySelector('#lh-field-hidden').checked = Boolean(video.hidden);
  document.querySelector('#lh-field-guide-slug').value = video.relatedGuide?.slug || '';
  document.querySelector('#lh-field-guide-title').value = video.relatedGuide?.title || '';
  document.querySelector('#lh-field-tool-slug').value = video.relatedTool?.slug || '';
  document.querySelector('#lh-field-tool-title').value = video.relatedTool?.title || '';
  document.querySelector('#lh-field-order').value = video.orderIndex !== undefined ? video.orderIndex : '';
  lhIdEl.dataset.manual = 'true';

  document.querySelector('[data-tab="lifehacks-editor"]').click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateLifeHackPreview();
}

document.querySelector('#btn-clear-lh').addEventListener('click', () => {
  document.querySelector('#lifehack-form').reset();
  delete lhIdEl.dataset.manual;
  delete lhThumbEl.dataset.autoGenerated;
  document.querySelector('#lh-preview-output').innerHTML = '<p class="muted">Live preview will appear here as you enter video details…</p>';
});

document.querySelector('#btn-save-lh-draft').addEventListener('click', async () => {
  const video = getFormLifeHackData();
  const st = document.querySelector('#lh-status');
  st.className = 'status-msg info';
  st.textContent = 'Saving life hack draft…';
  try {
    const saved = await api('/api/drafts', { method: 'POST', body: JSON.stringify(video) });
    st.className = 'status-msg success';
    st.textContent = '✓ Life hack draft saved successfully (' + saved.title + ').';
    refreshCounts();
  } catch (err) {
    st.className = 'status-msg error';
    st.textContent = 'Could not save draft: ' + err.message;
  }
});

document.querySelector('#btn-publish-lh').addEventListener('click', async () => {
  const video = getFormLifeHackData();
  if (!confirm('Publish Life Hack video "' + (video.title || 'Untitled') + '" to the live website?\\n\\nThis will update data/content/life-hacks.json, create a git commit, and push to origin/master.')) {
    return;
  }
  const st = document.querySelector('#lh-status');
  st.className = 'status-msg info';
  st.textContent = 'Validating and publishing life hack…';
  const btn = document.querySelector('#btn-publish-lh');
  btn.disabled = true;
  try {
    const result = await api('/api/publish', { method: 'POST', body: JSON.stringify({ contentType: 'life-hack', lifeHack: video }) });
    if (result.status === 'validation-failed') {
      st.className = 'status-msg error';
      st.textContent = result.message;
    } else {
      st.className = 'status-msg success';
      st.textContent = '✓ ' + result.message;
      refreshCounts();
      loadHistory();
    }
  } catch (err) {
    st.className = 'status-msg error';
    st.textContent = 'Publish failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

document.querySelector('#btn-pick-thumb').addEventListener('click', () => {
  openMediaPickerForEditor('lh-thumb-url');
});

// -------------------------------------------------------------
// 5. Drafts Tab
// -------------------------------------------------------------
async function loadDrafts() {
  const container = document.querySelector('#drafts-table-container');
  try {
    currentDrafts = await api('/api/drafts');
    renderDraftsTable();
  } catch (err) {
    container.innerHTML = '<p class="error">Could not load drafts: ' + esc(err.message) + '</p>';
  }
}

window.filterDrafts = (type) => {
  draftsFilter = type;
  document.querySelectorAll('#tab-drafts .filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(type));
  });
  renderDraftsTable();
};

function renderDraftsTable() {
  const container = document.querySelector('#drafts-table-container');
  const filtered = draftsFilter === 'all'
    ? currentDrafts
    : currentDrafts.filter(d => (d.contentType || 'guide') === draftsFilter);

  if (!filtered.length) {
    container.innerHTML = '<p class="muted">No ' + (draftsFilter === 'all' ? '' : draftsFilter + ' ') + 'drafts saved.</p>';
    return;
  }

  container.innerHTML = '<table class="list-table"><thead><tr><th>Type</th><th>Title</th><th>Category / ID</th><th>Slug / Identifier</th><th>Updated</th><th>Actions</th></tr></thead><tbody>' +
    filtered.map(d => {
      const type = d.contentType || 'guide';
      let typePill = '<span class="badge-pill purple">📘 Guide</span>';
      if (type === 'tool') typePill = '<span class="badge-pill blue">⚙️ Tool</span>';
      else if (type === 'checklist') typePill = '<span class="badge-pill green">📋 Checklist</span>';
      else if (type === 'life-hack') typePill = '<span class="badge-pill cyan">🎬 Life Hack</span>';

      return '<tr><td>' + typePill + '</td><td><strong>' + esc(d.title) + '</strong></td><td><span class="badge-pill">' + esc(d.category || 'General') + '</span></td><td><code>' + esc(d.slug || d.id) + '</code></td><td>' + esc((d.updatedAt || d.createdAt || '').slice(0, 10)) + '</td><td><button class="btn btn-primary btn-sm" onclick="openDraft(\\'' + esc(d.id) + '\\')">Edit</button> <button class="btn btn-danger btn-sm" onclick="removeDraft(\\'' + esc(d.id) + '\\')">Delete</button></td></tr>';
    }).join('') +
    '</tbody></table>';
}

window.openDraft = (id) => {
  const d = currentDrafts.find(item => item.id === id);
  if (!d) return;
  const type = d.contentType || 'guide';
  if (type === 'tool') loadToolIntoEditor(d);
  else if (type === 'checklist') loadChecklistIntoEditor(d);
  else if (type === 'life-hack') loadLifeHackIntoEditor(d);
  else loadGuideIntoEditor(d);
};

window.removeDraft = async (id) => {
  if (!confirm('Are you sure you want to delete this draft?')) return;
  try {
    await api('/api/drafts/' + encodeURIComponent(id), { method: 'DELETE' });
    loadDrafts();
    refreshCounts();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
};

// -------------------------------------------------------------
// 6. Publication History Tab
// -------------------------------------------------------------
async function loadHistory() {
  const container = document.querySelector('#history-table-container');
  try {
    const [guides, tools, checklists, lifeHacks] = await Promise.all([
      api('/api/guides'),
      api('/api/tools'),
      api('/api/checklists'),
      api('/api/life-hacks'),
    ]);
    currentPublished = { guides, tools, checklists, lifeHacks };
    populateLoadSelectors();
    renderHistoryTable();
    refreshCounts();
  } catch (err) {
    container.innerHTML = '<p class="error">Could not load publication history: ' + esc(err.message) + '</p>';
  }
}

function populateLoadSelectors() {
  // Guides
  const selG = document.querySelector('#select-load-guide');
  selG.innerHTML = '<option value="">-- Choose Guide --</option>' +
    currentPublished.guides.map(g => '<option value="' + esc(g.slug) + '">' + esc(g.title) + '</option>').join('');
  selG.onchange = async () => {
    if (!selG.value) return;
    const full = await api('/api/guides/' + encodeURIComponent(selG.value));
    loadGuideIntoEditor(full);
  };

  // Tools
  const selT = document.querySelector('#select-load-tool');
  selT.innerHTML = '<option value="">-- Choose Tool --</option>' +
    currentPublished.tools.map(t => '<option value="' + esc(t.slug) + '">' + esc(t.title) + '</option>').join('');
  selT.onchange = async () => {
    if (!selT.value) return;
    const full = await api('/api/tools/' + encodeURIComponent(selT.value));
    loadToolIntoEditor(full);
  };

  // Checklists
  const selC = document.querySelector('#select-load-checklist');
  selC.innerHTML = '<option value="">-- Choose Checklist --</option>' +
    currentPublished.checklists.map(c => '<option value="' + esc(c.slug) + '">' + esc(c.title) + '</option>').join('');
  selC.onchange = async () => {
    if (!selC.value) return;
    const full = await api('/api/checklists/' + encodeURIComponent(selC.value));
    loadChecklistIntoEditor(full);
  };

  // Life Hacks
  const selLH = document.querySelector('#select-load-lifehack');
  selLH.innerHTML = '<option value="">-- Choose Video --</option>' +
    currentPublished.lifeHacks.map(v => '<option value="' + esc(v.id) + '">' + esc(v.title) + (v.hidden ? ' (Hidden)' : '') + '</option>').join('');
  selLH.onchange = async () => {
    if (!selLH.value) return;
    const full = await api('/api/life-hacks/' + encodeURIComponent(selLH.value));
    loadLifeHackIntoEditor(full);
  };
}

window.filterHistory = (type) => {
  historyFilter = type;
  document.querySelectorAll('#tab-history .filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase().includes(type));
  });
  renderHistoryTable();
};

function renderHistoryTable() {
  const container = document.querySelector('#history-table-container');
  let items = [];

  if (historyFilter === 'all' || historyFilter === 'guide') {
    items.push(...currentPublished.guides.map(g => ({ ...g, type: 'guide' })));
  }
  if (historyFilter === 'all' || historyFilter === 'tool') {
    items.push(...currentPublished.tools.map(t => ({ ...t, type: 'tool' })));
  }
  if (historyFilter === 'all' || historyFilter === 'checklist') {
    items.push(...currentPublished.checklists.map(c => ({ ...c, type: 'checklist' })));
  }
  if (historyFilter === 'all' || historyFilter === 'life-hack') {
    items.push(...currentPublished.lifeHacks.map(v => ({ ...v, type: 'life-hack', slug: v.id })));
  }

  if (!items.length) {
    container.innerHTML = '<p class="muted">No published content found.</p>';
    return;
  }

  container.innerHTML = '<table class="list-table"><thead><tr><th>Type</th><th>Title</th><th>Category</th><th>Slug / Identifier</th><th>Actions</th></tr></thead><tbody>' +
    items.map(item => {
      let typePill = '<span class="badge-pill purple">📘 Guide</span>';
      let livePath = '/guides/' + item.slug + '/';
      if (item.type === 'tool') {
        typePill = '<span class="badge-pill blue">⚙️ Tool</span>';
        livePath = '/tools/' + item.slug + '/';
      } else if (item.type === 'checklist') {
        typePill = '<span class="badge-pill green">📋 Checklist</span>';
        livePath = '/checklists/' + item.slug + '/';
      } else if (item.type === 'life-hack') {
        typePill = '<span class="badge-pill cyan">🎬 Life Hack</span>';
        livePath = '/life-hacks/#video-' + item.id;
      }

      return '<tr><td>' + typePill + '</td><td><strong>' + esc(item.title) + '</strong></td><td><span class="badge-pill">' + esc(item.category || 'General') + '</span></td><td><code>' + esc(item.slug || item.id) + '</code></td><td><button class="btn btn-secondary btn-sm" onclick="loadPublishedItem(\\'' + item.type + '\\', \\'' + esc(item.slug || item.id) + '\\')">Load in Editor</button> <a href="' + livePath + '" target="_blank" class="btn btn-secondary btn-sm" style="text-decoration:none">View</a></td></tr>';
    }).join('') +
    '</tbody></table>';
}

window.loadPublishedItem = async (type, idOrSlug) => {
  if (type === 'tool') {
    const full = await api('/api/tools/' + encodeURIComponent(idOrSlug));
    loadToolIntoEditor(full);
  } else if (type === 'checklist') {
    const full = await api('/api/checklists/' + encodeURIComponent(idOrSlug));
    loadChecklistIntoEditor(full);
  } else if (type === 'life-hack') {
    const full = await api('/api/life-hacks/' + encodeURIComponent(idOrSlug));
    loadLifeHackIntoEditor(full);
  } else {
    const full = await api('/api/guides/' + encodeURIComponent(idOrSlug));
    loadGuideIntoEditor(full);
  }
};

// -------------------------------------------------------------
// 7. Media Library Tab
// -------------------------------------------------------------
async function loadMedia() {
  const grid = document.querySelector('#media-grid');
  try {
    currentMedia = await api('/api/media');
    if (!currentMedia.length) {
      grid.innerHTML = '<p class="muted">No assets uploaded yet.</p>';
      return;
    }
    grid.innerHTML = currentMedia.map(m => {
      const isPdf = m.mimeType === 'application/pdf' || m.fileName.endsWith('.pdf');
      const thumb = isPdf
        ? '<div class="pdf-thumb">📄 PDF</div>'
        : '<img src="' + esc(m.url) + '" loading="lazy" alt="' + esc(m.fileName) + '">';

      return '<div class="media-card">' +
        thumb +
        '<div class="media-meta"><strong>' + esc(m.fileName) + '</strong><br>' + Math.round(m.size / 1024) + ' KB • ' + esc(m.uploadedAt?.slice(0, 10)) + '</div>' +
        '<div style="display:flex;gap:.25rem">' +
          '<button class="btn btn-secondary" onclick="copyMediaUrl(\\'' + esc(m.url) + '\\')">Copy URL</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    grid.innerHTML = '<p class="error">Could not load media: ' + esc(err.message) + '</p>';
  }
}

window.copyMediaUrl = (url) => {
  navigator.clipboard.writeText(url);
  alert('Copied URL to clipboard:\\n' + url);
};

document.querySelector('#media-file-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const pr = document.querySelector('#upload-progress');
  pr.className = 'status-msg info';
  pr.textContent = 'Uploading ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB) to Cloudflare R2…';

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await api('/api/media/upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
          base64Data: reader.result,
        }),
      });
      pr.className = 'status-msg success';
      pr.textContent = '✓ Uploaded successfully: ' + res.url;
      loadMedia();
      refreshCounts();
    } catch (err) {
      pr.className = 'status-msg error';
      pr.textContent = 'Upload failed: ' + err.message;
    }
  };
  reader.readAsDataURL(file);
});

// Modal Picker
window.openMediaPickerForEditor = (target) => {
  mediaPickerTarget = target;
  const modalGrid = document.querySelector('#modal-media-grid');
  document.querySelector('#media-modal').classList.add('open');
  if (!currentMedia.length) {
    api('/api/media').then(m => { currentMedia = m; renderModalGrid(); });
  } else {
    renderModalGrid();
  }
};

window.closeMediaModal = () => {
  document.querySelector('#media-modal').classList.remove('open');
  mediaPickerTarget = null;
};

function renderModalGrid() {
  const grid = document.querySelector('#modal-media-grid');
  grid.innerHTML = currentMedia.map(m => {
    const isPdf = m.mimeType === 'application/pdf' || m.fileName.endsWith('.pdf');
    const thumb = isPdf
      ? '<div class="pdf-thumb" style="height:90px;font-size:1.1rem">📄 PDF</div>'
      : '<img src="' + esc(m.url) + '" style="height:90px">';

    return '<div class="media-card">' +
      thumb +
      '<div class="media-meta"><strong>' + esc(m.fileName) + '</strong></div>' +
      '<button class="btn btn-primary" onclick="selectMediaAsset(\\'' + esc(m.url) + '\\', \\'' + esc(m.fileName) + '\\', ' + isPdf + ')">Choose</button>' +
    '</div>';
  }).join('');
}

window.selectMediaAsset = (url, fileName, isPdf) => {
  if (mediaPickerTarget === 'guide-image-field' || mediaPickerTarget === 'guide-featured-direct') {
    document.querySelector('#field-image').value = url;
    updateFeaturedImageDisplay();
    updateGuidePreview();
  } else if (mediaPickerTarget === 'lh-thumb-url') {
    const thumbInput = document.querySelector('#lh-field-thumb');
    thumbInput.value = url;
    delete thumbInput.dataset.autoGenerated;
    updateLifeHackPreview();
  } else if (mediaPickerTarget === 'guide') {
    insertMd('guide', '![Image](' + url + ')', '', '');
  } else if (mediaPickerTarget === 'tool') {
    insertMd('tool', '![Tool Diagram](' + url + ')', '', '');
  } else if (mediaPickerTarget === 'checklist') {
    if (isPdf) {
      insertMd('checklist', '[📥 Download Printable Checklist (' + esc(fileName) + ')](' + url + ')', '', '');
    } else {
      insertMd('checklist', '![Checklist Diagram](' + url + ')', '', '');
    }
  } else if (mediaPickerTarget === 'manage-aff-image' || mediaPickerTarget === 'modal-aff-image') {
    addManageImageRow(url, fileName.replace(/\.[^.]+$/, ''));
    if (typeof addModalImageRow === 'function') addModalImageRow(url, fileName.replace(/\.[^.]+$/, ''));
  }
  closeMediaModal();
};

document.querySelector('#btn-pick-image')?.addEventListener('click', () => {
  openMediaPickerForEditor('guide-image-field');
});

// -------------------------------------------------------------
// Markdown Helpers
// -------------------------------------------------------------
window.insertMd = (target, prefix, suffix, sample) => {
  let ta;
  if (target === 'tool') ta = toolContentEl;
  else if (target === 'checklist') ta = checkContentEl;
  else ta = guideContentEl;

  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const sel = ta.value.substring(start, end) || sample;
  const rep = prefix + sel + suffix;
  ta.value = ta.value.substring(0, start) + rep + ta.value.substring(end);
  ta.focus();
  ta.selectionStart = start + prefix.length;
  ta.selectionEnd = start + prefix.length + sel.length;

  if (target === 'tool') updateToolPreview();
  else if (target === 'checklist') updateChecklistPreview();
  else updateGuidePreview();
};

window.insertTable = (target) => {
  const tableSample = '\\n\\n| Column 1 | Column 2 | Column 3 |\\n| :--- | :--- | :--- |\\n| Data A | Data B | Data C |\\n| Data X | Data Y | Data Z |\\n\\n';
  insertMd(target, tableSample, '', '');
};

// -------------------------------------------------------------
// 8. Unified Affiliate Offers Tab Logic
// -------------------------------------------------------------
async function loadAffiliates() {
  const container = document.querySelector('#affiliates-table-container');
  try {
    const params = new URLSearchParams();
    if (affiliateTypeFilter !== 'all') params.set('type', affiliateTypeFilter);
    if (affiliateDestFilter !== 'all') params.set('destination', affiliateDestFilter);
    if (affiliateStatusFilter !== 'all') params.set('status', affiliateStatusFilter);
    if (affiliateSearchQuery.trim()) params.set('q', affiliateSearchQuery.trim());

    currentAffiliates = await api('/api/affiliates?' + params.toString());
    renderAffiliatesTable();
    refreshCounts();
  } catch (err) {
    if (container) {
      container.innerHTML = '<p class="error">Could not load affiliate offers: ' + esc(err.message) + '</p>';
    }
  }
}

function renderAffiliatesTable() {
  const container = document.querySelector('#affiliates-table-container');
  if (!container) return;

  const countBadge = document.querySelector('#affiliates-list-count');
  if (countBadge) countBadge.textContent = currentAffiliates.length;

  if (!currentAffiliates.length) {
    container.innerHTML = '<p class="muted" style="padding:1rem 0">No affiliate offers found matching current filters.</p>';
    return;
  }

  container.innerHTML = '<table class="list-table"><thead><tr>' +
    '<th>Visual</th><th>Offer Title &amp; ID</th><th>Type &amp; Merchant</th><th>Destination Eligibility</th><th>Status</th><th>Actions</th>' +
    '</tr></thead><tbody>' +
    currentAffiliates.map(o => {
      const imgUrl = (o.images && o.images[0] && o.images[0].url) || o.imageUrl || '';
      const thumb = imgUrl
        ? '<img src="' + esc(imgUrl) + '" style="width:54px;height:42px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">'
        : '<div style="display:flex;flex-direction:column;align-items:center;gap:.2rem"><div style="width:54px;height:28px;background:#e2e8f0;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1rem">🛍️</div><button type="button" class="btn btn-secondary btn-sm" style="font-size:.65rem;padding:.1rem .3rem;line-height:1" onclick="editAffiliateOffer(\\'' + esc(o.id) + '\\')">📷 Add</button></div>';

      const typeLabel = esc((o.offerType || 'physical').toUpperCase());
      const brandStr = o.brand ? '<br><span style="font-size:.78rem;color:var(--muted)">Brand: ' + esc(o.brand) + '</span>' : '';
      const idBadge = '<br><code style="font-size:.72rem;color:#475569">ID: ' + esc(o.id) + '</code>';

      let destBadges = [];
      if (o.eligibleForGuides) destBadges.push('<span class="badge-pill blue" style="font-size:.7rem" title="Eligible for Guide articles and product boxes">Guides</span>');
      if (o.eligibleForStore) destBadges.push('<span class="badge-pill amber" style="font-size:.7rem" title="Eligible for Daily Ideas Store (/daily-ideas)">Store</span>');
      if (o.eligibleForPicks) destBadges.push('<span class="badge-pill purple" style="font-size:.7rem" title="Eligible for LifeMode Picks (/picks)">Picks</span>');
      if (!destBadges.length) destBadges.push('<span class="badge-pill" style="font-size:.7rem;color:var(--muted)">No Destinations</span>');

      const isAct = (o.status === 'ACTIVE' || o.state === 'ACTIVE');
      const isArch = (o.status === 'ARCHIVED' || o.state === 'INACTIVE');
      const statusPill = isAct
        ? '<span class="badge-pill green">ACTIVE</span>'
        : (isArch ? '<span class="badge-pill" style="color:var(--muted)">ARCHIVED</span>' : '<span class="badge-pill amber">DRAFT</span>');

      return '<tr>' +
        '<td>' + thumb + '</td>' +
        '<td><strong>' + esc(o.title || o.name || 'Untitled Offer') + '</strong>' + brandStr + idBadge + '</td>' +
        '<td><span class="badge-pill">' + typeLabel + '</span><br><span style="font-size:.75rem;color:var(--muted)">' + esc(o.merchant || 'Direct') + '</span></td>' +
        '<td><div style="display:flex;gap:.25rem;flex-wrap:wrap">' + destBadges.join('') + '</div></td>' +
        '<td>' + statusPill + '</td>' +
        '<td>' +
          '<div style="display:flex;gap:.35rem;flex-wrap:wrap">' +
            '<button type="button" class="btn btn-primary btn-sm" onclick="editAffiliateOffer(\\'' + esc(o.id) + '\\')">✏️ Edit</button>' +
            '<button type="button" class="btn btn-secondary btn-sm" onclick="copyAffiliateLink(\\'' + esc(o.affiliateUrl) + '\\', \\'' + esc(o.title || o.name || 'Recommendation') + '\\')">Copy Link</button>' +
            '<button type="button" class="btn btn-danger btn-sm" onclick="deleteAffiliateOffer(\\'' + esc(o.id) + '\\')">Delete</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>';
}

window.filterAffiliates = (facet, val) => {
  if (facet === 'type') {
    affiliateTypeFilter = val;
    document.querySelectorAll('#affiliate-type-filters .filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.textContent.toLowerCase().includes(val) || (val === 'all' && btn.textContent.includes('All')));
    });
  } else if (facet === 'dest') {
    affiliateDestFilter = val;
  } else if (facet === 'status') {
    affiliateStatusFilter = val;
  }
  loadAffiliates();
};

window.handleAffiliateSearch = () => {
  affiliateSearchQuery = document.querySelector('#affiliate-search-input')?.value || '';
  loadAffiliates();
};

// -------------------------------------------------------------
// Interactive Affiliate Offers Management Logic (Inline Panel)
// -------------------------------------------------------------
let currentManageImages = [];

window.editAffiliateOffer = async (offerId) => {
  const heading = document.querySelector('#affiliate-form-heading');
  const subHeading = document.querySelector('#affiliate-form-subheading');
  const badge = document.querySelector('#affiliate-mode-badge');
  const btnDelete = document.querySelector('#btn-manage-aff-delete');
  const feedback = document.querySelector('#manage-aff-feedback');
  if (feedback) feedback.textContent = '';

  let offer = null;
  if (offerId) {
    offer = currentAffiliates.find(o => o.id === offerId) || await api('/api/affiliates/' + encodeURIComponent(offerId));
    if (heading) heading.textContent = 'Edit Affiliate Offer: ' + (offer.title || offer.name || offer.id);
    if (subHeading) subHeading.textContent = 'Editing existing catalog offer. Preserves exact affiliate URL and settings.';
    if (badge) {
      badge.className = 'badge-pill blue';
      badge.textContent = 'Editing ID: ' + offer.id;
    }
    if (btnDelete) btnDelete.style.display = 'inline-block';
  } else {
    resetAffiliateFormForNew();
    return;
  }

  document.querySelector('#manage-aff-id').value = offer.id || '';
  document.querySelector('#manage-aff-custom-id').value = offer.id || '';
  document.querySelector('#manage-aff-title').value = offer.title || offer.name || '';
  document.querySelector('#manage-aff-url').value = offer.affiliateUrl || '';
  document.querySelector('#manage-aff-brand').value = offer.brand || '';
  document.querySelector('#manage-aff-merchant').value = offer.merchant || '';
  document.querySelector('#manage-aff-asin').value = offer.asin || '';
  document.querySelector('#manage-aff-type').value = offer.offerType || 'physical';
  document.querySelector('#manage-aff-status').value = offer.status || (offer.state === 'ACTIVE' ? 'ACTIVE' : (offer.state === 'INACTIVE' ? 'ARCHIVED' : 'DRAFT'));
  document.querySelector('#manage-aff-price').value = offer.priceRange || '';
  document.querySelector('#manage-aff-badge').value = offer.badge || '';
  document.querySelector('#manage-aff-cta').value = offer.defaultCtaText || 'View recommendation';

  // Three Independent Destination Eligibility Controls
  document.querySelector('#manage-aff-elig-guides').checked = Boolean(offer.eligibleForGuides);
  document.querySelector('#manage-aff-elig-store').checked = Boolean(offer.eligibleForStore);
  document.querySelector('#manage-aff-elig-picks').checked = Boolean(offer.eligibleForPicks);

  document.querySelector('#manage-aff-desc').value = offer.description || '';
  document.querySelector('#manage-aff-note').value = offer.editorialNote || '';

  // Multi-image Management
  currentManageImages = Array.isArray(offer.images) && offer.images.length
    ? JSON.parse(JSON.stringify(offer.images))
    : (offer.imageUrl ? [{ url: offer.imageUrl, alt: offer.imageAlt || '', isPrimary: true, displayOrder: 0 }] : []);

  renderManageImagesList();

  // Smoothly focus/scroll to the management card
  document.querySelector('#affiliate-management-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.resetAffiliateFormForNew = () => {
  const heading = document.querySelector('#affiliate-form-heading');
  const subHeading = document.querySelector('#affiliate-form-subheading');
  const badge = document.querySelector('#affiliate-mode-badge');
  const btnDelete = document.querySelector('#btn-manage-aff-delete');
  const feedback = document.querySelector('#manage-aff-feedback');
  if (feedback) feedback.textContent = '';

  if (heading) heading.textContent = 'Add New Affiliate Offer';
  if (subHeading) subHeading.textContent = 'Paste an affiliate link or enter product details to add a new recommendation to data/commerce/products.json';
  if (badge) {
    badge.className = 'badge-pill green';
    badge.textContent = 'New Offer Mode';
  }
  if (btnDelete) btnDelete.style.display = 'none';

  document.querySelector('#manage-aff-id').value = '';
  document.querySelector('#manage-aff-custom-id').value = '';
  document.querySelector('#manage-aff-title').value = '';
  document.querySelector('#manage-aff-url').value = '';
  document.querySelector('#manage-aff-brand').value = '';
  document.querySelector('#manage-aff-merchant').value = '';
  document.querySelector('#manage-aff-asin').value = '';
  document.querySelector('#manage-aff-type').value = 'physical';
  document.querySelector('#manage-aff-status').value = 'ACTIVE';
  document.querySelector('#manage-aff-price').value = '';
  document.querySelector('#manage-aff-badge').value = '';
  document.querySelector('#manage-aff-cta').value = 'View recommendation';

  // Never automatically enable all three
  document.querySelector('#manage-aff-elig-guides').checked = false;
  document.querySelector('#manage-aff-elig-store').checked = false;
  document.querySelector('#manage-aff-elig-picks').checked = false;

  document.querySelector('#manage-aff-desc').value = '';
  document.querySelector('#manage-aff-note').value = '';

  currentManageImages = [];
  renderManageImagesList();

  document.querySelector('#affiliate-management-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.openAffiliateEditModal = (id) => {
  editAffiliateOffer(id);
};

window.handleUrlInputAutoFill = (rawUrl) => {
  if (!rawUrl || !rawUrl.trim()) return;
  const url = rawUrl.trim();

  // Amazon ASIN parsing
  const asinMatch = url.match(new RegExp('(?:/(?:dp|gp/product|asin)/|ASIN=)([A-Z0-9]{10})', 'i'));
  if (asinMatch) {
    const asinInput = document.querySelector('#manage-aff-asin');
    if (asinInput && !asinInput.value) {
      asinInput.value = asinMatch[1].toUpperCase();
    }
  }

  // Merchant parsing
  const merchantInput = document.querySelector('#manage-aff-merchant');
  if (merchantInput && !merchantInput.value) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      if (host.includes('amazon.')) merchantInput.value = 'Amazon';
      else if (host.includes('shareasale.')) merchantInput.value = 'ShareASale';
      else if (host.includes('coursera.')) merchantInput.value = 'Coursera';
      else if (host.includes('target.')) merchantInput.value = 'Target';
      else merchantInput.value = host;
    } catch {}
  }

  // Suggested Unique ID if empty
  const idInput = document.querySelector('#manage-aff-custom-id');
  const existingId = document.querySelector('#manage-aff-id').value;
  if (!existingId && idInput && !idInput.value) {
    if (asinMatch) {
      idInput.value = 'amazon-' + asinMatch[1].toLowerCase();
    } else {
      try {
        const parsed = new URL(url);
        const lastPart = parsed.pathname.split('/').filter(Boolean).pop();
        if (lastPart) {
          idInput.value = slugify(lastPart);
        }
      } catch {}
    }
  }
};

window.handleAutoFillFromUrl = () => {
  const url = document.querySelector('#manage-aff-url')?.value || '';
  handleUrlInputAutoFill(url);
};

function renderManageImagesList() {
  const container = document.querySelector('#manage-aff-images-list');
  if (!container) return;
  if (!currentManageImages.length) {
    container.innerHTML = '<span style="font-size:.8rem;color:var(--muted);padding:.35rem 0">No images added yet. Click "📷 Upload Image to R2", "🖼️ Select from Media", or "+ Add Image URL".</span>';
    return;
  }

  container.innerHTML = currentManageImages.map((img, idx) => {
    return '<div class="aff-img-row" style="display:flex;align-items:center;gap:.5rem;background:#fff;border:1px solid var(--border);border-radius:4px;padding:.35rem .5rem">' +
      '<img src="' + esc(img.url) + '" style="width:44px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #cbd5e1" onerror="this.style.opacity=0.3">' +
      '<input type="text" class="aff-img-url" value="' + esc(img.url) + '" placeholder="/images/... or https://..." onchange="updateManageImage(' + idx + ', &quot;url&quot;, this.value)" style="flex:2;padding:.3rem .5rem;font-size:.8rem;font-family:monospace">' +
      '<input type="text" class="aff-img-alt" value="' + esc(img.alt || '') + '" placeholder="Alt text" onchange="updateManageImage(' + idx + ', &quot;alt&quot;, this.value)" style="flex:1;padding:.3rem .5rem;font-size:.8rem">' +
      '<label style="display:flex;align-items:center;gap:.25rem;font-size:.75rem;cursor:pointer;white-space:nowrap">' +
        '<input type="radio" name="manage-primary-img" class="aff-img-primary" ' + (img.isPrimary ? 'checked' : '') + ' onchange="setPrimaryManageImage(' + idx + ')"> Primary' +
      '</label>' +
      '<button type="button" class="btn btn-secondary btn-sm" onclick="removeManageImage(' + idx + ')" style="padding:.2rem .4rem;font-size:.75rem" title="Remove image">&times;</button>' +
    '</div>';
  }).join('');
}

window.addManageImageRow = (url = '', alt = '') => {
  currentManageImages.push({
    url,
    alt,
    isPrimary: currentManageImages.length === 0,
    displayOrder: currentManageImages.length,
  });
  renderManageImagesList();
};

window.updateManageImage = (idx, field, val) => {
  if (currentManageImages[idx]) {
    currentManageImages[idx][field] = val;
  }
};

window.setPrimaryManageImage = (idx) => {
  currentManageImages.forEach((img, i) => {
    img.isPrimary = (i === idx);
  });
  renderManageImagesList();
};

window.removeManageImage = (idx) => {
  currentManageImages.splice(idx, 1);
  if (currentManageImages.length > 0 && !currentManageImages.some(img => img.isPrimary)) {
    currentManageImages[0].isPrimary = true;
  }
  renderManageImagesList();
};

document.querySelector('#manage-aff-file-input')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const statusEl = document.querySelector('#manage-aff-upload-status');
  if (statusEl) {
    statusEl.style.color = '#0284c7';
    statusEl.textContent = 'Uploading "' + file.name + '" to Cloudflare R2…';
  }

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await api('/api/media/upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          base64Data: reader.result,
        }),
      });
      addManageImageRow(res.url, file.name.replace(/\.[^.]+$/, ''));
      if (statusEl) {
        statusEl.style.color = '#16a34a';
        statusEl.textContent = '✓ Image uploaded successfully to R2!';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
      }
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = '#dc2626';
        statusEl.textContent = 'Upload failed: ' + err.message;
      }
      alert('Upload failed: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsDataURL(file);
});

window.handleSaveAffiliateManagement = async (e) => {
  e.preventDefault();
  const feedback = document.querySelector('#manage-aff-feedback');
  const btn = document.querySelector('#btn-manage-aff-save');

  const existingId = document.querySelector('#manage-aff-id').value.trim();
  const customId = document.querySelector('#manage-aff-custom-id').value.trim();
  const id = existingId || customId || undefined;

  const title = document.querySelector('#manage-aff-title').value.trim();
  let affiliateUrl = document.querySelector('#manage-aff-url').value.trim();

  // If URL field was cleared or empty when editing an existing offer, recover existing URL
  if (!affiliateUrl && existingId) {
    const existingOffer = currentAffiliates.find(o => o.id === existingId);
    if (existingOffer?.affiliateUrl) {
      affiliateUrl = existingOffer.affiliateUrl;
      const urlInput = document.querySelector('#manage-aff-url');
      if (urlInput) urlInput.value = affiliateUrl;
    }
  }

  if (!affiliateUrl) {
    alert(existingId ? 'Affiliate Destination URL is required for this offer.' : 'Product Destination Affiliate URL is required for new offers.');
    return;
  }
  if (!title) {
    alert('Product Title is required.');
    return;
  }

  const brand = document.querySelector('#manage-aff-brand').value.trim();
  const merchant = document.querySelector('#manage-aff-merchant').value.trim();
  const asin = document.querySelector('#manage-aff-asin').value.trim();
  const offerType = document.querySelector('#manage-aff-type').value;
  const status = document.querySelector('#manage-aff-status').value;
  const priceRange = document.querySelector('#manage-aff-price').value.trim();
  const badge = document.querySelector('#manage-aff-badge').value.trim();
  const defaultCtaText = document.querySelector('#manage-aff-cta').value.trim();

  // CRITICAL REQUIREMENT C: Three independent eligibility flags
  const eligibleForGuides = Boolean(document.querySelector('#manage-aff-elig-guides').checked);
  const eligibleForStore = Boolean(document.querySelector('#manage-aff-elig-store').checked);
  const eligibleForPicks = Boolean(document.querySelector('#manage-aff-elig-picks').checked);

  const description = document.querySelector('#manage-aff-desc').value.trim();
  const editorialNote = document.querySelector('#manage-aff-note').value.trim();

  // CRITICAL REQUIREMENT D: Product Images
  const imageRows = document.querySelectorAll('#manage-aff-images-list .aff-img-row');
  const scrapedImages = [];
  imageRows.forEach((row, i) => {
    const url = (row.querySelector('.aff-img-url')?.value || '').trim();
    const alt = (row.querySelector('.aff-img-alt')?.value || '').trim();
    const isPrimary = Boolean(row.querySelector('.aff-img-primary')?.checked);
    if (url) {
      scrapedImages.push({
        url,
        alt: alt || title,
        isPrimary,
        displayOrder: i,
      });
    }
  });

  if (scrapedImages.length && !scrapedImages.some(img => img.isPrimary)) {
    scrapedImages[0].isPrimary = true;
  }
  const primaryImg = scrapedImages.find(img => img.isPrimary) || scrapedImages[0];

  const payload = {
    id,
    title,
    name: title,
    affiliateUrl, // exact byte-for-byte
    brand: brand || undefined,
    merchant: merchant || undefined,
    asin: asin || undefined,
    offerType,
    status,
    state: status === 'ACTIVE' ? 'ACTIVE' : (status === 'ARCHIVED' ? 'INACTIVE' : 'DRAFT'),
    priceRange,
    badge,
    defaultCtaText: defaultCtaText || 'View recommendation',
    eligibleForGuides,
    eligibleForStore,
    eligibleForPicks,
    description,
    editorialNote,
    imageUrl: primaryImg ? primaryImg.url : undefined,
    imageAlt: primaryImg ? (primaryImg.alt || title) : undefined,
    images: scrapedImages,
  };

  btn.disabled = true;
  feedback.className = 'status-msg info';
  feedback.textContent = 'Saving affiliate offer to catalog…';

  try {
    const res = await api('/api/affiliates', {
      method: 'POST',
      body: JSON.stringify({ offer: payload }),
    });

    feedback.className = 'status-msg success';
    feedback.textContent = '✓ Saved offer "' + (res.offer?.title || title) + '" to catalog (ID: ' + (res.offer?.id || id) + ')!';

    // Refresh table and counts
    await loadAffiliates();
    refreshCounts();

    // Update form to edit mode for the saved offer
    if (res.offer?.id) {
      document.querySelector('#manage-aff-id').value = res.offer.id;
      document.querySelector('#manage-aff-custom-id').value = res.offer.id;
      const heading = document.querySelector('#affiliate-form-heading');
      if (heading) heading.textContent = 'Edit Affiliate Offer: ' + (res.offer.title || title);
      const modeBadge = document.querySelector('#affiliate-mode-badge');
      if (modeBadge) {
        modeBadge.className = 'badge-pill blue';
        modeBadge.textContent = 'Saved ID: ' + res.offer.id;
      }
      const btnDelete = document.querySelector('#btn-manage-aff-delete');
      if (btnDelete) btnDelete.style.display = 'inline-block';

      // Keep currentManageImages in sync with the saved offer images
      if (res.offer?.images && Array.isArray(res.offer.images) && res.offer.images.length) {
        currentManageImages = JSON.parse(JSON.stringify(res.offer.images));
      } else if (res.offer?.imageUrl) {
        currentManageImages = [{
          url: res.offer.imageUrl,
          alt: res.offer.imageAlt || res.offer.title || title,
          isPrimary: true,
          displayOrder: 0,
        }];
      }
      renderManageImagesList();
    }
  } catch (err) {
    feedback.className = 'status-msg error';
    feedback.textContent = 'Failed to save offer: ' + err.message;
  } finally {
    btn.disabled = false;
  }
};

window.handleDeleteCurrentOffer = async () => {
  const id = document.querySelector('#manage-aff-id').value.trim();
  if (!id) return;
  const title = document.querySelector('#manage-aff-title').value.trim() || id;
  if (!confirm('Are you sure you want to delete "' + title + '" from data/commerce/products.json?')) return;

  try {
    await api('/api/affiliates/' + encodeURIComponent(id), { method: 'DELETE' });
    resetAffiliateFormForNew();
    await loadAffiliates();
    refreshCounts();
    alert('Deleted offer: ' + id);
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
};

window.switchToAffiliatesTab = () => {
  closeAffiliateSelectorModal();
  document.querySelector('.tab-btn[data-tab="affiliates"]')?.click();
};

window.deleteAffiliateOffer = async (id) => {
  if (!confirm('Are you sure you want to remove this offer from the central catalog?')) return;
  try {
    await api('/api/affiliates/' + encodeURIComponent(id), { method: 'DELETE' });
    loadAffiliates();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
};

// -------------------------------------------------------------
// 8b. Guide Affiliate Products Import Workflow
// -------------------------------------------------------------
let currentGuideScan = null;

window.openGuideImportModal = async () => {
  const modal = document.querySelector('#modal-guide-import');
  if (modal) modal.classList.add('open');
  await loadGuideImportScan();
};

window.closeGuideImportModal = () => {
  document.querySelector('#modal-guide-import')?.classList.remove('open');
};

window.loadGuideImportScan = async () => {
  const listEl = document.querySelector('#guide-import-list');
  const summaryEl = document.querySelector('#guide-import-summary');
  if (!listEl) return;

  listEl.innerHTML = '<p class="muted" style="padding:.5rem 0">Scanning published guide articles for embedded affiliate links…</p>';
  try {
    const scan = await api('/api/affiliates/scan-guides');
    currentGuideScan = scan;
    const uncataloged = (scan.discovered || []).filter(item => !(item.alreadyInCatalog || item.isCataloged));

    if (summaryEl) {
      summaryEl.textContent = 'Found ' + scan.totalFound + ' total recommendation(s) across guides — ' +
        uncataloged.length + ' not yet cataloged, ' + scan.catalogedCount + ' already in catalog.';
    }

    if (document.querySelector('#uncataloged-guides-count')) {
      document.querySelector('#uncataloged-guides-count').textContent = uncataloged.length;
    }
    const banner = document.querySelector('#selector-guide-uncataloged-banner');
    const bannerCount = document.querySelector('#selector-guide-uncataloged-count');
    if (banner && bannerCount) {
      bannerCount.textContent = uncataloged.length;
      banner.style.display = uncataloged.length > 0 ? 'flex' : 'none';
    }

    if (!uncataloged.length) {
      listEl.innerHTML = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:1rem;text-align:center;color:#166534">' +
        '<strong>✓ All guide affiliate recommendations are already cataloged!</strong>' +
        '<p style="margin:.35rem 0 0 0;font-size:.85rem;color:#15803d">Every affiliate recommendation found in published guides exists in the central catalog.</p>' +
        '</div>';
      return;
    }

    listEl.innerHTML = uncataloged.map((item, idx) => {
      const asinBadge = item.asin ? '<span class="badge-pill" style="font-size:.7rem">ASIN: ' + esc(item.asin) + '</span>' : '<span class="badge-pill" style="font-size:.7rem;color:var(--muted)">Non-Amazon</span>';
      const brandText = item.brand ? '<span style="font-size:.8rem;color:var(--muted)">by ' + esc(item.brand) + '</span>' : '';
      const thumb = item.imageUrl
        ? '<img src="' + esc(item.imageUrl) + '" style="width:48px;height:40px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">'
        : '<div style="width:48px;height:40px;background:#e2e8f0;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.1rem">🛍️</div>';

      return '<div class="guide-import-card" id="guide-import-row-' + idx + '" style="border:1px solid var(--border);border-radius:6px;padding:.75rem;background:#fff">' +
        '<div style="display:flex;gap:.75rem;align-items:flex-start">' +
          '<input type="checkbox" class="guide-import-select" data-idx="' + idx + '" checked style="margin-top:.25rem">' +
          thumb +
          '<div style="flex:1">' +
            '<div style="display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap">' +
              '<strong>' + esc(item.title) + '</strong> ' + brandText + ' ' + asinBadge +
              '<span class="badge-pill blue" style="font-size:.7rem">Guide: ' + esc(item.guideSlug) + '</span>' +
            '</div>' +
            '<div style="font-size:.78rem;font-family:monospace;color:#0369a1;word-break:break-all;margin:.25rem 0">' +
              esc(item.affiliateUrl) +
            '</div>' +
            '<div style="display:flex;gap:1.25rem;align-items:center;margin-top:.5rem;flex-wrap:wrap;background:#f8fafc;padding:.4rem .65rem;border-radius:4px;font-size:.8rem;border:1px solid var(--border)">' +
              '<span style="font-weight:600;color:#334155">Set Destination Eligibility:</span>' +
              '<label style="display:flex;align-items:center;gap:.35rem;cursor:pointer">' +
                '<input type="checkbox" class="import-elig-guides" data-idx="' + idx + '" checked> Guides' +
              '</label>' +
              '<label style="display:flex;align-items:center;gap:.35rem;cursor:pointer">' +
                '<input type="checkbox" class="import-elig-store" data-idx="' + idx + '"> Store (/daily-ideas)' +
              '</label>' +
              '<label style="display:flex;align-items:center;gap:.35rem;cursor:pointer">' +
                '<input type="checkbox" class="import-elig-picks" data-idx="' + idx + '"> Picks (/picks)' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:.35rem">' +
            '<button type="button" class="btn btn-primary btn-sm" id="btn-import-row-' + idx + '" onclick="importSingleGuideOffer(' + idx + ')">Import to Catalog</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    listEl.innerHTML = '<p class="error">Failed to scan guides: ' + esc(err.message) + '</p>';
  }
};

window.importSingleGuideOffer = async (idx) => {
  if (!currentGuideScan || !currentGuideScan.discovered) return;
  const uncataloged = currentGuideScan.discovered.filter(item => !(item.alreadyInCatalog || item.isCataloged));
  const item = uncataloged[idx];
  if (!item) return;

  const btn = document.querySelector('#btn-import-row-' + idx);
  const rowEl = document.querySelector('#guide-import-row-' + idx);
  const eligGuides = Boolean(rowEl?.querySelector('.import-elig-guides')?.checked);
  const eligStore = Boolean(rowEl?.querySelector('.import-elig-store')?.checked);
  const eligPicks = Boolean(rowEl?.querySelector('.import-elig-picks')?.checked);

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Importing…';
  }

  try {
    const res = await api('/api/affiliates/import-guide', {
      method: 'POST',
      body: JSON.stringify({
        title: item.title,
        brand: item.brand,
        affiliateUrl: item.affiliateUrl,
        asin: item.asin,
        guideSlug: item.guideSlug,
        eligibleForGuides: eligGuides,
        eligibleForStore: eligStore,
        eligibleForPicks: eligPicks,
        price: item.price,
        imageUrl: item.imageUrl,
      }),
    });

    item.alreadyInCatalog = true;
    item.isCataloged = true;
    if (rowEl) {
      rowEl.style.background = '#f0fdf4';
      rowEl.style.borderColor = '#bbf7d0';
      rowEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:.35rem .5rem">' +
        '<span style="color:#166534;font-size:.85rem">✓ <strong>' + esc(item.title) + '</strong> imported to catalog (ID: <code>' + esc(res.offer.id) + '</code>).</span>' +
        '<span class="badge-pill green" style="font-size:.7rem">Cataloged</span>' +
        '</div>';
    }

    await loadAffiliates();
    refreshCounts();
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Retry Import';
    }
    alert('Import failed: ' + err.message);
  }
};

window.importAllSelectedGuideOffers = async () => {
  if (!currentGuideScan || !currentGuideScan.discovered) return;
  const uncataloged = currentGuideScan.discovered.filter(item => !(item.alreadyInCatalog || item.isCataloged));
  const selectedCheckboxes = document.querySelectorAll('.guide-import-select:checked');
  if (!selectedCheckboxes.length) {
    alert('No guide recommendations selected for import.');
    return;
  }

  const btnAll = document.querySelector('#btn-import-all-selected');
  if (btnAll) {
    btnAll.disabled = true;
    btnAll.textContent = 'Importing selected…';
  }

  let importedCount = 0;
  for (const cb of selectedCheckboxes) {
    const idx = Number(cb.dataset.idx);
    const item = uncataloged[idx];
    if (item && !(item.alreadyInCatalog || item.isCataloged)) {
      const rowEl = document.querySelector('#guide-import-row-' + idx);
      const eligGuides = Boolean(rowEl?.querySelector('.import-elig-guides')?.checked);
      const eligStore = Boolean(rowEl?.querySelector('.import-elig-store')?.checked);
      const eligPicks = Boolean(rowEl?.querySelector('.import-elig-picks')?.checked);

      try {
        const res = await api('/api/affiliates/import-guide', {
          method: 'POST',
          body: JSON.stringify({
            title: item.title,
            brand: item.brand,
            affiliateUrl: item.affiliateUrl,
            asin: item.asin,
            guideSlug: item.guideSlug,
            eligibleForGuides: eligGuides,
            eligibleForStore: eligStore,
            eligibleForPicks: eligPicks,
            price: item.price,
            imageUrl: item.imageUrl,
          }),
        });
        item.alreadyInCatalog = true;
        item.isCataloged = true;
        importedCount++;
        if (rowEl) {
          rowEl.style.background = '#f0fdf4';
          rowEl.style.borderColor = '#bbf7d0';
          rowEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:.35rem .5rem">' +
            '<span style="color:#166534;font-size:.85rem">✓ <strong>' + esc(item.title) + '</strong> imported (ID: <code>' + esc(res.offer.id) + '</code>).</span>' +
            '<span class="badge-pill green" style="font-size:.7rem">Cataloged</span>' +
            '</div>';
        }
      } catch (e) {
        console.error('Failed to import item', item.title, e);
      }
    }
  }

  if (btnAll) {
    btnAll.disabled = false;
    btnAll.textContent = 'Import All Selected';
  }

  await loadAffiliates();
  refreshCounts();
  alert('Successfully imported ' + importedCount + ' guide recommendation(s) to the catalog.');
  loadGuideImportScan();
};

// -------------------------------------------------------------
// 9. Guide Editor Affiliate Inspector Modal & Direct Insertion
// -------------------------------------------------------------
window.openAffiliateSelectorModal = async () => {
  saveGuideCursorPos();
  const modal = document.querySelector('#affiliate-selector-modal');
  modal.classList.add('open');
  if (!currentAffiliates.length) {
    currentAffiliates = await api('/api/affiliates');
  }
  // Check uncataloged guide recommendations to inform operator
  api('/api/affiliates/scan-guides').then(scan => {
    currentGuideScan = scan;
    const uncat = (scan.discovered || []).filter(item => !(item.alreadyInCatalog || item.isCataloged));
    const banner = document.querySelector('#selector-guide-uncataloged-banner');
    const bannerCount = document.querySelector('#selector-guide-uncataloged-count');
    if (banner && bannerCount) {
      bannerCount.textContent = uncat.length;
      banner.style.display = uncat.length > 0 ? 'flex' : 'none';
    }
  }).catch(() => {});
  renderAffiliateSelectorList();
};

window.closeAffiliateSelectorModal = () => {
  document.querySelector('#affiliate-selector-modal')?.classList.remove('open');
};

window.renderAffiliateSelectorList = () => {
  const container = document.querySelector('#selector-affiliate-results');
  const query = (document.querySelector('#selector-affiliate-search')?.value || '').trim().toLowerCase();

  let filtered = currentAffiliates.filter(o => o.eligibleForGuides === true && (o.status === 'ACTIVE' || o.state === 'ACTIVE'));
  if (query) {
    filtered = filtered.filter(o =>
      (o.title || '').toLowerCase().includes(query) ||
      (o.name || '').toLowerCase().includes(query) ||
      (o.brand || '').toLowerCase().includes(query) ||
      (o.merchant || '').toLowerCase().includes(query) ||
      (o.id || '').toLowerCase().includes(query)
    );
  }

  if (!filtered.length) {
    container.innerHTML = '<p class="muted" style="padding:.5rem 0">No active Guide recommendations match your search.</p>';
    return;
  }

  container.innerHTML = filtered.map(o => {
    const imgUrl = (o.images && o.images[0] && o.images[0].url) || o.imageUrl || '';
    const thumb = imgUrl
      ? '<img src="' + esc(imgUrl) + '" style="width:48px;height:40px;object-fit:cover;border-radius:4px">'
      : '<div style="width:48px;height:40px;background:#e2e8f0;border-radius:4px;display:flex;align-items:center;justify-content:center">🛍️</div>';

    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:.5rem;border:1px solid var(--border);border-radius:6px;gap:.75rem">' +
      '<div style="display:flex;align-items:center;gap:.6rem">' +
        thumb +
        '<div>' +
          '<strong>' + esc(o.title || o.name) + '</strong>' +
          '<div style="font-size:.75rem;color:var(--muted)">' + esc(o.merchant || 'Merchant') + (o.priceRange ? ' • ' + esc(o.priceRange) : '') + (o.badge ? ' • <span class="badge-pill">' + esc(o.badge) + '</span>' : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:.35rem;flex-shrink:0;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-primary btn-sm" onclick="insertAffiliateBoxIntoArticle(\\'' + esc(o.id) + '\\', \\'' + esc(o.title || o.name) + '\\')" title="Insert ::product-box directly into editor at cursor">➕ Insert Box</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="insertContextualAffiliateLinkIntoArticle(\\'' + esc(o.id) + '\\', \\'' + esc(o.title || o.name) + '\\')" title="Insert contextual markdown link at cursor">🔗 Insert Link</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="copyAffiliateBox(\\'' + esc(o.id) + '\\')" title="Copy shortcode to clipboard">Copy Box</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="copyContextualAffiliateLink(\\'' + esc(o.id) + '\\', \\'' + esc(o.title || o.name) + '\\')" title="Copy contextual link markdown">Copy Link</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="copyAffiliateId(\\'' + esc(o.id) + '\\')">Copy ID</button>' +
      '</div>' +
    '</div>';
  }).join('');
};

window.insertAffiliateBoxIntoArticle = (id, title) => {
  if (!guideContentEl) return;
  const currentText = guideContentEl.value;

  // Accidental duplicate insertion prevention check
  const isDuplicate = currentText.indexOf('id="' + id + '"') !== -1 ||
                      currentText.indexOf("id='" + id + "'") !== -1 ||
                      currentText.indexOf('aff:' + id) !== -1;
  if (isDuplicate) {
    const confirmDup = confirm(
      'Notice: The affiliate offer "' + (title || id) + '" is already present in this guide.\\n\\nDo you want to insert an additional product box for this offer?'
    );
    if (!confirmDup) {
      return;
    }
  }

  let start = lastGuideCursorPos.start;
  let end = lastGuideCursorPos.end;
  if (start < 0 || start === undefined || isNaN(start)) {
    start = currentText.length;
    end = currentText.length;
  }

  // Ensure clean double newline padding around the product box shortcode
  let prefix = '\\n\\n';
  let suffix = '\\n\\n';
  if (start === 0 || currentText.slice(0, start).endsWith('\\n\\n')) {
    prefix = '';
  } else if (currentText.slice(0, start).endsWith('\\n')) {
    prefix = '\\n';
  }

  const snippet = prefix + '::product-box{id="' + id + '"}' + suffix;
  const before = currentText.slice(0, start);
  const after = currentText.slice(end);
  guideContentEl.value = before + snippet + after;

  const newPos = start + snippet.length;
  guideContentEl.focus();
  guideContentEl.setSelectionRange(newPos, newPos);
  lastGuideCursorPos = { start: newPos, end: newPos };

  updateGuidePreview();
  closeAffiliateSelectorModal();

  const st = document.querySelector('#editor-status');
  if (st) {
    st.className = 'status-msg success';
    st.textContent = '✓ Inserted affiliate product box for "' + (title || id) + '".';
  }
};

window.insertContextualAffiliateLinkIntoArticle = (id, title) => {
  if (!guideContentEl) return;
  const currentText = guideContentEl.value;

  let start = lastGuideCursorPos.start;
  let end = lastGuideCursorPos.end;
  if (start < 0 || start === undefined || isNaN(start)) {
    start = currentText.length;
    end = currentText.length;
  }

  const selectedText = currentText.slice(start, end);
  const linkText = selectedText || title || 'Recommendation';
  const snippet = '[' + linkText + '](aff:' + id + ')';

  const before = currentText.slice(0, start);
  const after = currentText.slice(end);
  guideContentEl.value = before + snippet + after;

  const newPos = start + snippet.length;
  guideContentEl.focus();
  guideContentEl.setSelectionRange(newPos, newPos);
  lastGuideCursorPos = { start: newPos, end: newPos };

  updateGuidePreview();
  closeAffiliateSelectorModal();

  const st = document.querySelector('#editor-status');
  if (st) {
    st.className = 'status-msg success';
    st.textContent = '✓ Inserted contextual link for "' + (title || id) + '".';
  }
};

window.copyAffiliateBox = (id) => {
  const code = '::product-box{id="' + id + '"}';
  navigator.clipboard.writeText(code).catch(() => {});
  alert('Copied product box shortcode to clipboard:\\n' + code);
};

window.copyContextualAffiliateLink = (id, title) => {
  const md = '[' + (title || 'Recommendation') + '](aff:' + id + ')';
  navigator.clipboard.writeText(md).catch(() => {});
  alert('Copied contextual affiliate link to clipboard:\\n' + md);
};

window.copyAffiliateLink = (url, title) => {
  const md = '[' + title + '](' + url + ')';
  navigator.clipboard.writeText(md).catch(() => {});
  alert('Copied Markdown affiliate link to clipboard:\\n' + md);
};

window.copyAffiliateId = (id) => {
  navigator.clipboard.writeText(id).catch(() => {});
  alert('Copied product ID to clipboard:\\n' + id);
};

// Initial load
refreshCounts();
loadHistory();
</script>
</body>
</html>`;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);

    // Dashboard UI
    if (url.pathname === '/' && request.method === 'GET') {
      const qToken = url.searchParams.get('token');
      if (qToken !== token) {
        response.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Unauthorized. Provide a valid ?token= query parameter.');
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(dashboardHtml());
      return;
    }

    // Static assets from public/ (images, icons)
    if (request.method === 'GET' && (url.pathname.startsWith('/images/') || url.pathname === '/favicon.ico')) {
      const decodedPath = decodeURIComponent(url.pathname).replace(/\\/g, '/');
      const safeRel = join('.', decodedPath).replace(/^(\.\.[\/\\])+/, '');
      const publicDir = resolve(process.cwd(), 'public');
      const filePath = resolve(publicDir, safeRel.replace(/^[/\\]+/, ''));
      const relToPublic = relative(publicDir, filePath);
      const isInsidePublic = !relToPublic.startsWith('..') && !isAbsolute(relToPublic);
      if (isInsidePublic) {
        try {
          const fileStat = await stat(filePath);
          if (fileStat.isFile()) {
            const ext = extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.webp': 'image/webp',
              '.svg': 'image/svg+xml',
              '.gif': 'image/gif',
              '.ico': 'image/x-icon',
              '.avif': 'image/avif',
            };
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            const fileBuffer = await readFile(filePath);
            response.writeHead(200, {
              'Content-Type': contentType,
              'Content-Length': fileBuffer.length,
              'Cache-Control': 'no-cache',
            });
            response.end(fileBuffer);
            return;
          }
        } catch {
          // Fall through to 404
        }
      }
    }

    // Require Bearer token for all /api endpoints
    if (url.pathname.startsWith('/api/')) {
      if (!isAuthorized(request)) {
        sendJson(response, 401, { error: 'Unauthorized. Valid Bearer token required.' });
        return;
      }
    }

    // 1. Overview & Metrics
    if (url.pathname === '/api/overview' && request.method === 'GET') {
      const drafts = await listDrafts();
      const guides = await listPublishedGuides();
      const tools = await listPublishedTools();
      const checklists = await listPublishedChecklists();
      const lifeHacks = await listPublishedLifeHacks();
      const media = await listMediaAssets();
      const affiliates = await listCmsAffiliateOffers();
      const scan = await scanGuideAffiliateProducts();
      const r2 = new CloudflareR2SocialAssetStorageProvider();

      sendJson(response, 200, {
        publishedCount: guides.length + tools.length + checklists.length + lifeHacks.length,
        guidesCount: guides.length,
        toolsCount: tools.length,
        checklistsCount: checklists.length,
        lifeHacksCount: lifeHacks.length,
        draftsCount: drafts.length,
        mediaCount: media.length,
        affiliatesCount: affiliates.length,
        uncatalogedGuidesCount: scan.uncatalogedCount,
        storageConfigured: r2.isConfigured(),
      });
      return;
    }

    // 2. Drafts CRUD
    if (url.pathname === '/api/drafts' && request.method === 'GET') {
      const typeFilter = url.searchParams.get('type') || undefined;
      const drafts = await listDrafts(typeFilter);
      sendJson(response, 200, drafts);
      return;
    }

    if (url.pathname === '/api/drafts' && request.method === 'POST') {
      const body = await readJson(request);
      const saved = await saveDraft(body);
      sendJson(response, 200, saved);
      return;
    }

    if (url.pathname.startsWith('/api/drafts/') && request.method === 'GET') {
      const id = decodeURIComponent(url.pathname.replace('/api/drafts/', ''));
      const draft = await getDraft(id);
      if (!draft) {
        sendJson(response, 404, { error: 'Draft not found.' });
        return;
      }
      sendJson(response, 200, draft);
      return;
    }

    if (url.pathname.startsWith('/api/drafts/') && request.method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.replace('/api/drafts/', ''));
      const deleted = await deleteDraft(id);
      sendJson(response, 200, { ok: deleted, success: deleted });
      return;
    }

    // Process Guide Article (Title parsing, slug, SEO metadata generation with AI/fallback)
    if (url.pathname === '/api/guides/process' && request.method === 'POST') {
      const body = await readJson(request);
      const result = await processArticleMetadata(body.markdown || '', body.category);
      sendJson(response, 200, result);
      return;
    }

    // 3. Published Guides Catalog
    if (url.pathname === '/api/guides' && request.method === 'GET') {
      const guides = await listPublishedGuides();
      sendJson(response, 200, guides);
      return;
    }

    if (url.pathname.startsWith('/api/guides/') && request.method === 'GET') {
      const slug = decodeURIComponent(url.pathname.replace('/api/guides/', ''));
      const guide = await getPublishedGuide(slug);
      if (!guide) {
        sendJson(response, 404, { error: 'Guide not found.' });
        return;
      }
      sendJson(response, 200, guide);
      return;
    }

    // 4. Published Tools Catalog
    if (url.pathname === '/api/tools' && request.method === 'GET') {
      const tools = await listPublishedTools();
      sendJson(response, 200, tools);
      return;
    }

    if (url.pathname.startsWith('/api/tools/') && request.method === 'GET') {
      const slug = decodeURIComponent(url.pathname.replace('/api/tools/', ''));
      const tool = await getPublishedTool(slug);
      if (!tool) {
        sendJson(response, 404, { error: 'Tool not found.' });
        return;
      }
      sendJson(response, 200, tool);
      return;
    }

    // 5. Published Checklists Catalog
    if (url.pathname === '/api/checklists' && request.method === 'GET') {
      const checklists = await listPublishedChecklists();
      sendJson(response, 200, checklists);
      return;
    }

    if (url.pathname.startsWith('/api/checklists/') && request.method === 'GET') {
      const slug = decodeURIComponent(url.pathname.replace('/api/checklists/', ''));
      const checklist = await getPublishedChecklist(slug);
      if (!checklist) {
        sendJson(response, 404, { error: 'Checklist not found.' });
        return;
      }
      sendJson(response, 200, checklist);
      return;
    }

    // 6. Published Life Hacks Catalog
    if (url.pathname === '/api/life-hacks' && request.method === 'GET') {
      const lifeHacks = await listPublishedLifeHacks();
      sendJson(response, 200, lifeHacks);
      return;
    }

    if (url.pathname.startsWith('/api/life-hacks/') && request.method === 'GET') {
      const id = decodeURIComponent(url.pathname.replace('/api/life-hacks/', ''));
      const video = await getPublishedLifeHack(id);
      if (!video) {
        sendJson(response, 404, { error: 'Life Hack video not found.' });
        return;
      }
      sendJson(response, 200, video);
      return;
    }

    // 7. Media Library
    if (url.pathname === '/api/media' && request.method === 'GET') {
      const assets = await listMediaAssets();
      sendJson(response, 200, assets);
      return;
    }

    if (url.pathname === '/api/media/upload' && request.method === 'POST') {
      const body = await readJson(request);
      const asset = await uploadMediaAsset(body);
      sendJson(response, 200, asset);
      return;
    }

    // 7b. Unified Affiliate Offers Catalog Endpoints
    if (url.pathname === '/api/affiliates/scan-guides' && request.method === 'GET') {
      const scan = await scanGuideAffiliateProducts();
      sendJson(response, 200, scan);
      return;
    }

    if (url.pathname === '/api/affiliates/import-guide' && request.method === 'POST') {
      const body = await readJson(request);
      const saved = await importGuideAffiliateOffer(body);
      sendJson(response, 200, { success: true, offer: saved });
      return;
    }

    if (url.pathname === '/api/affiliates' && request.method === 'GET') {
      const query = url.searchParams.get('q') || url.searchParams.get('query') || undefined;
      const offerType = url.searchParams.get('type') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const destination = (url.searchParams.get('destination') as any) || undefined;

      const offers = await listCmsAffiliateOffers({ query, offerType, status, destination });
      sendJson(response, 200, offers);
      return;
    }

    if (url.pathname === '/api/affiliates/quick-add' && request.method === 'POST') {
      const body = await readJson(request);
      const rawUrl = body.affiliateUrl || body.url;
      const result = await quickAddAffiliateOffer(rawUrl, {
        offerType: body.offerType,
        title: body.title,
      });
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === '/api/affiliates' && request.method === 'POST') {
      const body = await readJson(request);
      const offerData = body.offer || body;
      const saved = await saveCmsAffiliateOffer(offerData);
      sendJson(response, 200, { success: true, offer: saved });
      return;
    }

    if (url.pathname.startsWith('/api/affiliates/') && request.method === 'GET' && !url.pathname.endsWith('/quick-add')) {
      const id = decodeURIComponent(url.pathname.replace('/api/affiliates/', ''));
      const offer = await getCmsAffiliateOffer(id);
      if (!offer) {
        sendJson(response, 404, { error: 'Affiliate offer not found.' });
        return;
      }
      sendJson(response, 200, offer);
      return;
    }

    if (url.pathname.startsWith('/api/affiliates/') && request.method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.replace('/api/affiliates/', ''));
      await deleteCmsAffiliateOffer(id);
      sendJson(response, 200, { success: true, ok: true });
      return;
    }

    // 8. Live Markdown Preview
    if (url.pathname === '/api/preview' && request.method === 'POST') {
      const body = await readJson(request);
      const html = renderMarkdownToHtml(body.markdown || '');
      sendJson(response, 200, { html });
      return;
    }

    // 9. Live Checklist Structured Preview
    if (url.pathname === '/api/preview/checklist' && request.method === 'POST') {
      const body = await readJson(request);
      const html = renderChecklistStructuredPreview(body);
      sendJson(response, 200, { html });
      return;
    }

    // 10. Live Life Hack Preview
    if (url.pathname === '/api/preview/life-hack' && request.method === 'POST') {
      const body = await readJson(request);
      const html = renderLifeHackPreview(body);
      sendJson(response, 200, { html });
      return;
    }

    // 11. Publishing Action (Guides, Tools, Checklists, Life Hacks)
    if (url.pathname === '/api/publish' && request.method === 'POST') {
      const body = await readJson(request);
      const contentType = body.contentType || (body.tool ? 'tool' : body.checklist ? 'checklist' : body.lifeHack ? 'life-hack' : 'guide');
      const dryRun = Boolean(body.dryRun);

      let result;
      if (contentType === 'tool') {
        result = await publishTool(body.tool || body.item || body.data, { dryRun });
      } else if (contentType === 'checklist') {
        result = await publishChecklist(body.checklist || body.item || body.data, { dryRun });
      } else if (contentType === 'life-hack') {
        result = await publishLifeHack(body.lifeHack || body.item || body.data, { dryRun });
      } else {
        result = await publishGuide(body.guide || body.item || body.data, { dryRun });
      }

      sendJson(response, result.status === 'validation-failed' ? 422 : 200, result);
      return;
    }

    sendJson(response, 404, { error: 'Not found.' });
  } catch (error: any) {
    sendJson(response, 400, { error: error?.message || 'Request failed.' });
  }
});

server.listen(port, host, async () => {
  const url = `http://${host}:${port}/?token=${token}`;
  try {
    await mkdir(dirname(urlFile), { recursive: true });
    await writeFile(urlFile, url + '\n', 'utf8');
  } catch (err) {
    console.error(`Failed to write urlFile to ${urlFile}:`, err);
  }
  try {
    const tempUrlFile = join(tmpdir(), 'lifemode-editorial-approval.url');
    await writeFile(tempUrlFile, url + '\n', 'utf8');
  } catch {}

  console.log(`LifeMode Editorial Operations dashboard: ${url}`);
  console.log(`Startup URL saved to ${urlFile}`);
  console.log('Bound to loopback only. Press Ctrl+C to stop.');
});
