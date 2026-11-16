import type { FunctionReturnType } from 'convex/server';

import type { api } from '../../../convex/_generated/api';

export type Day = NonNullable<FunctionReturnType<typeof api.insights.day>>;
export type Profile = FunctionReturnType<typeof api.insights.profile>;
export type Moment = FunctionReturnType<typeof api.insights.evidence>[number];
export type WeekDay = FunctionReturnType<typeof api.insights.week>[number];
export type Trait = Profile['interests'][number];
export type Lift = Profile['lifts'][number];
