import dotenv from "dotenv"; dotenv.config();
import { createDb } from "../src/db/client";
import { createAuth } from "../src/lib/auth";
import * as schema from "../src/db/schema";
const db = createDb("file:./local.db");
const auth = createAuth(db, "", "", { secret: process.env.BETTER_AUTH_SECRET, baseURL: "http://localhost:4321" });
const r = await (auth.api as any).signUpEmail({ body: { email: "chk@local.test", password: "Sup3rS3cret!x", name: "chk" }, asResponse: false });
await db.insert(schema.userRoles).values({ userId: r.user.id, roleId: "role_admin", siteId: "site_default", assignedAt: new Date() }).onConflictDoNothing();
process.exit(0);
