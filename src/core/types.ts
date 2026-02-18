import { z } from "zod";

export const AddressSchema = z.object({
	line1: z.string().min(1),
	line2: z.string().optional(),
	city: z.string().min(1),
	stateCode: z.string().length(2),
	postalCode: z.string().min(1),
	countryCode: z.string().length(2),
});

export type Address = z.infer<typeof AddressSchema>;

export const PackageSchema = z.object({
	weightLbs: z.number().positive(),
	lengthIn: z.number().positive(),
	widthIn: z.number().positive(),
	heightIn: z.number().positive(),
});

export type Package = z.infer<typeof PackageSchema>;

export const RateRequestSchema = z.object({
	origin: AddressSchema,
	destination: AddressSchema,
	packages: z.array(PackageSchema).min(1),
});

export type RateRequest = z.infer<typeof RateRequestSchema>;

export const RateQuoteSchema = z.object({
	carrier: z.string().min(1),
	serviceCode: z.string().min(1),
	serviceName: z.string().min(1),
	totalChargeUSD: z.number().positive(),
	estimatedDeliveryDays: z.number().int().positive().optional(),
	guaranteedDeliveryDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

export type RateQuote = z.infer<typeof RateQuoteSchema>;
