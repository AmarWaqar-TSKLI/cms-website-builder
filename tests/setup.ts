import { loadEnv } from "../src/lib/env";

// The worker, the seed, the verifier and the tests all boot outside Next, so
// they load .env themselves.
loadEnv();

process.env.ARTIFACTS_DIR ??= "./artifacts";
process.env.NEXT_PUBLIC_RUNTIME_API ??= "http://localhost:3000";
