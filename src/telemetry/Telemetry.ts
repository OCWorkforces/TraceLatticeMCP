import type { Logger } from '../logger/StructuredLogger.js';

export interface TelemetrySpan {
	name: string;
	kind: 'server' | 'client' | 'consumer' | 'producer' | 'internal';
	startTime: number;
	endTime?: number;
	durationMs?: number;
	attributes: Record<string, string | number | boolean>;
	error?: string;
}

export interface TelemetryOptions {
	enabled?: boolean;
	serviceName?: string;
	maxSpans?: number;
	logger?: Logger;
}

type SpanContext = {
	span: TelemetrySpan;
	end: (error?: unknown) => TelemetrySpan;
};

export class Telemetry {
	private _enabled: boolean;
	private _serviceName: string;
	private _maxSpans: number;
	private _spans: TelemetrySpan[] = [];
	private _logger?: Logger;

	constructor(options: TelemetryOptions = {}) {
		this._enabled = options.enabled ?? false;
		this._serviceName = options.serviceName ?? 'trace-lattice';
		this._maxSpans = options.maxSpans ?? 1000;
		this._logger = options.logger;
	}

	get isEnabled(): boolean {
		return this._enabled;
	}

	startSpan(
		name: string,
		kind: TelemetrySpan['kind'],
		attributes: Record<string, string | number | boolean> = {}
	): SpanContext {
		const now = Date.now();
		const span: TelemetrySpan = {
			name,
			kind,
			startTime: now,
			attributes: {
				service: this._serviceName,
				...attributes,
			},
		};

		return {
			span,
			end: (error?: unknown): TelemetrySpan => {
				span.endTime = Date.now();
				span.durationMs = span.endTime - span.startTime;
				if (error instanceof Error) {
					span.error = error.message;
				} else if (typeof error === 'string') {
					span.error = error;
				}

				if (this._enabled) {
					this._spans.push(span);
					if (this._spans.length > this._maxSpans) {
						this._spans = this._spans.slice(this._spans.length - this._maxSpans);
					}
					this._logger?.debug('Telemetry span recorded', {
						name: span.name,
						kind: span.kind,
						durationMs: span.durationMs,
						hasError: Boolean(span.error),
					});
				}

				return span;
			},
		};
	}

	getSpans(): ReadonlyArray<TelemetrySpan> {
		return this._spans;
	}

	exportToJSON(): string {
		return JSON.stringify(this._spans, null, 2);
	}

	async exportToFile(filePath: string): Promise<void> {
		const { writeFile, mkdir } = await import('node:fs/promises');
		const { dirname } = await import('node:path');
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, this.exportToJSON(), 'utf-8');
	}

	clear(): void {
		this._spans = [];
	}
}
