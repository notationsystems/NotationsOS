import { NextRequest } from 'next/server';
import { json, refusal } from '../../_lib';
import { evaluatePortfolioCollateralShock, type LoanCollateralAsset } from '@/domain/insurabilityDynamics';
import { FIXTURE_STATE_DOI_FILINGS, FIXTURE_LOAN_PORTFOLIO } from '@/fixtures/frontier/insurabilityAndN11';
import { getActiveParameterSet } from '@/domain/parameterRegistry';
import { generateComputationReceipt } from '@/domain/productionPipeline';

export async function POST(req: NextRequest) {
  try {
    // Check for authorization if configured in environment
    const authHeader = req.headers.get('authorization');
    const configuredApiKey = process.env.PAYLOAD_API_KEY;
    if (configuredApiKey && (!authHeader || authHeader !== `Bearer ${configuredApiKey}`)) {
      return refusal(401, 'UNAUTHORIZED', 'Invalid or missing Authorization Bearer token.', 'Provide Authorization: Bearer <API_KEY> header.');
    }

    let body: { loans?: LoanCollateralAsset[]; asOf?: string } = {};
    const text = await req.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text);
    }

    const loansToTest = body.loans && Array.isArray(body.loans) && body.loans.length > 0
      ? body.loans
      : FIXTURE_LOAN_PORTFOLIO;

    const paramSet = getActiveParameterSet();
    const asOfKnowledgeTime = body.asOf || new Date().toISOString();

    const result = evaluatePortfolioCollateralShock(loansToTest, FIXTURE_STATE_DOI_FILINGS, {
      asOfKnowledgeTime,
      paramSet,
    });

    // Zero-retention computation receipt
    const receipt = generateComputationReceipt(
      'insurability-collateral-shock-engine',
      'v1.0.0',
      loansToTest,
      result,
      'sha256:4d87f589134b22c7a91176b9e223f660851893c59424c5685dfcfc02b1156641',
      asOfKnowledgeTime,
      paramSet
    );

    return json({
      schema: 'payload.frontier.insurability.collateral-shock.v1',
      evaluatedAt: new Date().toISOString(),
      asOfKnowledgeTime,
      parameterSetVersion: paramSet.version,
      parameterSetDigest: paramSet.parameterSetDigest,
      confidentialityContract: 'EPHEMERAL_PROCESSING_ONLY_ZERO_RETENTION',
      computationReceipt: receipt,
      runtimeSecurityAttestation: {
        rawLoanBookPersisted: false,
        ephemeralExecutionMode: 'IN_MEMORY_ONLY',
        accessControlEnforced: Boolean(configuredApiKey),
      },
      ...result,
    });
  } catch (error) {
    return refusal(
      400,
      'INVALID_REQUEST',
      error instanceof Error ? error.message : 'Failed to evaluate portfolio collateral shock',
      'Ensure the request body contains a valid JSON payload with optional loans array.'
    );
  }
}

