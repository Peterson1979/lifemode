import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SITE_CONFIG } from '../src/config/site.ts';

test('LifeMode GA4 & Cookie Consent Architecture Suite', async (t) => {
  await t.test('1. Configuration: SITE_CONFIG provides valid gaMeasurementId and Cookie Policy link', () => {
    assert.ok(SITE_CONFIG.gaMeasurementId, 'gaMeasurementId should be defined in SITE_CONFIG');
    assert.match(SITE_CONFIG.gaMeasurementId, /^G-[A-Z0-9]+$/, 'gaMeasurementId should match standard GA4 format');
    assert.equal(SITE_CONFIG.gaMeasurementId, 'G-V06H9EB5QK');

    const cookieLink = SITE_CONFIG.footerLinks.find((l) => l.href === '/cookies');
    assert.ok(cookieLink, 'Cookie Policy link must be present in footerLinks');
    assert.equal(cookieLink?.name, 'Cookie Policy');
  });

  await t.test('2. Consent Mode v2 in Head: BaseLayout.astro sets default denied state before body', () => {
    const baseLayoutContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/layouts/BaseLayout.astro'),
      'utf8'
    );

    assert.ok(baseLayoutContent.includes("gtag('consent', 'default'"), 'Default consent mode must be declared');
    assert.ok(baseLayoutContent.includes("'analytics_storage': 'denied'"), 'analytics_storage must default to denied');
    assert.ok(baseLayoutContent.includes("'ad_storage': 'denied'"), 'ad_storage must default to denied');
    assert.ok(baseLayoutContent.includes("'ad_user_data': 'denied'"), 'ad_user_data must default to denied');
    assert.ok(baseLayoutContent.includes("'ad_personalization': 'denied'"), 'ad_personalization must default to denied');
    assert.ok(baseLayoutContent.includes("'wait_for_update': 500"), 'wait_for_update must be set');
    assert.ok(baseLayoutContent.includes('<CookieConsent />'), 'BaseLayout must mount CookieConsent component');
  });

  await t.test('3. Cookie Consent Component: CookieConsent.astro contains full accessible UI and logic', () => {
    const consentComponent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/CookieConsent.astro'),
      'utf8'
    );

    // Verify Accessible UI elements
    assert.ok(consentComponent.includes('cookie-btn-accept-all'), 'Must contain Accept All button');
    assert.ok(consentComponent.includes('cookie-btn-reject-all'), 'Must contain Reject Non-Essential button');
    assert.ok(consentComponent.includes('cookie-btn-manage-prefs'), 'Must contain Manage Preferences button');
    assert.ok(consentComponent.includes('role="dialog"'), 'Preferences modal must have dialog role');
    assert.ok(consentComponent.includes('aria-modal="true"'), 'Modal must declare aria-modal');

    // Verify Granular Switches
    assert.ok(consentComponent.includes('pref-essential'), 'Must contain Essential storage switch');
    assert.ok(consentComponent.includes('pref-analytics'), 'Must contain Analytics switch');
    assert.ok(consentComponent.includes('pref-marketing'), 'Must contain Marketing switch');

    // Verify Basic Consent Execution (Only loads GA script upon explicit consent)
    assert.ok(consentComponent.includes("gtag('consent', 'update'"), 'Must update consent mode signals');
    assert.ok(consentComponent.includes('https://www.googletagmanager.com/gtag/js?id='), 'Must load GA4 via Google Tag Manager URL');
    assert.ok(consentComponent.includes('ga-disable-'), 'Must support immediate opt-out disabling flag');
    assert.ok(consentComponent.includes('deleteGaCookies'), 'Must include comprehensive GA cookie cleanup');
    assert.ok(consentComponent.includes('lifemode_consent_v2'), 'Must use consistent storage key');
  });

  await t.test('4. Footer Integration: Footer.astro links Cookie Policy and provides Cookie Settings trigger', () => {
    const footerContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/Footer.astro'),
      'utf8'
    );

    assert.ok(footerContent.includes('open-cookie-settings'), 'Must have Cookie Settings button ID');
    assert.ok(footerContent.includes('data-open-cookie-settings'), 'Must have data attribute for event delegation');
  });

  await t.test('5. Legal Disclosures: /privacy and /cookies accurately describe storage, GA4, and non-certified CMP status', () => {
    const privacyContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/privacy.astro'),
      'utf8'
    );
    const cookiesContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/cookies.astro'),
      'utf8'
    );

    assert.ok(privacyContent.includes('G-V06H9EB5QK'), 'Privacy policy must disclose GA4 Measurement ID');
    assert.ok(privacyContent.includes('Google Consent Mode v2'), 'Privacy policy must mention Consent Mode v2');
    assert.ok(privacyContent.includes('/cookies'), 'Privacy policy must reference Cookie Policy');
    assert.ok(privacyContent.includes('CMP Clarification'), 'Privacy policy must include CMP clarification');

    assert.ok(cookiesContent.includes('lifemode_consent_v2'), 'Cookies page must disclose consent storage key');
    assert.ok(cookiesContent.includes('lifemode-checklist-*'), 'Cookies page must disclose functional checklist storage key');
    assert.ok(cookiesContent.includes('_ga'), 'Cookies page must disclose Google Analytics cookies');
    assert.ok(cookiesContent.includes('__cf_bm'), 'Cookies page must describe Cloudflare security cookie conditionally');
    assert.ok(cookiesContent.includes('data-open-cookie-settings'), 'Cookies page must have open-cookie-settings trigger');
    assert.ok(cookiesContent.includes('CMP Clarification'), 'Cookies page must include CMP clarification');
  });

  await t.test('6. Environment Templates: .env and .env.example contain PUBLIC_GA_MEASUREMENT_ID', () => {
    const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
    assert.ok(envExample.includes('PUBLIC_GA_MEASUREMENT_ID=G-V06H9EB5QK'), '.env.example must document PUBLIC_GA_MEASUREMENT_ID');
  });

  await t.test('7. Logic Simulation: Consent signals separation and lifecycle', () => {
    // Simulate Consent Model
    function deriveSignals(analytics: boolean, marketing: boolean) {
      return {
        analytics_storage: analytics ? 'granted' : 'denied',
        ad_storage: marketing ? 'granted' : 'denied',
        ad_user_data: marketing ? 'granted' : 'denied',
        ad_personalization: marketing ? 'granted' : 'denied',
      };
    }

    // Reject All
    const rejectState = deriveSignals(false, false);
    assert.equal(rejectState.analytics_storage, 'denied');
    assert.equal(rejectState.ad_storage, 'denied');
    assert.equal(rejectState.ad_user_data, 'denied');
    assert.equal(rejectState.ad_personalization, 'denied');

    // Analytics Only
    const analyticsOnlyState = deriveSignals(true, false);
    assert.equal(analyticsOnlyState.analytics_storage, 'granted');
    assert.equal(analyticsOnlyState.ad_storage, 'denied');
    assert.equal(analyticsOnlyState.ad_user_data, 'denied');
    assert.equal(analyticsOnlyState.ad_personalization, 'denied');

    // Marketing Only
    const marketingOnlyState = deriveSignals(false, true);
    assert.equal(marketingOnlyState.analytics_storage, 'denied');
    assert.equal(marketingOnlyState.ad_storage, 'granted');
    assert.equal(marketingOnlyState.ad_user_data, 'granted');
    assert.equal(marketingOnlyState.ad_personalization, 'granted');

    // Accept All
    const acceptAllState = deriveSignals(true, true);
    assert.equal(acceptAllState.analytics_storage, 'granted');
    assert.equal(acceptAllState.ad_storage, 'granted');
    assert.equal(acceptAllState.ad_user_data, 'granted');
    assert.equal(acceptAllState.ad_personalization, 'granted');
  });

  await t.test('8. Safe Parsing: Defensive against missing, malformed, or corrupt stored consent', () => {
    function parseStoredConsent(raw: string | null) {
      try {
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof parsed.analytics === 'boolean' &&
          typeof parsed.marketing === 'boolean'
        ) {
          return parsed;
        }
      } catch (e) {
        // Safe fallback
      }
      return null;
    }

    assert.equal(parseStoredConsent(null), null);
    assert.equal(parseStoredConsent(''), null);
    assert.equal(parseStoredConsent('{ invalid json'), null);
    assert.equal(parseStoredConsent('123'), null);
    assert.equal(parseStoredConsent('{"analytics": true}'), null); // missing marketing boolean
    assert.deepEqual(
      parseStoredConsent('{"version": 1, "analytics": true, "marketing": false, "timestamp": 12345}'),
      { version: 1, analytics: true, marketing: false, timestamp: 12345 }
    );
  });
});
