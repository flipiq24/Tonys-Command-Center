import { LinearClient } from "@linear/sdk";

let _linear: LinearClient | null = null;

export function getLinearClient(): LinearClient {
  if (!process.env.LINEAR_API_KEY) {
    throw new Error(
      "LINEAR_API_KEY is not set. Add your Linear personal API key to environment secrets.",
    );
  }
  if (!_linear) {
    _linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
  }
  return _linear;
}

export const linear = new Proxy({} as LinearClient, {
  get(_target, prop) {
    return (getLinearClient() as any)[prop];
  },
});
