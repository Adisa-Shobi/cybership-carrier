export interface ICarrierAuth {
	/** Returns a valid access token, serving from cache when possible. */
	accessToken(): Promise<string>;

	/** Invalidates any cached credentials, forcing re-authentication on the next call. */
	clearToken(): void;
}
