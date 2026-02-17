/**
 * Type declarations for @huggingface/transformers
 * This is an optional dependency, so we declare the types here.
 */

declare module "@huggingface/transformers" {
	export function pipeline(
		task: "feature-extraction",
		model: string,
		options?: {
			quantized?: boolean;
			progress_callback?: (progress: { status: string; progress?: number }) => void;
		}
	): Promise<FeatureExtractionPipeline>;

	export interface FeatureExtractionPipeline {
		(text: string, options?: { pooling?: string; normalize?: boolean }): Promise<{
			data: Float32Array;
		}>;
	}

	export const env: {
		allowLocalModels: boolean;
	};
}
