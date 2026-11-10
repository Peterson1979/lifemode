import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { loadSocialConfig } from '../src/lib/social/config.ts';
import { CloudflareR2SocialAssetStorageProvider } from '../src/lib/social/images/storage/r2.ts';
import { hashOfferAsset, listOfferRecords, removeOffer, saveOffer } from '../src/lib/commerce/offer-store.ts';
import { publishOffers } from '../src/lib/commerce/offer-publisher.ts';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.LIFEMODE_STORE_PORT || 4313);
const token = randomBytes(32).toString('hex');
const urlFile = process.env.LIFEMODE_STORE_URL_FILE || join(tmpdir(), 'lifemode-daily-ideas-store.url');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function isAuthorized(request: IncomingMessage): boolean {
  return request.headers.authorization === `Bearer ${token}`;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

function dashboardHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>LifeMode Daily Ideas Store</title><style>
body{font:16px system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:2rem;background:#f6f7f5;color:#17211b}h1{margin-bottom:.35rem}.muted{color:#5d6a61}.card{background:#fff;border:1px solid #d9e1da;border-radius:12px;padding:1.2rem;margin:1rem 0;box-shadow:0 2px 8px #17211b10}input,textarea{width:100%;box-sizing:border-box;padding:.65rem;border:1px solid #bbc9be;border-radius:6px;margin:.35rem 0 1rem;font:inherit}textarea{min-height:70px}.actions{display:flex;gap:.6rem;flex-wrap:wrap}button{border:0;border-radius:7px;padding:.65rem 1rem;cursor:pointer;font-weight:600;background:#177245;color:#fff}button.secondary{background:#52665a}button.danger{background:#b93a3a}button.publish{background:#1d4ed8;color:#fff}button:disabled{opacity:.6;cursor:not-allowed}.offer{border-top:1px solid #d9e1da;padding:1rem 0}.offer:first-child{border-top:0}.status{font-size:.85rem;font-weight:700;letter-spacing:.04em}.error{color:#a21d1d}.success{color:#177245}small{color:#5d6a61}.preview{max-width:180px;max-height:140px;object-fit:contain;border-radius:8px;border:1px solid #d9e1da}.price-note{font-size:.9rem;color:#5d6a61}
</style></head><body><h1>LifeMode Daily Ideas Store</h1><p class="muted">Local-only offer management. These fields match the product information shown to visitors on Daily Ideas. Changes affect public output only after the normal site build/deployment process; they never approve or publish editorial content.</p><div id="app">Loading…</div><script>
const token=${JSON.stringify(token)},app=document.querySelector('#app');
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function renderPrivatePreview(button){const card=button.closest('.offer');if(!card||card.querySelector('.status')?.textContent?.trim()!=='DRAFT')return;const image=card.querySelector('img');const brand=card.querySelector('h3')?.textContent||'';const name=card.querySelector('strong')?.textContent||'';const paragraphs=[...card.querySelectorAll('p')];const description=paragraphs.find(p=>!p.querySelector('b')&&!p.classList.contains('price-note'))?.textContent||'';const editorial=paragraphs.find(p=>p.querySelector('b'))?.textContent?.replace(/^Why it&#39;s worth it:\s*/,'').replace(/^Why it's worth it:\s*/,'')||'';const destination=card.querySelector('a[href]');const price=card.querySelector('.price-note')?.textContent||'';const previewImage=image?'<div class="item-image-box"><img class="item-img" src="'+esc(image.getAttribute('src'))+'" alt="'+esc(name)+'"></div>':'';const previewPrice=price?'<div class="item-price"><span class="price-label">Typical Range</span><span class="price-val">'+esc(price.replace(/^Manual price note:\s*/,'').trim())+'</span></div>':'<div class="item-price"><span class="price-label">Curated</span><span class="price-val">Vetted Pick</span></div>';let root=document.querySelector('#private-preview');if(!root){root=document.createElement('div');root.id='private-preview';app.prepend(root);}root.innerHTML='<section class="private-preview-shell" aria-label="Private Daily Ideas draft preview"><div class="private-preview-card"><div class="private-preview-heading"><strong>Private draft preview</strong><button type="button" data-preview-close class="secondary">Close preview</button></div><p class="muted">This DRAFT is not active or published.</p><article class="daily-ideas-item">'+(brand?'<div class="item-header"><span class="item-brand">'+esc(brand)+'</span></div>':'')+previewImage+'<h2 class="item-name">'+esc(name)+'</h2><p class="item-desc">'+esc(description)+'</p><div class="item-editorial-box"><span class="editorial-box-label">Why Editors Recommend It:</span><p class="editorial-box-note">'+esc(editorial)+'</p></div><div class="item-footer">'+previewPrice+(destination?'<a class="btn-recommendation" href="'+esc(destination.getAttribute('href'))+'" target="_blank" rel="nofollow noopener sponsored">View recommendation</a>':'')+'</div></article></div></section>';root.scrollIntoView({behavior:'smooth',block:'start'});}
document.addEventListener('click',(event)=>{const target=event.target;if(!(target instanceof Element))return;const previewButton=target.closest('[data-preview]');if(previewButton){event.preventDefault();event.stopImmediatePropagation();renderPrivatePreview(previewButton);return;}const closeButton=target.closest('[data-preview-close]');if(closeButton){event.preventDefault();document.querySelector('#private-preview')?.remove();}},true);
async function api(path,options={}){const r=await fetch(path,{...options,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...(options.headers||{})}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d;}
function form(){return '<form id="offer-form" class="card"><h2>Create or edit recommendation</h2><input type="hidden" name="id"><label>Product name / brand label<input name="brand" placeholder="Product or brand label" required></label><label>Product title<input name="name" placeholder="What visitors will see as the title" required></label><label>Short description<textarea name="description" required></textarea></label><label>Why it&#39;s worth it<textarea name="editorialNote" required></textarea></label><label>Product image (JPEG, PNG, or WebP; max 5 MB)<input type="file" name="image" accept="image/jpeg,image/png,image/webp"><span id="image-preview"></span></label><label>Destination URL<input name="affiliateUrl" placeholder="https://example.com/recommendation" required></label><label>Optional manually entered price or range <span class="price-note">(not live-verified or monitored)</span><input name="priceRange" placeholder="e.g. $18–$24"></label><div class="actions"><button type="submit" name="state" value="DRAFT">Save draft</button><button type="submit" name="state" value="ACTIVE">Activate</button><button type="button" class="secondary" id="clear">Clear</button></div><p id="form-result"></p></form>';}
function preview(o){return;}
function publishingSection(){return '<section class="card"><h2>Publishing</h2><p class="muted">Saving or editing an offer updates local data only. Click <strong>Publish store updates</strong> to commit and push <code>data/commerce/offers.json</code> to origin/master and initiate the live Cloudflare Pages deployment.</p><div class="actions"><button type="button" id="publish-btn" class="publish">Publish store updates</button></div><p id="publish-result"></p></section>';}
function render(data){app.innerHTML=form()+publishingSection()+'<section class="card"><h2>Offers</h2><p class="muted">'+(data.storageConfigured?'R2 image uploads are configured on the server.':'R2 image uploads are not configured; image URLs already stored remain available.')+'</p><div id="offers">'+(data.offers.length?data.offers.map(o=>'<article class="offer"><div class="status">'+esc(o.state)+'</div>'+(o.imageUrl?'<img class="preview" src="'+esc(o.imageUrl)+'" alt="">':'')+'<h3>'+esc(o.brand||'')+'</h3><strong>'+esc(o.name)+'</strong><p>'+esc(o.description)+'</p><p><b>Why it&#39;s worth it:</b> '+esc(o.editorialNote)+'</p><p><b>Destination URL:</b> <a href="'+esc(o.affiliateUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(o.affiliateUrl)+'</a></p>'+(o.priceRange?'<p class="price-note">Manual price note: '+esc(o.priceRange)+'</p>':'')+'<div class="actions">'+(o.state==='DRAFT'?'<button data-preview="'+esc(o.id)+'" class="secondary">Preview</button>':'')+'<button data-edit="'+esc(o.id)+'" class="secondary">Edit</button>'+(o.state==='ACTIVE'?'<button data-state="INACTIVE" data-id="'+esc(o.id)+'" class="secondary">Deactivate</button>':'<button data-state="ACTIVE" data-id="'+esc(o.id)+'">Activate</button>')+'<button data-delete="'+esc(o.id)+'" class="danger">Delete</button></div></article>').join(''):'<p class="muted">No managed offers yet. The public site uses its verified catalog until the first managed save.</p>')+'</div></section>';const f=document.querySelector('#offer-form');f.addEventListener('submit',save);document.querySelector('#clear').addEventListener('click',clearForm);document.querySelector('#publish-btn')?.addEventListener('click',publish);document.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',()=>preview(data.offers.find(o=>o.id===b.dataset.preview))));document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>edit(data.offers.find(o=>o.id===b.dataset.edit))));document.querySelectorAll('[data-state]').forEach(b=>b.addEventListener('click',()=>changeState(b.dataset.id,b.dataset.state)));document.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>remove(b.dataset.delete)));}
function clearForm(){const f=document.querySelector('#offer-form');f.reset();f.elements.namedItem('id').value='';document.querySelector('#image-preview').textContent='';}
function edit(o){const f=document.querySelector('#offer-form');['id','brand','name','description','editorialNote','affiliateUrl','priceRange'].forEach(k=>{const el=f.elements.namedItem(k);if(el)el.value=o?.[k]??'';});document.querySelector('#image-preview').innerHTML=o?.imageUrl?'<br><img class="preview" src="'+esc(o.imageUrl)+'" alt="Current product image">':'';window.scrollTo({top:0,behavior:'smooth'});}
async function fileData(file){if(!file)return undefined;if(file.size>5242880)throw new Error('Image exceeds 5 MB.');return {mimeType:file.type,data:await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);})};}
function isHttpUrl(value){try{const parsed=new URL(String(value||'').trim());return parsed.protocol==='http:'||parsed.protocol==='https:';}catch{return false;}}
async function save(e){e.preventDefault();const f=e.currentTarget,result=document.querySelector('#form-result'),offer=Object.fromEntries(new FormData(f).entries());offer.state=e.submitter.value;delete offer.image;if(!isHttpUrl(offer.affiliateUrl)){result.className='error';result.textContent='Enter a valid absolute HTTP or HTTPS destination URL.';return;}try{const imageData=await fileData(f.elements.namedItem('image').files[0]);await api('/api/offers',{method:'POST',body:JSON.stringify({offer,imageData})});result.className='success';result.textContent='Saved.';await load();}catch(err){result.className='error';result.textContent=err.message;}}
async function changeState(id,state){try{await api('/api/offers',{method:'POST',body:JSON.stringify({offer:{id,state}})});await load();}catch(err){alert(err.message);}}
async function remove(id){if(!confirm('Delete this managed offer?'))return;try{await api('/api/offers/'+encodeURIComponent(id),{method:'DELETE'});await load();}catch(err){alert(err.message);}}
async function publish(){const btn=document.querySelector('#publish-btn');const result=document.querySelector('#publish-result');if(!confirm('Publish all active offers to the live website? This will push data/commerce/offers.json to origin/master and initiate Cloudflare Pages deployment.'))return;if(btn)btn.disabled=true;if(result){result.className='muted';result.textContent='Publishing to origin/master and initiating deployment…';}try{const res=await api('/api/publish',{method:'POST'});if(result){result.className=res.status==='no-changes'?'muted':'success';result.textContent=res.message;}await load();}catch(err){if(result){result.className='error';result.textContent='Publish failed: '+(err?.message||'Request failed.');}}finally{if(btn)btn.disabled=false;}}
async function load(){try{const data=await api('/api/offers');if(!data||!Array.isArray(data.offers))throw new Error('Offer list response was invalid.');render(data);}catch(err){app.innerHTML='<section class="card"><p class="error">Could not load Daily Ideas offers: '+esc(err?.message||'Request failed.')+'</p><p class="muted">The local dashboard is still available; try refreshing once the server is ready.</p></section>';}}load();
</script></body></html>`;
}

async function readJson(request: IncomingMessage): Promise<any> {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 8_000_000) throw new Error('Request body is too large.');
  }
  return JSON.parse(body || '{}');
}

async function uploadImage(offer: any, imageData: any): Promise<string | undefined> {
  if (!imageData) return offer.imageUrl;
  if (!IMAGE_TYPES.has(imageData.mimeType) || typeof imageData.data !== 'string' || !imageData.data.startsWith(`data:${imageData.mimeType};base64,`)) throw new Error('Image must be JPEG, PNG, or WebP.');
  const buffer = Buffer.from(imageData.data.slice(imageData.data.indexOf(',') + 1), 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image exceeds 5 MB.');
  const storage = new CloudflareR2SocialAssetStorageProvider();
  if (!storage.isConfigured()) throw new Error('R2 image upload is not configured. Add server-side R2 credentials before uploading images.');
  const assetHash = hashOfferAsset(buffer);
  const result = await storage.uploadAsset({ topicId: offer.id || offer.name || 'offer', pillar: 'home', assetHash, buffer, mimeType: imageData.mimeType, format: '1080x1350', customKey: `commerce/${offer.id || 'new'}/${assetHash.slice(0, 16)}.${imageData.mimeType.split('/')[1].replace('jpeg', 'jpg')}` });
  if (!result.success || !result.publicUrl) throw new Error(result.error || 'R2 upload failed.');
  return result.publicUrl;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${host}:${port}`);
    if (url.pathname === '/' && request.method === 'GET') {
      if (url.searchParams.get('token') !== token) { response.writeHead(401, { 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' }); response.end('Store dashboard requires the private startup token.'); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(dashboardHtml()); return;
    }
    if (!isAuthorized(request)) { sendJson(response, 401, { error: 'Unauthorized.' }); return; }
    if (url.pathname === '/api/offers' && request.method === 'GET') { sendJson(response, 200, { offers: await listOfferRecords(), storageConfigured: loadSocialConfig().storageConfig.configured }); return; }
    if (url.pathname === '/api/offers' && request.method === 'POST') { const body = await readJson(request); const offer = body.offer || {}; if (body.imageData) offer.imageUrl = await uploadImage(offer, body.imageData); sendJson(response, 200, await saveOffer(offer)); return; }
    if (url.pathname === '/api/publish' && request.method === 'POST') { const result = await publishOffers({ repoRoot: projectRoot }); sendJson(response, 200, result); return; }
    const match = url.pathname.match(/^\/api\/offers\/([^/]+)$/);
    if (match && request.method === 'DELETE') { await removeOffer(decodeURIComponent(match[1])); sendJson(response, 200, { ok: true }); return; }
    sendJson(response, 404, { error: 'Not found.' });
  } catch (error: any) { sendJson(response, 400, { error: error?.message || 'Request failed.' }); }
});

server.listen(port, host, async () => {
  const url = `http://${host}:${port}/?token=${token}`;
  await writeFile(urlFile, url + '\n', 'utf8');
  console.log(`LifeMode Daily Ideas Store dashboard: ${url}`);
  console.log(`Startup URL saved to ${urlFile}`);
  console.log('Bound to loopback only. Press Ctrl+C to stop.');
});
