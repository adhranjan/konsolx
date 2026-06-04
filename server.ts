import "dotenv/config";
import { startServer } from "./server/index.js";

startServer().catch(console.error);
