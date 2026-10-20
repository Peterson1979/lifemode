import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listApprovalQueue,
  approveEditorialQueueItem,
  rejectEditorialQueueItem,
  requestEditorialRevision,
} from '../src/lib/editorial/approval/service.ts';
import { AIRouterGenerationProvider } from '../src/lib/editorial/generation/providers/ai-router.ts';
import { AIRouterReviewProvider } from '../src/lib/editorial/review/providers/ai-router.ts';
import { defaultAIRouter } from '../src/lib/ai/router.ts';
import { isApprovalAuthorizationValid } from '../src/lib/editorial/approval/auth.ts';
import { getEditorialDailyPlan } from '../src/lib/editorial/cadence.ts';
import { renderMarkdownToHtml } from '../src/utils/markdown-renderer.ts';

const host = '127.0.0.1';
const port = Number(process.env.LIFEMODE_APPROVAL_PORT || 4311);
const token = randomBytes(32).toString('hex');
const urlFile = process.env.LIFEMODE_APPROVAL_URL_FILE || join(tmpdir(), 'lifemode-editorial-approval.url');

function isAuthorized(request: IncomingMessage): boolean {
  const header = request.headers.authorization || '';
  return isApprovalAuthorizationValid(header, token);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>LifeMode Editorial Approval</title>
<style>
body{font:16px system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:2rem;background:#f6f7f5;color:#17211b}
h1{margin-bottom:.35rem}.muted{color:#5d6a61}.card{background:#fff;border:1px solid #d9e1da;border-radius:12px;padding:1.2rem;margin:1rem 0;box-shadow:0 2px 8px #17211b10}
pre{white-space:pre-wrap;background:#f2f5f2;padding:1rem;border-radius:8px;max-height:420px;overflow:auto}.article-preview{background:#f2f5f2;padding:1rem;border-radius:8px;max-height:680px;overflow:auto}.article-preview h1,.article-preview h2,.article-preview h3,.article-preview h4{margin:1.1rem 0 .45rem}.article-preview p{line-height:1.6;margin:.65rem 0}.article-preview ul,.article-preview ol{padding-left:1.4rem}.article-preview li{margin:.35rem 0}.article-preview table{border-collapse:collapse;width:100%;margin:1rem 0}.article-preview th,.article-preview td{border:1px solid #bbc9be;padding:.45rem;text-align:left}.sources li{margin:.35rem 0}
input,textarea{width:100%;box-sizing:border-box;padding:.65rem;border:1px solid #bbc9be;border-radius:6px;margin:.35rem 0 1rem;font:inherit}
textarea{min-height:75px}.actions{display:flex;gap:.6rem;flex-wrap:wrap}button{border:0;border-radius:7px;padding:.65rem 1rem;cursor:pointer;font-weight:600}button.approve{background:#177245;color:#fff}button.revise{background:#d9a441;color:#17211b}button.reject{background:#b93a3a;color:#fff}
.status{font-size:.85rem;font-weight:700;letter-spacing:.04em}.error{color:#a21d1d}.success{color:#177245}
</style></head><body><h1>LifeMode Editorial Approval</h1>
<p class="muted">Local-only review queue. Approval applies to one exact article version and does not publish automatically.</p>
<div id="app">Loading…</div>
<script>
const token=${JSON.stringify(token)};
const app=document.querySelector('#app');
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
async function api(path, options={}){const r=await fetch(path,{...options,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...(options.headers||{})}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d;}
function render(data){const items=data.items||[],p=data.progress;const summary='<section class="card"><b>Today:</b> '+esc(p.targetDate)+' · <b>Article target:</b> '+esc(p.dailyTarget)+' · <b>Weekly target:</b> '+esc(p.weeklyTarget)+'<br><span class="muted">Queue: '+esc(p.pending)+' pending · '+esc(p.approved)+' approved · '+esc(p.revisionRequested)+' revision requested · '+esc(p.rejected)+' rejected</span></section>';if(!items.length){app.innerHTML=summary+'<p class="muted">No approval queue items.</p>';return;}app.innerHTML=summary+items.map((i)=>{const a=i.publishingRequest.article,c=i.publishingRequest.context;const sources=(a.sources||[]).map(s=>'<li>'+esc(s.name)+' — '+(s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noreferrer">'+esc(s.url)+'</a>':'no URL')+'</li>').join('');const actions=i.status==='PENDING'?'<label>Revision or rejection notes<textarea class="feedback" placeholder="Required for revision requests; optional for rejection"></textarea></label><div class="actions"><button class="approve" data-action="approve">Approve version '+esc(i.version)+'</button><button class="revise" data-action="revise">Request revision</button><button class="reject" data-action="reject">Reject</button></div><p class="result"></p>':'<p class="muted">No action available for this final state.</p>';return '<article class="card" data-id="'+esc(i.id)+'"><div class="status">'+esc(i.status)+' · VERSION '+esc(i.version)+' · CONTENT HASH '+esc(i.contentHash)+'</div><h2>'+esc(a.title)+'</h2><p>'+esc(a.description)+'</p><p><b>Target:</b> '+esc(c.targetProject||'LifeMode')+' · <b>Reader problem:</b> '+esc(c.readerProblem||'Not recorded')+'</p><p><b>Research sources:</b></p><ul class="sources">'+sources+'</ul><details open><summary>Full article preview</summary><div class="article-preview">'+(i.articleHtml||'')+'</div></details>'+actions+'</article>'}).join('');document.querySelectorAll('button[data-action]').forEach((b)=>b.addEventListener('click',()=>act(b)));}
async function load(){try{render(await api('/api/overview'));}catch(e){app.innerHTML='<p class="error">'+esc(e.message)+'</p>';}}
async function act(button){const card=button.closest('.card'),result=card.querySelector('.result'),feedback=card.querySelector('.feedback')?.value||'',id=card.dataset.id;result.className='result';result.textContent='Working…';try{const item=(await api('/api/approvals')).find(i=>i.id===id);if(!item){result.className='result error';result.textContent='Item no longer exists.';return;}const data=await api('/api/approvals/'+encodeURIComponent(id)+'/action',{method:'POST',body:JSON.stringify({action:button.dataset.action,feedback,version:item.version})});if(data.reasons){result.className='result error';result.textContent=data.reasons.join(' ');}else{result.className='result success';result.textContent=button.dataset.action==='approve'?'Published successfully. Refreshing…':'Recorded. Refreshing…';setTimeout(load,500);}}catch(e){result.className='result error';result.textContent=e.message;}}
load();
</script></body></html>`;
}

async function readJson(request: IncomingMessage): Promise<any> {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 100_000) throw new Error('Request body is too large.');
  }
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (url.pathname === '/' && request.method === 'GET') {
      if (url.searchParams.get('token') !== token) {
        response.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
        response.end('Approval dashboard requires the private startup token.');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(dashboardHtml());
      return;
    }

    if (!url.pathname.startsWith('/api/') || !isAuthorized(request)) {
      sendJson(response, 401, { error: 'Unauthorized.' });
      return;
    }

    if (url.pathname === '/api/approvals' && request.method === 'GET') {
      sendJson(response, 200, await listApprovalQueue());
      return;
    }

    if (url.pathname === '/api/overview' && request.method === 'GET') {
      const items = (await listApprovalQueue()).map((item) => ({
        ...item,
        articleHtml: renderMarkdownToHtml(item.publishingRequest.article.content || ''),
      }));
      const counts = items.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {} as Record<string, number>);
      const plan = getEditorialDailyPlan();
      sendJson(response, 200, { items, progress: { targetDate: plan.targetDate, dailyTarget: plan.totalArticlesTarget, weeklyTarget: 21, pending: counts.PENDING || 0, approved: counts.APPROVED || 0, revisionRequested: counts.REVISION_REQUESTED || 0, rejected: counts.REJECTED || 0 } });
      return;
    }

    const match = url.pathname.match(/^\/api\/approvals\/([^/]+)\/action$/);
    if (match && request.method === 'POST') {
      const body = await readJson(request);
      const input = { version: Number(body.version), feedback: body.feedback ? String(body.feedback) : undefined };
      let result;
      if (body.action === 'approve') result = await approveEditorialQueueItem(decodeURIComponent(match[1]), input);
      else if (body.action === 'reject') result = await rejectEditorialQueueItem(decodeURIComponent(match[1]), input);
      else if (body.action === 'revise') result = await requestEditorialRevision(decodeURIComponent(match[1]), input, {
        generationProvider: new AIRouterGenerationProvider(defaultAIRouter),
        reviewProvider: new AIRouterReviewProvider(defaultAIRouter),
      });
      else throw new Error('Unknown approval action.');
      sendJson(response, result.reasons ? 422 : 200, result);
      return;
    }

    sendJson(response, 404, { error: 'Not found.' });
  } catch (error: any) {
    sendJson(response, 400, { error: error?.message || 'Request failed.' });
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}/?token=${token}`;
  writeFile(urlFile, url + '\n', 'utf8').catch((error) => console.error(`Could not write dashboard URL file: ${error?.message || error}`));
  console.log(`LifeMode Editorial Approval dashboard: ${url}`);
  console.log(`Startup URL saved to: ${urlFile}`);
  console.log('Bound to loopback only. Press Ctrl+C to stop.');
});
