import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("follow-up sweep", { minutes: 30 }, internal.followups.sweep, {});
crons.cron("evening nudge over iMessage", "0 2 * * *", internal.keiki.eveningDigest, {});
crons.cron("nightly insights", "30 10 * * *", internal.profiles.nightly, {});

export default crons;
