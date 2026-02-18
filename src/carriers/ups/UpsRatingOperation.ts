import { CarrierApiError, ValidationError } from "../../core/errors.js";
import type { ICarrierOperation } from "../../core/ICarrierOperation.js";
import {
	type RateQuote,
	type RateRequest,
	RateRequestSchema,
} from "../../core/types.js";
import type { HttpClient } from "../../infra/HttpClient.js";
import { fromUpsResponse, toUpsRequest } from "./UpsMapper.js";
import { UpsRateResponseSchema } from "./ups.types.js";

export type UpsRequestOption =
	| "Rate"
	| "Shop"
	| "Ratetimeintransit"
	| "Shoptimeintransit";

export class UpsRatingOperation
	implements ICarrierOperation<RateRequest, RateQuote[]>
{
	constructor(
		private readonly http: HttpClient,
		private readonly requestOption: UpsRequestOption = "Shop",
	) {}

	async execute(input: RateRequest): Promise<RateQuote[]> {
		const parsed = RateRequestSchema.safeParse(input);
		if (!parsed.success) {
			throw new ValidationError(parsed.error.message);
		}

		const body = toUpsRequest(parsed.data);
		const data = await this.fetchRates(body);
		return fromUpsResponse(data.RateResponse.RatedShipment);
	}

	private async fetchRates(body: unknown) {
		try {
			const data = await this.http.request<unknown>({
				method: "POST",
				url: `/api/rating/v2409/${this.requestOption}`,
				data: body,
			});
			return UpsRateResponseSchema.parse(data);
		} catch (error) {
			if (error instanceof CarrierApiError) throw error;
			throw new CarrierApiError("UPS rating request failed", 0, undefined, {
				cause: error instanceof Error ? error : undefined,
			});
		}
	}
}
