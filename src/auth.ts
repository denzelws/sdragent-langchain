import { loadConfig } from "./config.js";
import { authorizeGmail } from "./gmail/auth.js";
import { logger } from "./utils/logger.js";

const config = loadConfig();

await authorizeGmail(config);
logger.info(`Gmail OAuth token saved to ${config.gmailTokenPath}`);
