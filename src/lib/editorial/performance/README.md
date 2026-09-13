# LifeMode Post-Publication Performance Feedback V1

This module provides an offline, deterministic, and provider-independent post-publication feedback engine for LifeMode editorial automation.

---

## 1. What Performance Feedback V1 Measures

Performance Feedback V1 tracks and evaluates performance records for published articles using standardized, normalized dimensions:

| Metric Dimension | Benchmark Baseline | Normalization Function | Typical Weight |
| :--- | :--- | :--- | :--- |
| **`views`** | 100 views (median) | Logarithmic scaling ($50 + 25 \log_{10}(\text{views}/100)$) | 20% |
| **`clicks`** | 20 clicks | Logarithmic scaling ($50 + 25 \log_{10}(\text{clicks}/20)$) | 15% |
| **`ctr`** | 2.5% CTR | Log-linear scaling ($30 + 15 \log_{2}(\text{ctrPct})$) | 15% |
| **`engagement`** | 50 (index 0–100) | Clamped linear index (duration / scroll depth) | 20% |
| **`conversions`** | 1 action (newsletter/save) | Logarithmic scaling ($55 + 20 \log_{10}(\text{conversions})$) | 15% |
| **`affiliateClicks`** | 2 click-outs | Logarithmic scaling ($50 + 22 \log_{10}(\text{affiliateClicks})$) | 10% |
| **`socialInteractions`** | 5 shares/pins | Logarithmic scaling ($50 + 20 \log_{10}(\text{social}/5)$) | 5% |

### Key Properties:
- **Partial Data Tolerance**: Missing metric channels are **never** treated as zero performance. Only measured dimensions are weighted and normalized.
- **Logarithmic Dampening**: Prevents single viral outlier articles or spikes from distorting future candidate ranking.
- **Bounded Overall Score**: Generates a clean $0–100$ score with full diagnostic explainability (`PerformanceScoreBreakdown`).

---

## 2. What V1 Intentionally Does Not Measure Yet

- **No External Network Connectors**: V1 does not make live API requests to Google Analytics 4, Google Search Console, Pinterest Analytics, or Meta Graph API.
- **No Paid Analytics Platforms**: No third-party SaaS monitoring tools are required.
- **No Client-Side Tracking Scripts**: Relies purely on backend-ingested historical performance records.

---

## 3. How External Analytics Providers Can Be Added Later

The system defines a clean, decoupled provider interface:

```typescript
export interface IPerformanceProvider {
  readonly providerId: string;
  fetchArticlePerformance(slug: string): Promise<ArticlePerformanceRecord | null>;
  fetchBatchPerformance(slugs: string[]): Promise<ArticlePerformanceRecord[]>;
  recordPerformance(record: ArticlePerformanceRecord): Promise<void>;
}
```

Future providers (e.g., `GA4PerformanceProvider`, `GSCPerformanceProvider`, `InternalAnalyticsProvider`) can implement this interface to fetch external data and sync it directly to `IPerformanceStore` (`FilesystemPerformanceStore`) without changing any scoring or feedback logic.

---

## 4. How Feedback Affects Editorial Topic Ranking

Feedback signals are aggregated across pillars, formats, search intents, and topical tags with strict statistical guardrails:

1. **Conservative Minimum Sample Size**:
   - $n \ge 3$ articles for pillars, formats, and search intents.
   - $n \ge 2$ articles for specific topic tags.
   - Categories with $n < \text{minSample}$ receive status `INSUFFICIENT_DATA` and produce **zero** modifier.
2. **Bounded Score Modifier**:
   - High-performing categories ($\text{avg} \ge 75$) produce a positive ranking boost (up to $+10$ points).
   - Under-performing categories ($\text{avg} \le 45$) produce a modest penalty (up to $-8$ points).
3. **Safety & Quality Precedence**:
   - Performance feedback is purely an additive ranking factor.
   - It **never** bypasses minimum editorial quality thresholds (raw score $<60$ remains rejected, raw score $<80$ remains deferred).
   - It **never** overrides safety, risk, or evidence constraints.
