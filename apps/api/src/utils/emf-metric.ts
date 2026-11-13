/**
 * CloudWatch Embedded Metric Format (EMF) — the one way this API publishes a
 * custom metric.
 *
 * WHY EMF AND NOT THE CLOUDWATCH SDK
 *
 * EMF metrics travel as a JSON line on stdout, which the ECS awslogs driver
 * already ships to CloudWatch Logs; CloudWatch then extracts the metric from
 * the log event. Nothing extra to install, no credential path, no API call on a
 * failure path, and no way to lose the metric because the metric publisher
 * itself was the thing that broke. A PutMetricData call from inside a degraded
 * write would be one more network dependency in the one place we cannot afford
 * one.
 *
 * THE SHAPE, AND WHY IT IS WHAT IT IS (T-050)
 *
 * A metric document must be exactly one line of JSON whose `_aws` member
 * declares the namespace, the dimension sets and the metrics it contains; the
 * metric values live next to the dimension values as ordinary properties. A
 * pretty-printed document is silently not a metric, and a multi-line log entry
 * is what breaks it -- so this module builds a flat object and callers print it
 * with `JSON.stringify` on a single line.
 *
 * Dimension CARDINALITY is a cost decision: every distinct dimension value
 * combination becomes its own CloudWatch metric. `emitMetric` therefore takes
 * dimensions explicitly, and hot identifiers (trip ids, user ids) belong in a
 * log line, not here.
 */

/** CloudWatch metric units this module uses. */
export type EmfMetricUnit = 'Count' | 'None';

export interface EmfMetricOptions {
  /** CloudWatch namespace, e.g. `SafePass/DynamoDB`. */
  namespace: string;
  /** Metric name, e.g. `SaveLocationFailure`. */
  name: string;
  /** Numeric value for this emission (Count metrics are usually `1`). */
  value: number;
  /** Unit as CloudWatch understands it. Defaults to `Count`. */
  unit?: EmfMetricUnit;
  /**
   * Dimensions for this metric. Keep these to stable, low-cardinality values:
   * each distinct combination is a separate metric in CloudWatch.
   */
  dimensions: Record<string, string>;
}

/** The JSON document CloudWatch interprets as a metric. */
export interface EmfMetricDocument {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: Array<{
      Namespace: string;
      Dimensions: string[][];
      Metrics: Array<{ Name: string; Unit: EmfMetricUnit }>;
    }>;
  };
  [key: string]: unknown;
}

/**
 * Builds the EMF document for one metric emission.
 *
 * Pure and dependency-free so it can be unit-tested without CloudWatch, an
 * environment, or a log sink.
 */
export function buildEmfMetric(options: EmfMetricOptions): EmfMetricDocument {
  const dimensionNames = Object.keys(options.dimensions);
  const unit = options.unit ?? 'Count';

  return {
    _aws: {
      // EMF accepts epoch milliseconds; a missing Timestamp makes CloudWatch
      // fall back to the log event's own ingestion time.
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: options.namespace,
          // One dimension set, in the order the keys were given.
          Dimensions: [dimensionNames],
          Metrics: [{ Name: options.name, Unit: unit }],
        },
      ],
    },
    ...options.dimensions,
    [options.name]: options.value,
  };
}

/**
 * Writes one EMF metric as a single stdout line.
 *
 * `console.log` is deliberate: EMF is parsed from the standard output log
 * stream, and a JSON document is the only thing on that line.
 */
export function emitMetric(options: EmfMetricOptions): void {
  console.log(JSON.stringify(buildEmfMetric(options)));
}
