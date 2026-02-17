import { z } from "zod";

const ConfigSchema = z.object({
	ups: z.object({
		clientId: z.string().min(1),
		clientSecret: z.string().min(1),
		baseUrl: z.string().url(),
	}),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
	return ConfigSchema.parse({
		ups: {
			clientId: process.env.UPS_CLIENT_ID,
			clientSecret: process.env.UPS_CLIENT_SECRET,
			baseUrl: process.env.UPS_BASE_URL,
		},
	});
}
