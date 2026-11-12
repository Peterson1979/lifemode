import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import http from 'node:http';

function makeRequest(
  port: number,
  path: string,
  method: string,
  payload: any,
  headers: Record<string, string>
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = payload ? JSON.stringify(payload) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(data ? { 'Content-Length': Buffer.byteLength(data), 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode || 500, body });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('Editorial Operations Affiliate API endpoints and URL Quick Add integration', async () => {
  const projectRoot = process.cwd();
  const port = 4337;
  const urlFile = join(projectRoot, 'logs', 'test-editorial-affiliates.url');

  const env = {
    ...process.env,
    LIFEMODE_APPROVAL_PORT: String(port),
    LIFEMODE_APPROVAL_URL_FILE: urlFile,
  };

  const child = spawn('node', ['--experimental-strip-types', 'scripts/editorial-approval-dashboard.ts'], {
    cwd: projectRoot,
    env,
    stdio: 'ignore',
  });

  try {
    // Wait for server to write startup URL file
    let token = '';
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const content = await readFile(urlFile, 'utf8');
        const match = content.match(/token=([a-f0-9]+)/);
        if (match) {
          token = match[1];
          break;
        }
      } catch {}
    }

    assert.ok(token, 'Server must write startup token to URL file');
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 1. Overview includes affiliatesCount
    const overviewRes = await makeRequest(port, '/api/overview', 'GET', null, authHeaders);
    assert.equal(overviewRes.status, 200);
    assert.equal(typeof overviewRes.body.affiliatesCount, 'number');
    assert.ok(overviewRes.body.affiliatesCount >= 30);

    // 2. GET /api/affiliates lists catalog offers
    const listRes = await makeRequest(port, '/api/affiliates', 'GET', null, authHeaders);
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body));
    assert.ok(listRes.body.length >= 30);

    // 3. POST /api/affiliates/quick-add creates a draft offer from a URL alone
    const testUrl = 'https://creator.store/collections/gear?ref=lifemode_editorial&campaign=v1#featured';
    const quickAddRes = await makeRequest(port, '/api/affiliates/quick-add', 'POST', { affiliateUrl: testUrl, offerType: 'digital' }, authHeaders);
    assert.equal(quickAddRes.status, 200);
    assert.equal(quickAddRes.body.offer.affiliateUrl, testUrl, 'Exact affiliate tracking URL must be preserved byte-for-byte');
    assert.equal(quickAddRes.body.offer.status, 'DRAFT');
    assert.equal(quickAddRes.body.offer.offerType, 'digital');
    assert.equal(quickAddRes.body.offer.eligibleForStore, false);
    assert.equal(quickAddRes.body.offer.eligibleForGuides, true);
    const createdId = quickAddRes.body.offer.id;

    // 4. POST /api/affiliates updates the offer with multi-image and destination flags
    const updateRes = await makeRequest(
      port,
      '/api/affiliates',
      'POST',
      {
        offer: {
          id: createdId,
          title: 'Creator Digital Gear Bundle',
          affiliateUrl: testUrl,
          brand: 'Creator Studio',
          merchant: 'creator.store',
          offerType: 'digital',
          status: 'ACTIVE',
          eligibleForStore: false,
          eligibleForPicks: true,
          eligibleForGuides: true,
          images: [
            { url: 'https://example.com/gallery.jpg', displayOrder: 2 },
            { url: 'https://example.com/hero.jpg', isPrimary: true, displayOrder: 1 },
          ],
        },
      },
      authHeaders
    );
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.offer.imageUrl, 'https://example.com/hero.jpg');
    assert.equal(updateRes.body.offer.title, 'Creator Digital Gear Bundle');

    // 5. GET /api/affiliates/:id retrieves single offer
    const getSingle = await makeRequest(port, `/api/affiliates/${encodeURIComponent(createdId)}`, 'GET', null, authHeaders);
    assert.equal(getSingle.status, 200);
    assert.equal(getSingle.body.id, createdId);
    assert.equal(getSingle.body.affiliateUrl, testUrl);

    // 6. DELETE /api/affiliates/:id cleans up test offer
    const deleteRes = await makeRequest(port, `/api/affiliates/${encodeURIComponent(createdId)}`, 'DELETE', null, authHeaders);
    assert.equal(deleteRes.status, 200);

    // 7. Verify it is gone
    const getAfterDelete = await makeRequest(port, `/api/affiliates/${encodeURIComponent(createdId)}`, 'GET', null, authHeaders);
    assert.equal(getAfterDelete.status, 404);
  } finally {
    child.kill('SIGKILL');
    await unlink(urlFile).catch(() => {});
  }
});

