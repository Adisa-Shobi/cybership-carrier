import { z } from "zod";

// Request schemas

const UpsAddressSchema = z.object({
	AddressLine: z.array(z.string()),
	City: z.string(),
	StateProvinceCode: z.string(),
	PostalCode: z.string(),
	CountryCode: z.string(),
});

const UpsServiceSchema = z.object({
	Code: z.string(),
	Description: z.string().optional(),
});

const UpsPackageSchema = z.object({
	PackagingType: z.object({
		Code: z.string(),
		Description: z.string().optional(),
	}),
	Dimensions: z.object({
		UnitOfMeasurement: z.object({ Code: z.string() }),
		Length: z.string(),
		Width: z.string(),
		Height: z.string(),
	}),
	PackageWeight: z.object({
		UnitOfMeasurement: z.object({ Code: z.string() }),
		Weight: z.string(),
	}),
});

export const UpsRateRequestSchema = z.object({
	RateRequest: z.object({
		Request: z.object({
			TransactionReference: z
				.object({ CustomerContext: z.string().optional() })
				.optional(),
		}),
		Shipment: z.object({
			Shipper: z.object({
				Name: z.string(),
				ShipperNumber: z.string(),
				Address: UpsAddressSchema,
			}),
			ShipTo: z.object({ Name: z.string(), Address: UpsAddressSchema }),
			ShipFrom: z.object({ Name: z.string(), Address: UpsAddressSchema }),
			Service: UpsServiceSchema.optional(),
			NumOfPieces: z.string().optional(),
			Package: z.union([UpsPackageSchema, z.array(UpsPackageSchema)]),
		}),
	}),
});

export type UpsRateRequest = z.infer<typeof UpsRateRequestSchema>;

// Response schemas

const UpsMonetaryValueSchema = z.object({
	CurrencyCode: z.string(),
	MonetaryValue: z.string(),
});

const UpsRatedShipmentSchema = z.object({
	Service: UpsServiceSchema,
	TotalCharges: UpsMonetaryValueSchema,
	GuaranteedDelivery: z
		.object({
			BusinessDaysInTransit: z.string().optional(),
			ScheduledDeliveryDate: z.string().optional(),
		})
		.optional(),
	TimeInTransit: z
		.object({
			ServiceSummary: z
				.object({
					EstimatedArrival: z
						.object({
							BusinessDaysInTransit: z.string().optional(),
							Arrival: z.object({ Date: z.string().optional() }).optional(),
						})
						.optional(),
				})
				.optional(),
		})
		.optional(),
});

export const UpsRateResponseSchema = z.object({
	RateResponse: z.object({
		Response: z.object({
			ResponseStatus: z.object({
				Code: z.string(),
				Description: z.string(),
			}),
		}),
		RatedShipment: z.array(UpsRatedShipmentSchema),
	}),
});

export type UpsRateResponse = z.infer<typeof UpsRateResponseSchema>;
export type UpsRatedShipment = z.infer<typeof UpsRatedShipmentSchema>;
