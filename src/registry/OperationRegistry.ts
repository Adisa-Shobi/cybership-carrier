import { OperationNotFoundError } from "../core/errors.js";
import type { ICarrierOperation } from "../core/ICarrierOperation.js";

export class OperationRegistry {
	private operations = new Map<string, ICarrierOperation<unknown, unknown>>();

	register(key: string, operation: ICarrierOperation<unknown, unknown>): void {
		this.operations.set(key, operation);
	}

	resolve<TInput, TOutput>(key: string): ICarrierOperation<TInput, TOutput> {
		const operation = this.operations.get(key);
		if (!operation) {
			throw new OperationNotFoundError(key);
		}
		return operation as ICarrierOperation<TInput, TOutput>;
	}
}
