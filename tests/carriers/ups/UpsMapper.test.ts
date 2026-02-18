import { describe, expect, it } from "@jest/globals";
import {
	fromUpsResponse,
	toUpsRequest,
} from "../../../src/carriers/ups/UpsMapper.js";
import type { UpsRatedShipment } from "../../../src/carriers/ups/ups.types.js";
import type { RateRequest } from "../../../src/core/types.js";

const RATE_REQUEST: RateRequest = {
	origin: {
		line1: "123 Main St",
		line2: "Suite 100",
		city: "TIMONIUM",
		stateCode: "MD",
		postalCode: "21093",
		countryCode: "US",
	},
	destination: {
		line1: "456 Oak Ave",
		city: "Alpharetta",
		stateCode: "GA",
		postalCode: "30005",
		countryCode: "US",
	},
	packages: [
		{ weightLbs: 5, lengthIn: 10, widthIn: 8, heightIn: 6 },
		{ weightLbs: 3, lengthIn: 4, widthIn: 4, heightIn: 4 },
	],
};

describe("toUpsRequest", () => {
	it("maps origin to Shipper and ShipFrom addresses", () => {
		const result = toUpsRequest(RATE_REQUEST);
		const { Shipper, ShipFrom } = result.RateRequest.Shipment;

		expect(Shipper.Address.AddressLine).toEqual(["123 Main St", "Suite 100"]);
		expect(Shipper.Address.City).toBe("TIMONIUM");
		expect(Shipper.Address.StateProvinceCode).toBe("MD");
		expect(Shipper.Address.PostalCode).toBe("21093");
		expect(Shipper.Address.CountryCode).toBe("US");
		expect(ShipFrom.Address).toEqual(Shipper.Address);
	});

	it("maps destination to ShipTo address", () => {
		const result = toUpsRequest(RATE_REQUEST);
		const { ShipTo } = result.RateRequest.Shipment;

		expect(ShipTo.Address.AddressLine).toEqual(["456 Oak Ave"]);
		expect(ShipTo.Address.City).toBe("Alpharetta");
		expect(ShipTo.Address.StateProvinceCode).toBe("GA");
	});

	it("maps packages with dimensions and weight as strings", () => {
		const result = toUpsRequest(RATE_REQUEST);
		const packages = result.RateRequest.Shipment.Package;

		expect(Array.isArray(packages)).toBe(true);
		const pkgs = packages as Array<(typeof packages & unknown[])[number]>;
		expect(pkgs).toHaveLength(2);

		const [first] = pkgs;
		expect(first.Dimensions.Length).toBe("10");
		expect(first.Dimensions.Width).toBe("8");
		expect(first.Dimensions.Height).toBe("6");
		expect(first.PackageWeight.Weight).toBe("5");
		expect(first.Dimensions.UnitOfMeasurement.Code).toBe("IN");
		expect(first.PackageWeight.UnitOfMeasurement.Code).toBe("LBS");
	});

	it("sets NumOfPieces to the package count", () => {
		const result = toUpsRequest(RATE_REQUEST);
		expect(result.RateRequest.Shipment.NumOfPieces).toBe("2");
	});
});

describe("fromUpsResponse", () => {
	const RATED_SHIPMENTS: UpsRatedShipment[] = [
		{
			Service: { Code: "03", Description: "UPS Ground" },
			TotalCharges: { CurrencyCode: "USD", MonetaryValue: "12.50" },
			GuaranteedDelivery: {
				BusinessDaysInTransit: "5",
				ScheduledDeliveryDate: "2025-06-15",
			},
		},
		{
			Service: { Code: "02", Description: "UPS 2nd Day Air" },
			TotalCharges: { CurrencyCode: "USD", MonetaryValue: "28.75" },
			TimeInTransit: {
				ServiceSummary: {
					EstimatedArrival: {
						BusinessDaysInTransit: "2",
					},
				},
			},
		},
		{
			Service: { Code: "01", Description: "UPS Next Day Air" },
			TotalCharges: { CurrencyCode: "USD", MonetaryValue: "45.00" },
		},
	];

	it("maps each RatedShipment to a RateQuote", () => {
		const quotes = fromUpsResponse(RATED_SHIPMENTS);
		expect(quotes).toHaveLength(3);
	});

	it("sets carrier to UPS and uses service description", () => {
		const [first] = fromUpsResponse(RATED_SHIPMENTS);
		expect(first.carrier).toBe("UPS");
		expect(first.serviceCode).toBe("03");
		expect(first.serviceName).toBe("UPS Ground");
	});

	it("parses totalChargeUSD as a number", () => {
		const [first] = fromUpsResponse(RATED_SHIPMENTS);
		expect(first.totalChargeUSD).toBe(12.5);
		expect(typeof first.totalChargeUSD).toBe("number");
	});

	it("extracts estimatedDeliveryDays from GuaranteedDelivery", () => {
		const [first] = fromUpsResponse(RATED_SHIPMENTS);
		expect(first.estimatedDeliveryDays).toBe(5);
	});

	it("falls back to TimeInTransit for estimatedDeliveryDays", () => {
		const [, second] = fromUpsResponse(RATED_SHIPMENTS);
		expect(second.estimatedDeliveryDays).toBe(2);
	});

	it("omits estimatedDeliveryDays when neither source is present", () => {
		const [, , third] = fromUpsResponse(RATED_SHIPMENTS);
		expect(third.estimatedDeliveryDays).toBeUndefined();
	});

	it("extracts guaranteedDeliveryDate from GuaranteedDelivery", () => {
		const [first] = fromUpsResponse(RATED_SHIPMENTS);
		expect(first.guaranteedDeliveryDate).toBe("2025-06-15");
	});

	it("falls back to service code when description is missing", () => {
		const quotes = fromUpsResponse([
			{
				Service: { Code: "99" },
				TotalCharges: { CurrencyCode: "USD", MonetaryValue: "10.00" },
			},
		]);
		const [first] = quotes;
		expect(first.serviceName).toBe("99");
	});
});
