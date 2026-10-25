import {Pool} from "pg";
import {PrismaPg } from "@prisma/adapter-pg";
   import { createRequire } from "module";
import dotenv from "dotenv";

dotenv.config();
   const require = createRequire(import.meta.url);
   const { PrismaClient } = require("../generated/prisma/index.js");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
})

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
    adapter
})

export default prisma;