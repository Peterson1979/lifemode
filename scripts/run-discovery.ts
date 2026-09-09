import { runDiscoveryPipeline } from '../src/lib/editorial/discovery/runner.ts';

async function main() {
  console.log('====================================================');
  console.log(' LifeMode Content Discovery V1 Pipeline Execution   ');
  console.log('====================================================\n');

  const report = await runDiscoveryPipeline();

  console.log(`Pipeline Executed At: ${report.timestamp}`);
  console.log('\n--- Provider Status ---');
  for (const provider of report.providerResults) {
    const statusLabel =
      provider.status === 'AVAILABLE'
        ? '✓ AVAILABLE'
        : `⚠ ${provider.status}`;
    console.log(`* ${provider.provider} (${provider.sourceType}): ${statusLabel}`);
    if (provider.error) {
      console.log(`  └─ Note: ${provider.error}`);
    }
  }

  console.log('\n--- Ingestion Metrics ---');
  console.log(`* Total Signals Received:   ${report.totalSignalsReceived}`);
  console.log(`* Total Signals Normalized: ${report.normalizedCount}`);
  console.log(`* Duplicate Signals Filtered: ${report.duplicateCount}`);
  console.log(`* New Candidates Stored:    ${report.newCandidatesStored}`);
  console.log(`* Total Candidates in Pool: ${report.candidatesSummary.length}`);

  console.log('\n--- Current Candidates Pool ---');
  for (const [index, candidate] of report.candidatesSummary.entries()) {
    console.log(
      `${index + 1}. [${candidate.pillar.toUpperCase()}] ${candidate.canonicalTopic}`
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
