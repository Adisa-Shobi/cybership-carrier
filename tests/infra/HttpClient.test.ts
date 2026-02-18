import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type axios from "axios";

const mockRequest = jest.fn();

jest.unstable_mockModule("axios", () => ({
	default: {
		create: jest.fn(() => ({ request: mockRequest })),
		isAxiosError: jest.fn((err: unknown): err is Error => {
			return typeof err === "object" && err !== null && "isAxiosError" in err;
		}),
	},
}));

const { default: mockedAxios } = await import("axios");
const mockedCreate = mockedAxios.create as jest.MockedFunction<
	typeof axios.create
>;

const { HttpClient } = await import("../../src/infra/HttpClient.js");
const { AuthenticationError, CarrierApiError, RateLimitError } = await import(
	"../../src/core/errors.js"
);

function stubAuth(tokens: string[] = ["tok_default"]) {
	let callIndex = 0;
	return {
		accessToken: jest.fn<() => Promise<string>>().mockImplementation(() => {
			const token = tokens[callIndex] ?? tokens.at(-1) ?? "tok_default";
			callIndex++;
			return Promise.resolve(token);
		}),
		clearToken: jest.fn<() => void>(),
	};
}

function axiosError(status: number) {
	const err = new Error(`Request failed with status ${status}`) as any;
	err.isAxiosError = true;
	err.response = { status };
	return err;
}

function networkError(message: string) {
	const err = new Error(message) as any;
	err.isAxiosError = true;
	err.response = undefined;
	return err;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockedCreate.mockReturnValue({ request: mockRequest } as any);
});

describe("HttpClient", () => {
	it("injects Authorization header from auth provider", async () => {
		mockRequest.mockResolvedValueOnce({ data: { ok: true } });
		const auth = stubAuth(["tok_123"]);

		const client = new HttpClient({
			baseURL: "https://api.example.com",
			auth,
		});
		const result = await client.request({ method: "GET", url: "/test" });

		expect(result).toEqual({ ok: true });
		expect(mockRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer tok_123",
				}),
			}),
		);
	});

	it("uses default 10s timeout", () => {
		new HttpClient({
			baseURL: "https://api.example.com",
			auth: stubAuth(),
		});

		expect(mockedCreate).toHaveBeenCalledWith(
			expect.objectContaining({ timeout: 10_000 }),
		);
	});

	it("accepts a custom timeout", () => {
		new HttpClient({
			baseURL: "https://api.example.com",
			auth: stubAuth(),
			timeoutMs: 5000,
		});

		expect(mockedCreate).toHaveBeenCalledWith(
			expect.objectContaining({ timeout: 5000 }),
		);
	});

	it("clears token and retries once on 401", async () => {
		const auth = stubAuth(["tok_stale", "tok_fresh"]);

		mockRequest
			.mockRejectedValueOnce(axiosError(401))
			.mockResolvedValueOnce({ data: { ok: true } });

		const client = new HttpClient({
			baseURL: "https://api.example.com",
			auth,
		});
		const result = await client.request({ method: "GET", url: "/test" });

		expect(result).toEqual({ ok: true });
		expect(auth.clearToken).toHaveBeenCalledTimes(1);
		expect(auth.accessToken).toHaveBeenCalledTimes(2);
		expect(mockRequest).toHaveBeenCalledTimes(2);
		expect(mockRequest.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer tok_fresh",
				}),
			}),
		);
	});

	it("throws AuthenticationError on double 401", async () => {
		const auth = stubAuth(["tok_stale", "tok_also_stale"]);

		mockRequest
			.mockRejectedValueOnce(axiosError(401))
			.mockRejectedValueOnce(axiosError(401));

		const client = new HttpClient({
			baseURL: "https://api.example.com",
			auth,
		});

		await expect(
			client.request({ method: "GET", url: "/test" }),
		).rejects.toThrow(AuthenticationError);

		expect(auth.accessToken).toHaveBeenCalledTimes(2);
		expect(mockRequest).toHaveBeenCalledTimes(2);
	});

	it("maps 429 to RateLimitError", async () => {
		mockRequest.mockRejectedValueOnce(axiosError(429));

		const client = new HttpClient({
			baseURL: "https://api.example.com",
			auth: stubAuth(),
		});

		await expect(
			client.request({ method: "GET", url: "/test" }),
		).rejects.toThrow(RateLimitError);
	});

	it("maps other HTTP errors to CarrierApiError", async () => {
		mockRequest.mockRejectedValueOnce(axiosError(500));

		const client = new HttpClient({
			baseURL: "https://api.example.com",
			auth: stubAuth(),
		});

		await expect(
			client.request({ method: "GET", url: "/test" }),
		).rejects.toThrow(CarrierApiError);
	});

	it("maps network errors to CarrierApiError with status 0", async () => {
		mockRequest.mockRejectedValueOnce(networkError("ECONNREFUSED"));

		const client = new HttpClient({
			baseURL: "https://api.example.com",
			auth: stubAuth(),
		});

		try {
			await client.request({ method: "GET", url: "/test" });
			throw new Error("Expected error to be thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(CarrierApiError);
			expect((error as InstanceType<typeof CarrierApiError>).httpStatus).toBe(
				0,
			);
		}
	});
});
