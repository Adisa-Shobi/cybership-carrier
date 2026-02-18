import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const fixture = (name: string) =>
	JSON.parse(
		readFileSync(join(process.cwd(), "tests/fixtures", name), "utf-8"),
	);

const rateSuccess = fixture("ups-rate-success.json");

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
const { HttpClient } = await import("../src/infra/HttpClient.js");
const { UpsRatingOperation } = await import(
	"../src/carriers/ups/UpsRatingOperation.js"
);
const { CarrierApiError, RateLimitError, ValidationError } = await import(
	"../src/core/errors.js"
);

const stubAuth = {
	accessToken: jest.fn<() => Promise<string>>().mockResolvedValue("tok"),
	clearToken: jest.fn(),
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

function axiosError(status: number) {
	const err = new Error(`HTTP ${status}`) as any;
	err.isAxiosError = true;
	err.response = { status };
	return err;
}

let operation: InstanceType<typeof UpsRatingOperation>;

beforeEach(() => {
	jest.clearAllMocks();
	(mockedAxios.create as jest.Mock).mockReturnValue({ request: mockRequest });
	const http = new HttpClient({
		baseURL: "https://onlinetools.ups.com",
		auth: stubAuth,
	});
	operation = new UpsRatingOperation(http);
});

describe("UPS rating operation", () => {
	it("builds the correct UPS request payload from domain models", async () => {
		mockRequest.mockResolvedValueOnce({ data: rateSuccess });
		await operation.execute(VALID_REQUEST);

		const shipment = mockRequest.mock.calls[0]?.[0]?.data.RateRequest.Shipment;
		expect(shipment.Shipper.Address).toEqual({
			AddressLine: ["123 Main St"],
			City: "New York",
			StateProvinceCode: "NY",
			PostalCode: "10001",
			CountryCode: "US",
		});
		expect(shipment.ShipTo.Address.City).toBe("Los Angeles");
		expect(shipment.Package).toHaveLength(1);
		expect(shipment.Package[0].PackageWeight.Weight).toBe("5");
		expect(shipment.Package[0].Dimensions).toMatchObject({
			Length: "10",
			Width: "8",
			Height: "6",
		});
	});

	it("parses and normalizes a success response into RateQuote[]", async () => {
		mockRequest.mockResolvedValueOnce({ data: rateSuccess });
		const quotes = await operation.execute(VALID_REQUEST);

		expect(quotes).toHaveLength(3);
		expect(quotes).toEqual([
			expect.objectContaining({
				carrier: "UPS",
				serviceCode: "03",
				totalChargeUSD: 12.5,
			}),
			expect.objectContaining({
				carrier: "UPS",
				serviceCode: "02",
				totalChargeUSD: 27.35,
				estimatedDeliveryDays: 2,
			}),
			expect.objectContaining({
				carrier: "UPS",
				serviceCode: "01",
				totalChargeUSD: 45.6,
				estimatedDeliveryDays: 1,
				guaranteedDeliveryDate: "2026-02-20",
			}),
		]);
		// no UPS-specific PascalCase keys leaked into domain objects
		for (const q of quotes) {
			expect(Object.keys(q).every((k) => /^[a-z]/.test(k))).toBe(true);
		}
	});

	it("maps 4xx, 5xx, timeouts, and malformed responses to structured errors", async () => {
		// validation rejects before any HTTP call
		await expect(operation.execute({} as any)).rejects.toThrow(ValidationError);
		expect(mockRequest).not.toHaveBeenCalled();

		// 400 / 500 → CarrierApiError with correct status
		for (const status of [400, 500]) {
			mockRequest.mockRejectedValueOnce(axiosError(status));
			try {
				await operation.execute(VALID_REQUEST);
				throw new Error("Expected error");
			} catch (e: any) {
				expect(e).toBeInstanceOf(CarrierApiError);
				expect(e.httpStatus).toBe(status);
			}
		}

		// 429 → RateLimitError
		mockRequest.mockRejectedValueOnce(axiosError(429));
		await expect(operation.execute(VALID_REQUEST)).rejects.toThrow(
			RateLimitError,
		);

		// timeout (no response, like a real network timeout)
		const timeout = new Error("timeout of 10000ms exceeded") as any;
		timeout.isAxiosError = true;
		timeout.response = undefined;
		mockRequest.mockRejectedValueOnce(timeout);
		try {
			await operation.execute(VALID_REQUEST);
			throw new Error("Expected error");
		} catch (e: any) {
			expect(e).toBeInstanceOf(CarrierApiError);
			expect(e.httpStatus).toBe(0);
		}

		// malformed response (HTTP 200 but invalid body)
		mockRequest.mockResolvedValueOnce({ data: { garbage: true } });
		await expect(operation.execute(VALID_REQUEST)).rejects.toThrow(
			CarrierApiError,
		);
	});
});
