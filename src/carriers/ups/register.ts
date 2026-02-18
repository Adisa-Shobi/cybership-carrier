import type { Config } from "../../config.js";
import { HttpClient } from "../../infra/HttpClient.js";
import type { OperationRegistry } from "../../registry/OperationRegistry.js";
import { UpsAuthClient } from "./UpsAuthClient.js";
import { UpsRatingOperation } from "./UpsRatingOperation.js";

export function registerUpsCarrier(
	registry: OperationRegistry,
	config: Config,
): void {
	const auth = new UpsAuthClient(config.ups);
	const http = new HttpClient({ baseURL: config.ups.baseUrl, auth });

	registry.register("ups:rating", new UpsRatingOperation(http));
}
