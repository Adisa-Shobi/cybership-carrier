import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockRequest = jest.fn();

jest.unstable_mockModule("axios", () => ({
	default: {
		create: jest.fn(() => ({ request: mockRequest })),
		isAxiosError: jest.fn((err: unknown): err is Error => {
			return typeof err === "object" && err !== null && "isAxiosError" in err;
		}),
	},
}));

const { HttpClient } = await import("../../../src/infra/HttpClient.js");
const { UpsRatingOperation } = await import(
	"../../../src/carriers/ups/UpsRatingOperation.js"
);
const { ValidationError, CarrierApiError } = await import(
	"../../../src/core/errors.js"
);

const VALID_INPUT = {
	origin: {
		line1: "Friedrichstraße 43",
		city: "Berlin",
		stateCode: "BE",
		postalCode: "10117",
		countryCode: "DE",
	},
	destination: {
		line1: "8 Rue de Rivoli",
		city: "Paris",
		stateCode: "IF",
		postalCode: "75004",
		countryCode: "FR",
	},
	packages: [{ weightLbs: 5, lengthIn: 10, widthIn: 8, heightIn: 6 }],
};

function upsRateResponse(
	shipments: Array<{
		serviceCode: string;
		description: string;
		amount: string;
	}>,
) {
	return {
		data: {
			RateResponse: {
				Response: {
					ResponseStatus: { Code: "1", Description: "Success" },
				},
				RatedShipment: shipments.map((s) => ({
					Service: { Code: s.serviceCode, Description: s.description },
					TotalCharges: {
						CurrencyCode: "USD",
						MonetaryValue: s.amount,
					},
				})),
			},
		},
	};
}

const stubAuth = {
	accessToken: jest.fn<() => Promise<string>>().mockResolvedValue("tok"),
	clearToken: jest.fn<() => void>(),
};

beforeEach(() => {
	jest.clearAllMocks();
});

describe("UpsRatingOperation", () => {
	it("returns rate quotes from a successful response", async () => {
		mockRequest.mockResolvedValueOnce(
			upsRateResponse([
				{ serviceCode: "11", description: "UPS Standard", amount: "18.30" },
				{ serviceCode: "07", description: "UPS Express", amount: "42.60" },
			]),
		);

		const http = new HttpClient({
			baseURL: "https://wwwcie.ups.com",
			auth: stubAuth,
		});
		const operation = new UpsRatingOperation(http);
		const quotes = await operation.execute(VALID_INPUT);

		expect(quotes).toHaveLength(2);
		expect(quotes[0]).toEqual({
			carrier: "UPS",
			serviceCode: "11",
			serviceName: "UPS Standard",
			totalChargeUSD: 18.3,
		});
	});

	it("sends request to the Shop endpoint by default", async () => {
		mockRequest.mockResolvedValueOnce(
			upsRateResponse([
				{ serviceCode: "11", description: "UPS Standard", amount: "18.30" },
			]),
		);

		const http = new HttpClient({
			baseURL: "https://wwwcie.ups.com",
			auth: stubAuth,
		});
		const operation = new UpsRatingOperation(http);
		await operation.execute(VALID_INPUT);

		expect(mockRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				method: "POST",
				url: "/api/rating/v2409/Shop",
			}),
		);
	});

	it("uses the configured request option", async () => {
		mockRequest.mockResolvedValueOnce(
			upsRateResponse([
				{ serviceCode: "11", description: "UPS Standard", amount: "18.30" },
			]),
		);

		const http = new HttpClient({
			baseURL: "https://wwwcie.ups.com",
			auth: stubAuth,
		});
		const operation = new UpsRatingOperation(http, "Shoptimeintransit");
		await operation.execute(VALID_INPUT);

		expect(mockRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				url: "/api/rating/v2409/Shoptimeintransit",
			}),
		);
	});

	it("throws ValidationError for invalid input", async () => {
		const http = new HttpClient({
			baseURL: "https://wwwcie.ups.com",
			auth: stubAuth,
		});
		const operation = new UpsRatingOperation(http);

		await expect(operation.execute({} as any)).rejects.toThrow(ValidationError);
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it("wraps HTTP errors in CarrierApiError", async () => {
		const err = new Error("timeout") as any;
		err.isAxiosError = true;
		err.response = { status: 500 };
		mockRequest.mockRejectedValueOnce(err);

		const http = new HttpClient({
			baseURL: "https://wwwcie.ups.com",
			auth: stubAuth,
		});
		const operation = new UpsRatingOperation(http);

		await expect(operation.execute(VALID_INPUT)).rejects.toThrow(
			CarrierApiError,
		);
	});
});
