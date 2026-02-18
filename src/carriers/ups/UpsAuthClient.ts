import axios from "axios";
import { z } from "zod";
import type { Config } from "../../config.js";
import {
	AuthenticationError,
	CarrierApiError,
	RateLimitError,
} from "../../core/errors.js";
import type { ICarrierAuth } from "../../core/ICarrierAuth.js";

const UpsErrorResponseSchema = z.object({
	response: z.object({
		errors: z.array(z.object({ code: z.string(), message: z.string() })),
	}),
});

const TokenResponseSchema = z.object({
	token_type: z.string(),
	issued_at: z.string(),
	client_id: z.string(),
	access_token: z.string(),
	scope: z.string(),
	expires_in: z.coerce.number().positive(),
	refresh_count: z.coerce.number().nonnegative(),
	status: z.string(),
});

const EXPIRY_BUFFER_S = 60;

export class UpsAuthClient implements ICarrierAuth {
	private readonly config: Config["ups"];
	private cachedToken: string | null = null;
	private expiresAt = 0;

	constructor(config: Config["ups"]) {
		this.config = config;
	}

	/**
	 * Returns a valid access token, serving from cache when possible.
	 * Transparently fetches a new token when the cache is empty or expired.
	 */
	async accessToken(): Promise<string> {
		if (this.cachedToken !== null && Date.now() < this.expiresAt) {
			return this.cachedToken;
		}
		return this.authenticate();
	}

	/** Invalidates the cached token, forcing the next call to re-authenticate. */
	clearToken(): void {
		this.cachedToken = null;
		this.expiresAt = 0;
	}

	private async authenticate(): Promise<string> {
		const credentials = Buffer.from(
			`${this.config.clientId}:${this.config.clientSecret}`,
		).toString("base64");

		try {
			const response = await axios.post(
				`${this.config.baseUrl}/security/v1/oauth/token`,
				"grant_type=client_credentials",
				{
					headers: {
						Authorization: `Basic ${credentials}`,
						"Content-Type": "application/x-www-form-urlencoded",
					},
				},
			);

			const parsed = TokenResponseSchema.parse(response.data);
			this.cachedToken = parsed.access_token;
			this.expiresAt =
				Date.now() + (parsed.expires_in - EXPIRY_BUFFER_S) * 1000;
			return parsed.access_token;
		} catch (error) {
			throw this.toStructuredError(error);
		}
	}

	private toStructuredError(error: unknown): Error {
		if (!axios.isAxiosError(error) || !error.response) {
			return new CarrierApiError(
				`UPS OAuth request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				0,
				undefined,
				{ cause: error instanceof Error ? error : undefined },
			);
		}

		const { status, data } = error.response;
		const parsed = UpsErrorResponseSchema.safeParse(data);
		const firstError = parsed.success
			? parsed.data.response.errors[0]
			: undefined;
		const message =
			firstError?.message ?? `UPS OAuth request failed (HTTP ${status})`;
		const carrierCode = firstError?.code;

		if (status === 401 || status === 403) {
			return new AuthenticationError(message, { cause: error });
		}
		if (status === 429) {
			return new RateLimitError(message, { cause: error });
		}
		return new CarrierApiError(message, status, carrierCode, { cause: error });
	}
}
