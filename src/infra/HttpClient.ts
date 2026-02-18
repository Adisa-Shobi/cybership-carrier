import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import {
	AuthenticationError,
	CarrierApiError,
	RateLimitError,
} from "../core/errors.js";
import type { ICarrierAuth } from "../core/ICarrierAuth.js";

export interface HttpClientOptions {
	baseURL: string;
	auth: ICarrierAuth;
	timeoutMs?: number;
}

export class HttpClient {
	private readonly client: AxiosInstance;
	private readonly auth: ICarrierAuth;

	constructor(options: HttpClientOptions) {
		this.auth = options.auth;
		this.client = axios.create({
			baseURL: options.baseURL,
			timeout: options.timeoutMs ?? 10_000,
		});
	}

	async request<T>(config: AxiosRequestConfig): Promise<T> {
		const token = await this.auth.accessToken();
		try {
			return await this.executeWithToken<T>(config, token);
		} catch (error) {
			if (axios.isAxiosError(error) && error.response?.status === 401) {
				return this.retryWithFreshToken<T>(config);
			}
			throw this.toStructuredError(error);
		}
	}

	private async retryWithFreshToken<T>(config: AxiosRequestConfig): Promise<T> {
		this.auth.clearToken();
		const freshToken = await this.auth.accessToken();
		try {
			return await this.executeWithToken<T>(config, freshToken);
		} catch (retryError) {
			if (
				axios.isAxiosError(retryError) &&
				retryError.response?.status === 401
			) {
				throw new AuthenticationError(
					"Authentication failed after token refresh",
					{ cause: retryError },
				);
			}
			throw this.toStructuredError(retryError);
		}
	}

	private async executeWithToken<T>(
		config: AxiosRequestConfig,
		token: string,
	): Promise<T> {
		const response = await this.client.request<T>({
			...config,
			headers: { ...config.headers, Authorization: `Bearer ${token}` },
		});
		return response.data;
	}

	private toStructuredError(error: unknown): Error {
		if (!axios.isAxiosError(error)) {
			const message =
				error instanceof Error ? error.message : "Unknown HTTP error";
			return new CarrierApiError(message, 0, undefined, {
				cause: error instanceof Error ? error : undefined,
			});
		}

		const status = error.response?.status;

		if (status === 429) {
			return new RateLimitError(undefined, { cause: error });
		}
		if (status !== undefined) {
			return new CarrierApiError(`HTTP ${status}`, status, undefined, {
				cause: error,
			});
		}
		return new CarrierApiError(error.message, 0, undefined, {
			cause: error,
		});
	}
}
