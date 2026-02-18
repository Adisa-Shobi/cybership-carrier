import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type axios from "axios";

const tokenFixture = JSON.parse(
	readFileSync(
		join(process.cwd(), "tests/fixtures/ups-token-success.json"),
		"utf-8",
	),
);
const rateSuccess = JSON.parse(
	readFileSync(
		join(process.cwd(), "tests/fixtures/ups-rate-success.json"),
		"utf-8",
	),
);

const mockRequest = jest.fn();

jest.unstable_mockModule("axios", () => ({
	default: {
		post: jest.fn(),
		create: jest.fn(() => ({ request: mockRequest })),
		isAxiosError: jest.fn((err: unknown): err is Error => {
			return typeof err === "object" && err !== null && "isAxiosError" in err;
		}),
	},
}));

const { default: mockedAxios } = await import("axios");
const mockedPost = mockedAxios.post as jest.MockedFunction<typeof axios.post>;

const { UpsAuthClient } = await import("../src/carriers/ups/UpsAuthClient.js");
const { HttpClient } = await import("../src/infra/HttpClient.js");
const { UpsRatingOperation } = await import(
	"../src/carriers/ups/UpsRatingOperation.js"
);

const UPS_CONFIG = {
	clientId: "test-client-id",
	clientSecret: "test-client-secret",
	baseUrl: "https://onlinetools.ups.com",
};

const VALID_REQUEST = {
	origin: {
		line1: "123 Main St",
		city: "New York",
		stateCode: "NY",
		postalCode: "10001",
		countryCode: "US",
	},
	destination: {
		line1: "456 Oak Ave",
		city: "Los Angeles",
		stateCode: "CA",
		postalCode: "90001",
		countryCode: "US",
	},
	packages: [{ weightLbs: 5, lengthIn: 10, widthIn: 8, heightIn: 6 }],
};

beforeEach(() => {
	jest.clearAllMocks();
	(mockedAxios.create as jest.Mock).mockReturnValue({ request: mockRequest });
});

describe("auth token lifecycle", () => {
	it("acquires a token, reuses it from cache, and refreshes on expiry", async () => {
		// first token has a 61s TTL (minus 60s buffer = 1s effective)
		mockedPost
			.mockResolvedValueOnce({
				data: { ...tokenFixture, expires_in: "61" },
			} as any)
			.mockResolvedValueOnce({
				data: { ...tokenFixture, access_token: "tok_refreshed" },
			} as any);
		mockRequest.mockResolvedValue({ data: rateSuccess });

		const auth = new UpsAuthClient(UPS_CONFIG);
		const http = new HttpClient({ baseURL: UPS_CONFIG.baseUrl, auth });
		const operation = new UpsRatingOperation(http);

		// acquire — first call fetches a token and completes a rate request
		await operation.execute(VALID_REQUEST);
		expect(mockedPost).toHaveBeenCalledTimes(1);

		// reuse — second call uses the cached token, no new auth request
		await operation.execute(VALID_REQUEST);
		expect(mockedPost).toHaveBeenCalledTimes(1);

		// refresh — advance past expiry, next call fetches a fresh token
		jest.spyOn(Date, "now").mockReturnValue(Date.now() + 2000);
		await operation.execute(VALID_REQUEST);
		expect(mockedPost).toHaveBeenCalledTimes(2);
		expect(mockRequest.mock.calls[2]?.[0].headers.Authorization).toBe(
			"Bearer tok_refreshed",
		);

		jest.restoreAllMocks();
	});
});
