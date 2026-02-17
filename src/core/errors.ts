export class AppError extends Error {
	constructor(
		public code: string,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = this.constructor.name;
	}
}

export class ValidationError extends AppError {
	constructor(message: string, options?: ErrorOptions) {
		super("VALIDATION_ERROR", message, options);
	}
}

export class AuthenticationError extends AppError {
	constructor(message: string, options?: ErrorOptions) {
		super("AUTHENTICATION_ERROR", message, options);
	}
}

export class OperationNotFoundError extends AppError {
	constructor(key: string) {
		super("OPERATION_NOT_FOUND", `No operation registered for "${key}"`);
	}
}

export class CarrierApiError extends AppError {
	constructor(
		message: string,
		public readonly httpStatus: number,
		public readonly carrierCode?: string,
		options?: ErrorOptions,
	) {
		super("CARRIER_API_ERROR", message, options);
	}
}

export class RateLimitError extends CarrierApiError {
	constructor(message = "Rate limit exceeded", options?: ErrorOptions) {
		super(message, 429, undefined, options);
		this.code = "RATE_LIMIT_ERROR";
	}
}
