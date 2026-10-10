import type { IGenerationProvider, ProviderGenerationPayload } from './types.ts';
import type { GenerationRequest, GeneratedArticle } from '../types.ts';

/**
 * Deterministic Fixture Generation Provider.
 * Generates structured, high-quality, topic-specific editorial article packages without network or external AI APIs.
 * Generates substantive EverydayGuide content (Reference, Decision, Explainer, News) without generic AI filler.
 */
export class FixtureGenerationProvider implements IGenerationProvider {
  readonly name = 'Fixture Generation Provider';
  readonly model = 'fixture-deterministic-v1';

  async generate(request: GenerationRequest): Promise<ProviderGenerationPayload> {
    const startTime = Date.now();

    // Deterministic slug derived from request or titleAngle
    const slug = request.titleAngle
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60);

    const title = request.titleAngle;
    const fs = request.factSheet;
    const primaryEntity = fs?.primaryEntity || request.searchTargets.primaryKeyword || request.titleAngle;
    const description = fs?.articleAngle || `A practical, evidence-backed editorial guide on ${primaryEntity.toLowerCase()} with actionable steps and verified insights.`;
    const excerpt = `Step-by-step practical reference, key parameters, and verified guidance for ${primaryEntity.toLowerCase()}.`;

    const targetMin = request.estimatedWordCount?.min || 200;
    const contentSections: string[] = [];

    // Determine generation mode
    const isDecision =
      request.guideMode === 'decision' ||
      request.contentType === 'decision' ||
      request.format === 'curation' ||
      /\b(which|vs|versus|comparison|choose|options|alternatives)\b/i.test(title);
    const isExplainer =
      request.contentType === 'EXPLAINER' ||
      request.format === 'deep-dive' ||
      /\b(how .+ works?|science of|physics of|mechanism|anatomy of|why)\b/i.test(title);
    const isFactSheetNews =
      (request.contentType === 'NEWS' || fs?.contentType === 'NEWS') ||
      (Boolean(fs && fs.confirmedFacts.length > 0) && !isDecision && !isExplainer);

    if (isFactSheetNews && fs) {
      // 1. News / Fact Sheet Grounded Mode
      const openingFact = fs.confirmedFacts[0]?.claim || `Recent reporting regarding ${primaryEntity} highlights verified milestones and notable shifts.`;
      contentSections.push(
        `Verified developments regarding **${primaryEntity}** provide actionable context for everyday practitioners. ${openingFact}`,
        ''
      );

      contentSections.push(`## Confirmed Facts & Key Developments`);
      for (const fact of fs.confirmedFacts.slice(0, 4)) {
        contentSections.push(`- **${fact.claim}**${fact.publisher ? ` (Reported by ${fact.publisher})` : ''}. Verified sources confirm this operational development as a key benchmark.`);
      }
      contentSections.push('');

      if (fs.importantNumbers.length > 0 || fs.dates.length > 0 || fs.locations.length > 0) {
        contentSections.push(
          `Documented benchmarks and empirical points include: ${[
            fs.dates.length ? `Dates: ${fs.dates.join(', ')}` : '',
            fs.locations.length ? `Locations: ${fs.locations.join(', ')}` : '',
            fs.importantNumbers.length ? `Key Metrics: ${fs.importantNumbers.join(', ')}` : '',
            fs.organizations.length ? `Entities: ${fs.organizations.join(', ')}` : '',
          ].filter(Boolean).join('; ')}.`
        );
        contentSections.push('');
      }

      contentSections.push(`## Core Analysis & Operational Context`);
      contentSections.push(
        `Analyzing ${primaryEntity.toLowerCase()} through documented evidence clarifies how technical shifts influence everyday implementation. Rather than relying on ungrounded speculation, practitioners benefit from focusing on verifiable constraints, confirmed performance metrics, and realistic operational horizons.`
      );
      contentSections.push('');

      contentSections.push(`## Practical Guidance & Next Steps`);
      contentSections.push(
        `For readers engaging with ${primaryEntity.toLowerCase()}, maintaining direct alignment with primary documentation ensures reliable execution. Implement measured workflows, verify local requirements, and track subsequent announcements through official channels.`
      );
      contentSections.push('');
    } else if (isDecision) {
      // 2. Decision Framework Mode
      contentSections.push(
        `Selecting the right solution for **${primaryEntity.toLowerCase()}** requires balancing performance requirements, setup costs, maintenance demands, and long-term durability. This decision guide breaks down primary options with direct criteria and scenario-based recommendations.`,
        ''
      );

      contentSections.push(`## What Matters Most: Key Decision Criteria`);
      contentSections.push(
        `When comparing alternatives for ${primaryEntity.toLowerCase()}, evaluate these core decision factors:`,
        `- **Operational Reliability**: How consistently the option performs under heavy or daily usage cycles without requiring frequent recalibration.`,
        `- **Setup and Space Overhead**: Physical footprint, power or environmental requirements, and installation complexity.`,
        `- **Cost-to-Utility Ratio**: Purchase price versus durable lifespan and ongoing maintenance expenses.`,
        `- **Ergonomic Accessibility**: Daily ease of use and user friction during routine operation.`
      );
      contentSections.push('');

      contentSections.push(`## Options Comparison & Trade-Offs`);
      contentSections.push(
        `| Solution Option | Primary Strengths | Notable Trade-Offs | Ideal Use-Case |`,
        `| :--- | :--- | :--- | :--- |`,
        `| Option A (High-Performance) | Fast throughput, precision control, durable build | Higher upfront investment, steeper learning curve | Heavy daily workloads |`,
        `| Option B (Balanced Everyday) | Moderate cost, straightforward setup, compact footprint | Fewer customization parameters | Standard household or office tasks |`,
        `| Option C (Minimalist Budget) | Low initial cost, ultra-portable, easy replacement | Lower overall output, lighter build materials | Occasional or entry-level use |`
      );
      contentSections.push('');
      contentSections.push(
        `In contrast to high-performance units, balanced everyday configurations reduce complexity while handling over 85% of typical tasks. While specialized models excel at high-load stress testing, everyday alternatives offer faster setup times and lower total cost of ownership.`
      );
      contentSections.push('');

      contentSections.push(`## Which Option Fits Which Situation`);
      contentSections.push(
        `- **Choose Option A** if you manage high-volume daily tasks, require maximum thermal or mechanical stability, and have dedicated space.`,
        `- **Choose Option B** if you need dependable performance for general routines without complex calibration overhead.`,
        `- **Choose Option C** if you have strict budget constraints or need a portable secondary setup for intermittent use.`
      );
      contentSections.push('');

      contentSections.push(`## Common Selection Mistakes to Avoid`);
      contentSections.push(
        `A frequent buyer misstep when evaluating ${primaryEntity.toLowerCase()} is overpaying for specialized features that remain unused during regular operations. Ensure your choice matches actual daily requirements rather than theoretical maximum capabilities.`
      );
      contentSections.push('');
    } else if (isExplainer) {
      // 3. Explainer Mode
      contentSections.push(
        `Understanding how **${primaryEntity.toLowerCase()}** operates requires examining the underlying mechanism, causal relationships, and engineering principles governing the system.`,
        ''
      );

      contentSections.push(`## How the Underlying Mechanism Operates`);
      contentSections.push(
        `The foundational system behind ${primaryEntity.toLowerCase()} functions through a series of interconnected physical or computational processes. When primary input is introduced, the mechanism triggers a sequence of state transformations that convert incoming energy or data into structured output.`
      );
      contentSections.push('');

      contentSections.push(`## The Science and Process Behind the System`);
      contentSections.push(
        `Because physical and logical constraints govern throughput, efficiency depends on minimizing thermal losses and systemic friction. As a result, modern implementations utilize optimized pathways that reduce cycle latency and enhance thermal management during prolonged operation. This causal relationship explains why baseline operating temperatures directly correlate with component longevity.`
      );
      contentSections.push('');

      contentSections.push(`## Why This Mechanism Matters in Practice`);
      contentSections.push(
        `Recognizing how these internal dynamics operate enables users to diagnose operational bottlenecks early and optimize operational parameters for reliable performance across diverse working environments.`
      );
      contentSections.push('');
    } else {
      // 4. Reference Protocol Mode (Default Guide)
      contentSections.push(
        `This practical reference protocol details the step-by-step procedure, required equipment, operational parameters, and failure prevention guidelines for **${primaryEntity.toLowerCase()}**.`,
        ''
      );

      if (request.outlineSections && request.outlineSections.length > 0) {
        for (let i = 0; i < request.outlineSections.length; i++) {
          const sec = request.outlineSections[i];
          contentSections.push(`## ${i + 1}. ${sec.heading}`);
          contentSections.push(
            `Developing practical mastery around ${sec.heading.toLowerCase()} for ${primaryEntity.toLowerCase()} requires structured execution. Operators must observe documented parameters, verify baseline conditions, and execute each step methodically.`
          );
          if (sec.keyPoints && sec.keyPoints.length > 0) {
            for (const kp of sec.keyPoints) {
              contentSections.push(`- **${kp}**: Document baseline readings and verify stability across standard operational intervals.`);
            }
          }
          contentSections.push('');
        }
      }

      contentSections.push(`## What You Need & Prerequisites`);
      contentSections.push(
        `Before beginning the protocol for ${primaryEntity.toLowerCase()}, gather the following required tools and materials:`,
        `- 1 primary cleaning or measurement apparatus appropriate for ${primaryEntity.toLowerCase()}`,
        `- 500ml of clean, warm filtered water or standard preparation solution`,
        `- 2 microfiber cloths and food-grade silicone protection gloves`,
        `- A digital timer and precision digital scale calibrated to 0.1g increments`
      );
      contentSections.push('');

      contentSections.push(`## Step-by-Step Execution Protocol`);
      contentSections.push(
        `1. **Preparation and Isolation**: Disconnect power or shut off supply lines, allow operating temperatures to stabilize between 20°C and 25°C, and clear a clean working area.`,
        `2. **Solution Application**: Mix the preparation solution at a 1:10 dilution ratio. Apply evenly across target contact surfaces and allow to rest for 15 minutes to dissolve residue.`,
        `3. **Mechanical Flush and Rinse**: Flush the system with 500ml of clean water at a steady flow rate. Inspect output clarity to confirm complete contaminant removal.`,
        `4. **Inspection and Calibration**: Reassemble components, inspect seals for tightness, and execute a 3-minute test cycle to verify proper operating pressure and flow.`
      );
      contentSections.push('');

      contentSections.push(`## Key Parameters & Operating Rules`);
      contentSections.push(
        `- **Operating Temperature**: Maintain between 18°C and 65°C depending on phase requirements.`,
        `- **Timing Intervals**: Allow 15 minutes of dwell time between application and final rinse.`,
        `- **Inspection Cadence**: Repeat inspection every 30 to 60 days to prevent buildup.`
      );
      contentSections.push('');

      contentSections.push(`## Common Mistakes & Failure Prevention`);
      contentSections.push(
        `To prevent equipment damage or performance degradation when managing ${primaryEntity.toLowerCase()}, avoid using harsh abrasive cleaners that degrade silicone seals. If flow rate remains restricted after flushing, inspect the intake filter for mineral blockage and clean immediately.`
      );
      contentSections.push('');
    }

    // Expand word count if targetMin requires richer depth with topic-specific modules
    const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
    let currentWords = countWords(contentSections.join('\n'));

    if (currentWords < targetMin) {
      const topicModules = [
        {
          heading: 'Environmental Setup & Workspace Layout',
          body: `Proper physical arrangement for ${primaryEntity.toLowerCase()} directly prevents operational errors and improves daily throughput. Position equipment on a flat, vibration-damped work surface with at least 10cm of surrounding clearance for adequate ventilation. Ensure ambient room lighting is adjusted to reduce visual glare during precision inspections. Before starting, verify that all power sources, input lines, and collection receptacles are secured to eliminate accidental disconnects during active cycles.`,
          bullets: [
            'Clear Workspace: Maintain dedicated zones for wet and dry operations to avoid cross-contamination.',
            'Stable Power & Hookups: Verify grounded electrical connections and secure all hoses with locking clamps.',
            'Thermal Clearance: Keep a minimum 15cm buffer between heat dissipation vents and adjacent walls.',
          ],
        },
        {
          heading: 'Preventive Maintenance Schedule & Longevity',
          body: `Durable performance requires systematic routine care rather than reactive emergency repairs. Establishing a monthly inspection schedule for ${primaryEntity.toLowerCase()} ensures that minor seal wear, mineral accumulation, or parameter drift is identified before causing equipment breakdown. Documenting each maintenance cycle creates a reliable operational log that supports consistent output quality over years of use.`,
          bullets: [
            'Weekly Rinse Protocol: Perform a rapid 2-minute clear-water flush at the end of active operating cycles.',
            'Monthly Component Audit: Check gaskets, fasteners, and filters for physical signs of wear or degradation.',
            'Quarterly Recalibration: Test sensor accuracy and reset baseline operating thresholds according to manufacturer specifications.',
          ],
        },
        {
          heading: 'Quantitative Diagnostic Benchmarks',
          body: `Tracking empirical performance metrics provides objective confirmation of system health. Measure throughput time, power consumption, and thermal rise over consecutive test runs to detect performance anomalies early. When measurements deviate beyond documented tolerance thresholds, refer directly to primary diagnostic tables before making mechanical adjustments.`,
          bullets: [
            'Baseline Measurement: Record baseline throughput during initial setup under standard 20°C ambient conditions.',
            'Variance Threshold: Investigate any operational delay exceeding 15% of documented baseline benchmarks.',
            'Pressure and Thermal Limits: Confirm operating pressure remains within standard rated specifications (15–20% tolerance).',
          ],
        },
        {
          heading: 'Workflow Optimization & Operational Efficiency',
          body: `Integrating ${primaryEntity.toLowerCase()} into consistent daily routines minimizes friction and reduces procedural errors. Prepare all supporting materials in advance, standardize preparation ratios, and execute cycles using consistent timing sequences. When operators follow standardized operational protocols, variation in finished results drops by over 80%.`,
          bullets: [
            'Batch Processing: Group similar tasks into unified operational blocks to minimize warmup and cleanup cycles.',
            'Tool Ergonomics: Arrange primary controls and frequently used tools within immediate forearm reach.',
            'Cycle Verification: Record completion times and verify output quality immediately following each run.',
          ],
        },
        {
          heading: 'Failure Prevention & Safety Guardrails',
          body: `Maintaining rigorous safety standards is critical when operating ${primaryEntity.toLowerCase()}. Never bypass safety interlocks, ignore thermal error codes, or operate equipment with worn insulation or damaged gaskets. If unexpected noises, fluid leaks, or erratic sensor readings occur, halt the cycle immediately and disconnect power before initiating physical inspection.`,
          bullets: [
            'Emergency Shutdown: Familiarize all operators with rapid disconnect procedures and emergency shutoff locations.',
            'Component Isolation: Allow heated elements to cool for at least 20 minutes before disassembling internal chambers.',
            'Approved Replacement Parts: Use only certified OEM gaskets and seals to preserve structural pressure ratings.',
          ],
        },
        {
          heading: 'Long-Term Storage & Off-Season Preservation',
          body: `When taking ${primaryEntity.toLowerCase()} out of service for extended periods, follow a thorough preservation protocol. Drain all internal moisture, clean contact surfaces with food-grade alcohol or mild neutral detergent, and store components in a dry, temperature-controlled environment away from direct sunlight.`,
          bullets: [
            'Moisture Purge: Run a 5-minute dry air cycle to eliminate residual moisture from internal channels.',
            'Gasket Lubrication: Apply a light coating of food-grade silicone lubricant to rubber seals to prevent drying and cracking.',
            'Protective Enclosure: Seal equipment in breathable protective covers to keep dust out while preventing condensation buildup.',
          ],
        },
        {
          heading: 'Component Lifecycle & Replacement Intervals',
          body: `Every mechanical and digital sub-assembly for ${primaryEntity.toLowerCase()} possesses a measurable lifecycle. Tracking operating hours against rated component durability prevents unexpected breakdowns during peak tasks. Replace critical consumable parts systematically before they reach mechanical exhaustion.`,
          bullets: [
            'High-Wear Gaskets: Replace every 6 to 12 months or after 500 operating cycles.',
            'Internal Filtration Media: Clean monthly and replace every 180 days to maintain target throughput.',
            'Electronic Sensor Probes: Recalibrate quarterly and inspect wiring harnesses for thermal fatigue.',
          ],
        },
        {
          heading: 'Troubleshooting Decision Tree & Fault Matrix',
          body: `When operational anomalies emerge during ${primaryEntity.toLowerCase()} execution, isolate symptoms using an organized fault tree rather than random trial-and-error adjustments. Check power and supply continuity first, inspect mechanical seals second, and test firmware or sensor readings third.`,
          bullets: [
            'Low Pressure or Restricted Flow: Check intake valve for physical obstruction and clean mesh screen.',
            'Erratic Sensor Readings: Power cycle the unit and verify probe contact points are free of oxidation.',
            'Excessive Operating Noise: Inspect internal mounting brackets and verify vibration damping pads are secure.',
          ],
        },
        {
          heading: 'Resource Consumption & Efficiency Analysis',
          body: `Evaluating energy and material consumption for ${primaryEntity.toLowerCase()} provides actionable opportunities for cost reduction and resource conservation. Measuring baseline electrical draw during warmup and steady-state phases reveals optimal batch scheduling patterns.`,
          bullets: [
            'Warmup Phase Optimization: Avoid leaving systems idle in high-power readiness states for more than 15 minutes.',
            'Consumable Rationing: Measure exact preparation volumes using digital scales rather than visual approximations.',
            'Power Management: Utilize dedicated smart outlets with real-time wattage tracking to monitor power draw over time.',
          ],
        },
        {
          heading: 'Cross-Environment Adaptation & Flexibility',
          body: `Operational conditions vary significantly across home workshops, office environments, and field installations. Adapting ${primaryEntity.toLowerCase()} to ambient temperature shifts, relative humidity changes, and elevation variances ensures consistent output quality regardless of physical location.`,
          bullets: [
            'High-Humidity Protocols: Store sensitive consumable powders and electronic probes in sealed desiccant containers.',
            'Cold-Start Adjustments: Extend initial warmup cycles by 3 minutes when ambient room temperature drops below 16°C.',
            'Acoustic Damping: Install high-density rubber isolation pads under units operating in noise-sensitive residential spaces.',
          ],
        },
        {
          heading: 'Empirical Safety Standards & Verification Checkpoints',
          body: `Establishing verified safety thresholds for ${primaryEntity.toLowerCase()} ensures operator protection across all operational phases. Prior to powering up or activating mechanical elements, verify that emergency isolation switches are operational and that all ground connections meet standard electrical specifications. Regular safety audits reduce physical hazards and prevent equipment damage during high-load processing cycles.`,
          bullets: [
            'Electrical Isolation: Test residual current devices and circuit interrupters monthly under controlled load conditions.',
            'Thermal Cutoffs: Verify thermal fuses and automated shutdown sensors engage when internal temperatures exceed rated limits.',
            'Mechanical Shielding: Ensure all physical guards, protective barriers, and interlock switches are locked in place.',
          ],
        },
        {
          heading: 'Quality Assurance Protocols & Inspection Criteria',
          body: `Maintaining uniform output quality for ${primaryEntity.toLowerCase()} requires structured quality control metrics. Evaluate finished results against established dimensional tolerances, visual clarity parameters, and performance consistency thresholds. Keeping a calibrated reference standard allows operators to detect minor drifts in output quality before defects compound.`,
          bullets: [
            'Visual Inspection Standards: Examine surface finishes under 500-lux neutral illumination for micro-abrasions or irregularities.',
            'Dimensional Tolerance Verification: Measure critical clearances with digital calipers calibrated to within 0.02mm accuracy.',
            'Sample Retention: Retain representative batch samples with timestamped logs for quality comparison over consecutive production runs.',
          ],
        },
        {
          heading: 'Material Compatibility & Chemical Resistance Guidelines',
          body: `Selecting appropriate contact materials and cleaning agents for ${primaryEntity.toLowerCase()} prevents premature material degradation. Certain polymer seals, brass fittings, and anodized aluminum surfaces react negatively to aggressive solvents or acidic compounds. Verify chemical compatibility charts before applying novel cleaning or lubricating solutions.`,
          bullets: [
            'Solvent Selection: Use neutral pH detergents (6.5–7.5 pH) for routine washing of anodized and painted components.',
            'Elastomer Integrity: Avoid petroleum-based lubricants on EPDM or silicone seals; utilize pure food-grade silicone grease.',
            'Corrosion Resistance: Inspect fastener threads and internal fluid channels for signs of galvanic corrosion or oxidation.',
          ],
        },
        {
          heading: 'Thermal Dynamics & Heat Dissipation Management',
          body: `Managing heat generation in ${primaryEntity.toLowerCase()} is vital for preserving component longevity and preventing thermal throttling. Passive heat sinks and active ventilation channels must remain unobstructed by dust or debris. In high-ambient environments, supplemental airflow ensures internal semiconductors and mechanical drives operate within optimal thermal envelopes.`,
          bullets: [
            'Airflow Clearance: Maintain a minimum 15cm buffer between heat dissipation vents and adjacent walls or enclosures.',
            'Thermal Paste Inspection: Inspect thermal interface materials on heat-generating modules every 24 months for drying or degradation.',
            'Ambient Thresholds: Operate within ambient temperature boundaries of 15°C to 28°C to prevent thermal stress on sensitive components.',
          ],
        },
        {
          heading: 'Firmware Management & Diagnostic Telemetry',
          body: `Monitoring diagnostic logs and keeping firmware up to date ensures ${primaryEntity.toLowerCase()} benefits from performance optimizations and bug fixes. Regularly export telemetry data to track cycle counts, error codes, and operational telemetry. When updating firmware, always verify power stability and create a configuration backup prior to installation.`,
          bullets: [
            'Backup Configuration: Save active parameter profiles to external storage before applying system firmware revisions.',
            'Error Log Review: Analyze error logs weekly to detect recurring warning flags before they cause system halts.',
            'Stable Power Source: Never initiate firmware flashing cycles without an uninterrupted power supply connection.',
          ],
        },
        {
          heading: 'Auditing Procedures & Compliance Checklists',
          body: `Conducting systematic audits guarantees that ${primaryEntity.toLowerCase()} remains compliant with organizational standards and regulatory safety norms. Use a structured audit checklist covering mechanical integrity, electrical safety, calibration currency, and operator compliance. Address any identified non-conformances immediately according to remediation priority.`,
          bullets: [
            'Pre-Operation Verification: Complete a 5-point checklist verifying power, fluids, seals, clearance, and safety interlocks.',
            'Periodic Comprehensive Audit: Conduct a complete teardown and recalibration audit every 12 months with verified documentation.',
            'Corrective Action Tracking: Document all maintenance interventions and verify resolution within 48 hours of issue detection.',
          ],
        },
      ];

      for (const mod of topicModules) {
        if (currentWords >= targetMin) break;
        contentSections.push(`## ${mod.heading}`, mod.body, '');
        for (const b of mod.bullets) {
          contentSections.push(`- **${b.split(':')[0]}**: ${b.split(':')[1] || b}`);
        }
        contentSections.push('');
        currentWords = countWords(contentSections.join('\n'));
      }
    }

    // Append affiliate disclosure if required
    if (request.affiliateGuidance?.disclosureRequired || request.affiliateIntent) {
      const disclosure = request.affiliateGuidance?.disclosureText || 'LifeMode may earn an affiliate commission on purchases made through verified partner recommendations.';
      contentSections.push('', `*Editorial Disclosure: ${disclosure}*`);
    }

    // Prepend safety disclaimer for high-risk topics
    if (request.riskLevel === 'high') {
      contentSections.unshift('*Editorial Disclaimer: This content is for educational purposes only. Consult a doctor or qualified professional for advice.*', '');
    }

    const content = contentSections.join('\n');

    const faq = [
      {
        question: `How often should maintenance be performed for ${primaryEntity}?`,
        answer: `Routine maintenance should be carried out every 30 to 60 days under standard operating conditions.`,
      },
      {
        question: `What are the most critical safety parameters?`,
        answer: `Maintain temperature within designated thresholds (18°C–65°C) and ensure all seals and connections are secure before powering on.`,
      },
    ];

    const sources = request.requiredSources?.map((s) => ({
      name: s.name,
      url: s.url || 'https://lifemode.life/editorial-standards',
    })) || [
      {
        name: 'LifeMode Technical & Editorial Standards',
        url: 'https://lifemode.life/editorial-standards',
      },
    ];

    const internalLinks = request.internalLinks?.length
      ? request.internalLinks
      : [`/${request.pillar}`];

    const affiliateIntents = request.affiliateIntent && request.affiliateCategories
      ? request.affiliateCategories
      : request.affiliateIntent
      ? [request.pillar]
      : [];

    const socialHooks = [
      `Key practical takeaways and step-by-step protocol for ${primaryEntity}.`,
      `How to optimize and maintain ${primaryEntity} with verified guidelines.`,
    ];

    const article: GeneratedArticle = {
      title,
      slug,
      description,
      excerpt,
      content,
      faq,
      sources,
      internalLinks,
      affiliateIntents,
      socialHooks,
    };

    const durationMs = Math.max(1, Date.now() - startTime);

    return {
      article,
      metadata: {
        provider: this.name,
        model: this.model,
        generatedAt: new Date().toISOString(),
        inputTokenEstimate: 320,
        outputTokenEstimate: 580,
        durationMs,
      },
    };
  }
}
