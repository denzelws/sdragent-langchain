import { runSdrAgent } from "./agent/runSdrAgent.js";
import { applyCliOverrides, loadConfig } from "./config.js";

const config = applyCliOverrides(loadConfig(), process.argv.slice(2));

await runSdrAgent(config);
