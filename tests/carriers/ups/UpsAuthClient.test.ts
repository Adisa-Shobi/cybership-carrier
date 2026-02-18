import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type axios from "axios";

jest.unstable_mockModule("axios", () => ({
	default: {
		post: jest.fn(),
		isAxiosError: jest.fn((err: unknown): err is Error => {
			return typeof err === "object" && err !== null && "isAxiosError" in err;
		}),
	},
}));

const { default: mockedAxios } = await import("axios");
const mockedPost = mockedAxios.post as jest.MockedFunction<typeof axios.post>;

const { UpsAuthClient } = await import(
	"../../../src/carriers/ups/UpsAuthClient.js"
);
const { AuthenticationError, CarrierApiError } = await import(
	"../../../src/core/errors.js"
);

const UPS_CONFIG = {
	clientId: "test-client-id",
	clientSecret: "test-client-secret",
	baseUrl: "https://onlinetools.ups.com",
};

function oauthResponse(overrides: Record<string, string> = {}) {
	return {
		data: {
			token_type: "Bearer",
			issued_at: "1718000000000",
			client_id: "test-client-id",
			access_token: "tok_abc123",
			scope: "public",
			expires_in: "14400",
			refresh_count: "0",
			status: "approved",
			...overrides,
		},
	};
}

function upsAxiosError(status: number, code: string, message: string) {
	const err = new Error("Request failed") as any;
	err.isAxiosError = true;
	err.response = {
		status,
		data: { response: { errors: [{ code, message }] } },
	};
	return err;
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe("UpsAuthClient", () => {
	it("fetches a token via client credentials on first call", async () => {
		mockedPost.mockResolvedValueOnce(oauthResponse() as any);

		const auth = new UpsAuthClient(UPS_CONFIG);
		const token = await auth.accessToken();

		expect(token).toBe("tok_abc123");
		expect(mockedPost).toHaveBeenCalledTimes(1);
		expect(mockedPost).toHaveBeenCalledWith(
			"https://onlinetools.ups.com/security/v1/oauth/token",
			"grant_type=client_credentials",
			expect.objectContaining({
				headers: expect.objectContaining({
					"Content-Type": "application/x-www-form-urlencoded",
				}),
			}),
		);
	});

	it("returns cached token without a network call", async () => {
		mockedPost.mockResolvedValueOnce(oauthResponse() as any);

		const auth = new UpsAuthClient(UPS_CONFIG);
		await auth.accessToken();
		const token = await auth.accessToken();

		expect(token).toBe("tok_abc123");
		expect(mockedPost).toHaveBeenCalledTimes(1);
	});

	it("re-authenticates when cached token has expired", async () => {
		mockedPost
			.mockResolvedValueOnce(oauthResponse({ expires_in: "61" }) as any)
			.mockResolvedValueOnce(
				oauthResponse({ access_token: "tok_fresh" }) as any,
			);

		const auth = new UpsAuthClient(UPS_CONFIG);
		expect(await auth.accessToken()).toBe("tok_abc123");

		// Advance past the 60s safety buffer (61 - 60 = 1s effective TTL)
		jest.spyOn(Date, "now").mockReturnValue(Date.now() + 2000);

		expect(await auth.accessToken()).toBe("tok_fresh");
		expect(mockedPost).toHaveBeenCalledTimes(2);

		jest.restoreAllMocks();
	});

	it("re-authenticates after clearToken() is called", async () => {
		mockedPost
			.mockResolvedValueOnce(oauthResponse() as any)
			.mockResolvedValueOnce(oauthResponse({ access_token: "tok_new" }) as any);

		const auth = new UpsAuthClient(UPS_CONFIG);
		await auth.accessToken();
		auth.clearToken();
		const token = await auth.accessToken();

		expect(token).toBe("tok_new");
		expect(mockedPost).toHaveBeenCalledTimes(2);
	});

	it("sends Basic auth header with base64-encoded credentials", async () => {
		mockedPost.mockResolvedValueOnce(oauthResponse() as any);

		const auth = new UpsAuthClient(UPS_CONFIG);
		await auth.accessToken();

		const expectedCredentials = Buffer.from(
			`${UPS_CONFIG.clientId}:${UPS_CONFIG.clientSecret}`,
		).toString("base64");

		expect(mockedPost).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: `Basic ${expectedCredentials}`,
				}),
			}),
		);
	});

	it("throws AuthenticationError on 401 with UPS error message", async () => {
		mockedPost.mockRejectedValueOnce(
			upsAxiosError(401, "10401", "ClientId is invalid"),
		);

		const auth = new UpsAuthClient(UPS_CONFIG);
		try {
			await auth.accessToken();
			throw new Error("Expected error");
		} catch (error) {
			expect(error).toBeInstanceOf(AuthenticationError);
			expect((error as Error).message).toBe("ClientId is invalid");
		}
	});

	it("throws AuthenticationError on 403", async () => {
		mockedPost.mockRejectedValueOnce(
			upsAxiosError(403, "10403", "Access is forbidden"),
		);

		const auth = new UpsAuthClient(UPS_CONFIG);
		await expect(auth.accessToken()).rejects.toThrow(AuthenticationError);
	});

	it("throws RateLimitError on 429", async () => {
		const { RateLimitError } = await import("../../../src/core/errors.js");
		mockedPost.mockRejectedValueOnce(
			upsAxiosError(429, "10429", "Rate limit exceeded"),
		);

		const auth = new UpsAuthClient(UPS_CONFIG);
		await expect(auth.accessToken()).rejects.toThrow(RateLimitError);
	});

	it("throws CarrierApiError on 400 with UPS error details", async () => {
		mockedPost.mockRejectedValueOnce(
			upsAxiosError(400, "10400", "Invalid grant_type"),
		);

		const auth = new UpsAuthClient(UPS_CONFIG);
		try {
			await auth.accessToken();
			throw new Error("Expected error");
		} catch (error) {
			expect(error).toBeInstanceOf(CarrierApiError);
			const apiError = error as InstanceType<typeof CarrierApiError>;
			expect(apiError.httpStatus).toBe(400);
			expect(apiError.carrierCode).toBe("10400");
			expect(apiError.message).toBe("Invalid grant_type");
		}
	});
});
