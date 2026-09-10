import { runDiscoveryPipeline } from '../src/lib/editorial/discovery/runner.ts';

async function main() {
  console.log('====================================================');
  console.log(' LifeMode Content Discovery V2 Pipeline Execution   ');
  console.log('====================================================\n');

  const report = await runDiscoveryPipeline();

  console.log(`Pipeline Executed At: ${report.timestamp}`);
  console.log('\n--- Provider Status & Signal Ingestion ---');
  for (const provider of report.providerResults) {
    const statusLabel =
      provider.status === 'AVAILABLE'
        ? `✓ AVAILABLE (${provider.signals.length} signals)`
        : `⚠ ${provider.status}`;
    const classification = provider.classification || 'UNKNOWN';
    console.log(`* ${provider.provider} [${classification}]: ${statusLabel}`);
    if (provider.error) {
      console.log(`  └─ Note: ${provider.error}`);
    }
  }

  console.log('\n--- Signal Origin Breakdown ---');
  console.log(`* Real Live External Signals:      ${report.realExternalSignalsCount}`);
  console.log(`* Static / Deterministic Signals:  ${report.staticDeterministicSignalsCount}`);
  console.log(`* Fixture Signals:                 ${report.fixtureSignalsCount}`);
  console.log(`* Total Ingested Signals:          ${report.totalSignalsReceived}`);

  console.log('\n--- Ingestion & Candidate Metrics ---');
  console.log(`* Total Signals Normalized:        ${report.normalizedCount}`);
  console.log(`* Duplicate Signals Filtered:      ${report.duplicateCount}`);
  console.log(`* New Candidates Stored:           ${report.newCandidatesStored}`);
  console.log(`* Candidates Updated / Corroborated: ${report.updatedCandidatesCount}`);
  console.log(`* Total Candidates in Pool:        ${report.candidatesSummary.length}`);

  console.log('\n--- Current Candidates Pool (Top 10) ---');
  const topCandidates = report.candidatesSummary.slice(0, 10);
  for (const [index, candidate] of topCandidates.entries()) {
    const originTag = candidate.originClassification ? ` [${candidate.originClassification}]` : '';
    console.log(
      `${index + 1}. [${candidate.pillar.toUpperCase()}] ${candidate.canonicalTopic}${originTag}`
    );
    console.log(
      `   Score: ${candidate.totalScore}/100 | Tier: ${candidate.priorityTier} | Opportunity: ${candidate.opportunityType}${
        candidate.pinterestScore ? ` | PinScore: ${candidate.pinterestScore}` : ''
      }`
    );
  }

  console.log('\n====================================================');
  console.log(' Discovery Run Complete — candidates.json updated  ');
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Fatal Discovery Error:', err);
  process.exit(1);
});
