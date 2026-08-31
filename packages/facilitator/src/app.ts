import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402/core/types';
import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { createHash, timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import proxyAddr from 'proxy-addr';

import type { SettlementEvent } from '@rialto/shared';
import { Env } from './config/env.js';
import { buildFacilitator } from './schemes/registry.js';
import { extractBazaarMetadata, postSettlementEvent } from './settlement-events.js';
import { logger, httpLogger } from './utils/logger.js';
import { codedError, classifyUpstreamError } from './utils/errors.js';
import { validatePaymentPayload, validatePaymentRequirements } from './utils/validation.js';

type FacilitatorApi = Pick<
  ReturnType<typeof buildFacilitator>,
  'verify' | 'settle' | 'getSupported'
>;

export function createApp(facilitator: FacilitatorApi = buildFacilitator()): Express {
  const app: Express = express();
  app.set('trust proxy', proxyAddr.compile(Env.trustProxy));
  app.use(helmet());
  app.use(cors({ origin: Env.corsOrigins }));
  app.use(httpLogger);
  app.use(express.json({ limit: '256kb' }));

  const expectedApiKey = Env.apiKey;
  function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    if (!expectedApiKey) {
      next();
      return;
    }
    const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    // Hash both sides so buffers are equal length and comparison is constant-time.
    const providedHash = createHash('sha256').update(provided).digest();
    const expectedHash = createHash('sha256').update(expectedApiKey).digest();
    if (!timingSafeEqual(providedHash, expectedHash)) {
      res.status(401).json(codedError('payload_invalid', 'Invalid or missing API key'));
      return;
    }
    next();
  }

  // Caps brute-force against the API key and resource burn on /verify (RPC
  // simulation) and /settle (sponsored XLM fees) - the sponsor-economics
  // boundary's first, simplest line. Success-rate-tied limits are the funded
  // milestone; this is deliberately plain configuration.
  const authRateLimit = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: codedError('payload_invalid', 'Too many requests'),
  });

  app.post('/verify', authRateLimit, requireApiKey, async (req, res): Promise<void> => {
    try {
      const { paymentPayload, paymentRequirements } = req.body ?? {};
      const payloadError = validatePaymentPayload(paymentPayload);
      if (payloadError) {
        res.status(400).json(codedError('payload_invalid', payloadError));
        return;
      }
      const requirementsError = validatePaymentRequirements(paymentRequirements);
      if (requirementsError) {
        res.status(400).json(codedError('payload_invalid', requirementsError));
        return;
      }

      const response: VerifyResponse = await facilitator.verify(
        paymentPayload as PaymentPayload,
        paymentRequirements as PaymentRequirements,
      );
      logger.info(
        { isValid: response.isValid, invalidReason: response.isValid ? undefined : response.invalidReason },
        'verify response',
      );
      res.status(response.invalidReason === 'UPTO_ALLOWANCE_REQUIRED' ? 412 : 200).json(response);
    } catch (error) {
      const classified = classifyUpstreamError(error);
      logger.error({ err: error, code: classified.code }, 'verify error');
      const status = classified.code === 'upstream_unreachable' ? 502 : 500;
      res.status(status).json({ error: classified });
    }
  });

  app.post('/settle', authRateLimit, requireApiKey, async (req, res): Promise<void> => {
    const { paymentPayload, paymentRequirements } = req.body ?? {};
    try {
      const payloadError = validatePaymentPayload(paymentPayload);
      if (payloadError) {
        res.status(400).json(codedError('payload_invalid', payloadError));
        return;
      }
      const requirementsError = validatePaymentRequirements(paymentRequirements);
      if (requirementsError) {
        res.status(400).json(codedError('payload_invalid', requirementsError));
        return;
      }

      const response: SettleResponse = await facilitator.settle(
        paymentPayload as PaymentPayload,
        paymentRequirements as PaymentRequirements,
      );

      if (response.success) {
        const requirements = paymentRequirements as PaymentRequirements;
        const payload = paymentPayload as PaymentPayload;
        const event: SettlementEvent = {
          txHash: response.transaction,
          network: requirements.network as SettlementEvent['network'],
          scheme: requirements.scheme,
          payTo: requirements.payTo,
          amount: requirements.amount,
          asset: requirements.asset,
          resource: payload.resource?.url ?? '',
          bazaarMetadata: extractBazaarMetadata(payload, requirements),
          settledAt: new Date().toISOString(),
        };
        postSettlementEvent(Env.discoveryIngestUrl, event, Env.discoveryIngestToken);
      }

      res.json(response);
    } catch (error) {
      const classified = classifyUpstreamError(error);
      logger.error({ err: error, code: classified.code }, 'settle error');
      if (error instanceof Error && error.message.includes('Settlement aborted:')) {
        res.status(502).json({
          success: false,
          transaction: '',
          errorReason: error.message,
          network: (paymentRequirements as PaymentRequirements | undefined)?.network ?? Env.stellarNetwork,
        } satisfies SettleResponse);
        return;
      }
      const status = classified.code === 'upstream_unreachable' ? 502 : 500;
      res.status(status).json({ error: classified });
    }
  });

  app.get('/supported', authRateLimit, requireApiKey, (_req, res) => {
    res.json(facilitator.getSupported());
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled error');
    if (!res.headersSent) {
      res.status(500).json(codedError('simulation_failed', 'Internal server error'));
    }
  });

  return app;
}
