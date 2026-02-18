import type {
	Address,
	Package,
	RateQuote,
	RateRequest,
} from "../../core/types.js";
import type { UpsRatedShipment, UpsRateRequest } from "./ups.types.js";

export function toUpsRequest(input: RateRequest): UpsRateRequest {
	return {
		RateRequest: {
			Request: {},
			Shipment: {
				Shipper: {
					Name: "Shipper",
					ShipperNumber: "",
					Address: toUpsAddress(input.origin),
				},
				ShipTo: {
					Name: "Recipient",
					Address: toUpsAddress(input.destination),
				},
				ShipFrom: {
					Name: "Sender",
					Address: toUpsAddress(input.origin),
				},
				NumOfPieces: String(input.packages.length),
				Package: input.packages.map(toUpsPackage),
			},
		},
	};
}

export function fromUpsResponse(shipments: UpsRatedShipment[]): RateQuote[] {
	return shipments.map((s) => {
		const quote: RateQuote = {
			carrier: "UPS",
			serviceCode: s.Service.Code,
			serviceName: s.Service.Description ?? s.Service.Code,
			totalChargeUSD: Number.parseFloat(s.TotalCharges.MonetaryValue),
		};

		const daysInTransit =
			s.GuaranteedDelivery?.BusinessDaysInTransit ??
			s.TimeInTransit?.ServiceSummary?.EstimatedArrival?.BusinessDaysInTransit;
		if (daysInTransit !== undefined) {
			quote.estimatedDeliveryDays = Number.parseInt(daysInTransit, 10);
		}

		const deliveryDate =
			s.GuaranteedDelivery?.ScheduledDeliveryDate ??
			s.TimeInTransit?.ServiceSummary?.EstimatedArrival?.Arrival?.Date;
		if (deliveryDate !== undefined) {
			quote.guaranteedDeliveryDate = deliveryDate;
		}

		return quote;
	});
}

function toUpsAddress(address: Address) {
	const lines = [address.line1];
	if (address.line2) lines.push(address.line2);
	return {
		AddressLine: lines,
		City: address.city,
		StateProvinceCode: address.stateCode,
		PostalCode: address.postalCode,
		CountryCode: address.countryCode,
	};
}

function toUpsPackage(pkg: Package) {
	return {
		PackagingType: { Code: "02", Description: "Package" },
		Dimensions: {
			UnitOfMeasurement: { Code: "IN" },
			Length: String(pkg.lengthIn),
			Width: String(pkg.widthIn),
			Height: String(pkg.heightIn),
		},
		PackageWeight: {
			UnitOfMeasurement: { Code: "LBS" },
			Weight: String(pkg.weightLbs),
		},
	};
}
