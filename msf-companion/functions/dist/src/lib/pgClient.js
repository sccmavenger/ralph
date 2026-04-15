"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
const pg_1 = __importDefault(require("pg"));
let pool = null;
function getPool() {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error("DATABASE_URL environment variable is not set");
        }
        pool = new pg_1.default.Pool({
            connectionString,
            max: 5,
            ssl: { rejectUnauthorized: false },
        });
    }
    return pool;
}
//# sourceMappingURL=pgClient.js.map