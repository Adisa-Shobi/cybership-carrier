export interface ICarrierOperation<TInput, TOutput> {
	execute(input: TInput): Promise<TOutput>;
}
