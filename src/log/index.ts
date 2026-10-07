import { createLogger } from './logger';
import { createReporter, defaultReporterOptions } from './report';

export * from './logger';
export { createReporter, type Report, type ProviderName } from './report';

export const log = createLogger();
export const reporter = createReporter(log, defaultReporterOptions());
export const buildReport = reporter.buildReport;
export const recordGeneration = reporter.recordGeneration;
