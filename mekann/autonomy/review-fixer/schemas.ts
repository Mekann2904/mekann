import { Type, type Static } from "@sinclair/typebox";

export const ReviewFixerParamsSchema = Type.Object({}, { description: "Review fixer は引数を取りません。issue / scope / model はすべて機械的に決定されます。" });

export type ReviewFixerParams = Static<typeof ReviewFixerParamsSchema>;
