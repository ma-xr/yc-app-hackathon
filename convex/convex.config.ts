import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/convex.config.js";
import authPassword from "@convex-dev/auth/components/password/convex.config.js";
import authUsername from "@convex-dev/auth/components/username/convex.config.js";

const app = defineApp({
  env: {
    OPENAI_API_KEY: v.optional(v.string()),
    OPENAI_DRAFT_MODEL: v.optional(v.string()),
    KEIKI_API_KEY: v.optional(v.string()),
    KEIKI_AGENT_ID: v.optional(v.string()),
    KEIKI_TOOL_SECRET: v.optional(v.string()),
    KEIKI_LINE_NUMBER: v.optional(v.string()),
    KEIKI_JOIN_CODE: v.optional(v.string()),
  },
});

app.use(auth);
app.use(authPassword);
app.use(authUsername);

export default app;
