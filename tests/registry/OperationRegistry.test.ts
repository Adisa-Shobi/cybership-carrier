import { OperationNotFoundError } from "../../src/core/errors.js";
import type { ICarrierOperation } from "../../src/core/ICarrierOperation.js";
import { OperationRegistry } from "../../src/registry/OperationRegistry.js";

const stubOperation: ICarrierOperation<unknown, unknown> = {
	execute: async (input) => input,
};

describe("OperationRegistry", () => {
	it("resolves a registered operation and returns the same instance", () => {
		const registry = new OperationRegistry();
		registry.register("ups:rating", stubOperation);

		const resolved = registry.resolve("ups:rating");
		expect(resolved).toBe(stubOperation);
	});

	it("throws OperationNotFoundError for an unregistered key", () => {
		const registry = new OperationRegistry();

		expect(() => registry.resolve("fedex:rating")).toThrow(
			OperationNotFoundError,
		);
	});
});
