/**
 * Emitted-metric shape tests (T-050).
 *
 * The consumer here is not a person -- it is the CloudWatch EMF parser, which
 * silently ignores a document that does not match the format. So the format
 * itself is the thing worth pinning: the `_aws` declaration, the dimension set,
 * the metric name and unit, and the value as a top-level property.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEmfMetric, emitMetric } from '../emf-metric';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildEmfMetric', () => {
  it('declares the namespace, dimension set and metric CloudWatch expects', () => {
    const document = buildEmfMetric({
      namespace: 'SafePass/DynamoDB',
      name: 'SaveLocationFailure',
      value: 1,
      dimensions: { TableName: 'safepass-production-realtime-state' },
    });

    const [declaration] = document._aws.CloudWatchMetrics;
    expect(document._aws.CloudWatchMetrics).toHaveLength(1);
    expect(declaration?.Namespace).toBe('SafePass/DynamoDB');
    // One dimension set, listed by name; the values sit at the top level.
    expect(declaration?.Dimensions).toEqual([['TableName']]);
    expect(declaration?.Metrics).toEqual([{ Name: 'SaveLocationFailure', Unit: 'Count' }]);

    expect(document.TableName).toBe('safepass-production-realtime-state');
    expect(document.SaveLocationFailure).toBe(1);
    expect(typeof document._aws.Timestamp).toBe('number');
  });

  it('defaults the unit to Count', () => {
    const document = buildEmfMetric({
      namespace: 'SafePass/Test',
      name: 'Thing',
      value: 1,
      dimensions: {},
    });

    expect(document._aws.CloudWatchMetrics[0]?.Metrics[0]?.Unit).toBe('Count');
    // No dimensions is legal; the metric is then namespace-wide.
    expect(document._aws.CloudWatchMetrics[0]?.Dimensions).toEqual([[]]);
  });

  it('carries every dimension given, in order', () => {
    const document = buildEmfMetric({
      namespace: 'SafePass/Test',
      name: 'Thing',
      value: 2,
      unit: 'None',
      dimensions: { Environment: 'production', TableName: 'state' },
    });

    expect(document._aws.CloudWatchMetrics[0]?.Dimensions).toEqual([
      ['Environment', 'TableName'],
    ]);
    expect(document.Environment).toBe('production');
    expect(document.TableName).toBe('state');
    expect(document.Thing).toBe(2);
    expect(document._aws.CloudWatchMetrics[0]?.Metrics[0]?.Unit).toBe('None');
  });
});

describe('emitMetric', () => {
  it('writes exactly one line of JSON to stdout', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    emitMetric({
      namespace: 'SafePass/DynamoDB',
      name: 'SaveLocationFailure',
      value: 1,
      dimensions: { TableName: 'state' },
    });

    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    // EMF is parsed per log event: a second line is not a metric.
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toMatchObject({ SaveLocationFailure: 1, TableName: 'state' });
  });
});
