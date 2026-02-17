/**
 * Local Embedding Provider.
 * Implements embedding generation using @huggingface/transformers (Transformers.js).
 * Uses Xenova/all-MiniLM-L6-v2 model for fast, offline-capable embeddings.
 *
 * Features:
 * - Runs entirely in Node.js (no external API calls)
 * - First download is cached in ~/.cache/huggingface/
 * - Quantized model for smaller memory footprint
 * - 384-dimensional embeddings
 */

import type { EmbeddingProvider, ProviderCapabilities } from "../types.js";

// ============================================================================
// Constants
// ============================================================================

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const MODEL_ID = "all-MiniLM-L6-v2";
const DIMENSIONS = 384;

// ============================================================================
// Types
// ============================================================================

type FeatureExtractionPipeline = Awaited<ReturnType<typeof import("@huggingface/transformers").pipeline>>;

// ============================================================================
// Provider Implementation
// ============================================================================

export class LocalEmbeddingProvider implements EmbeddingProvider {
	readonly id = "local";
	readonly name = "Local Embeddings (MiniLM)";
	readonly model = MODEL_ID;

	readonly capabilities: ProviderCapabilities = {
		maxTokens: 256,
		dimensions: DIMENSIONS,
		supportsBatch: true,
		maxBatchSize: 32,
		offlineCapable: true,
	};

	private extractor: FeatureExtractionPipeline | null = null;
	private initPromise: Promise<void> | null = null;
	private available: boolean | null = null;

	async isAvailable(): Promise<boolean> {
		if (this.available !== null) {
			return this.available;
		}

		try {
			// Check if @huggingface/transformers is installed
			await import("@huggingface/transformers");
			this.available = true;
			return true;
		} catch {
			this.available = false;
			return false;
		}
	}

	/**
	 * Initialize the embedding pipeline.
	 * Called automatically on first use, but can be called explicitly to preload.
	 */
	async initialize(): Promise<void> {
		// Singleton pattern: ensure only one initialization
		if (this.extractor) return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.doInitialize();
		await this.initPromise;
		this.initPromise = null;
	}

	private async doInitialize(): Promise<void> {
		try {
			const { pipeline, env } = await import("@huggingface/transformers");

			// Configure environment
			env.allowLocalModels = false; // Download from Hugging Face Hub

			console.log(`[local-embeddings] Loading model ${MODEL_NAME}...`);

			this.extractor = await pipeline(
				"feature-extraction",
				MODEL_NAME,
				{
					quantized: true,
					progress_callback: (progress: { status: string; progress?: number }) => {
						if (progress.status === "downloading" && progress.progress) {
							// Log download progress at 25% intervals
							if (progress.progress % 25 < 5) {
								console.log(`[local-embeddings] Download progress: ${Math.round(progress.progress)}%`);
							}
						}
					},
				}
			);

			console.log(`[local-embeddings] Model loaded successfully`);
		} catch (error) {
			console.error(`[local-embeddings] Failed to initialize:`, error);
			throw error;
		}
	}

	async generateEmbedding(text: string): Promise<number[] | null> {
		try {
			await this.initialize();

			if (!this.extractor) {
				console.error(`[local-embeddings] Extractor not initialized`);
				return null;
			}

			// Truncate long text (MiniLM has 256 token limit, ~1000 chars)
			const truncatedText = text.slice(0, 1000);

			// Generate embedding with mean pooling and normalization
			const output = await this.extractor(truncatedText, {
				pooling: "mean",
				normalize: true,
			});

			// Convert tensor to array
			const embedding = Array.from(output.data as Float32Array);

			return embedding;
		} catch (error) {
			console.error(`[local-embeddings] Failed to generate embedding:`, error);
			return null;
		}
	}

	async generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
		// Process in batches to avoid memory issues
		const results: (number[] | null)[] = [];
		const batchSize = this.capabilities.maxBatchSize;

		for (let i = 0; i < texts.length; i += batchSize) {
			const batch = texts.slice(i, i + batchSize);
			const batchResults = await Promise.all(
				batch.map((text) => this.generateEmbedding(text))
			);
			results.push(...batchResults);
		}

		return results;
	}

	/**
	 * Dispose of the model to free memory.
	 */
	async dispose(): Promise<void> {
		if (this.extractor) {
			// Transformers.js doesn't have explicit disposal, but we can release reference
			this.extractor = null;
			console.log(`[local-embeddings] Model released`);
		}
	}
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const localEmbeddingProvider = new LocalEmbeddingProvider();
