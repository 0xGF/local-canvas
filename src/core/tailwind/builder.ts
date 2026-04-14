import type { TailwindToken } from "./parser.js";

export function buildClassName(tokens: TailwindToken[]): string {
  return tokens.map((t) => t.raw).join(" ");
}

export function replaceUtility(
  tokens: TailwindToken[],
  utility: string,
  newValue: string
): TailwindToken[] {
  const existing = tokens.findIndex((t) => t.utility === utility);

  const newRaw = newValue
    ? `${utility}-${newValue}`
    : utility;

  if (existing !== -1) {
    const updated = [...tokens];
    updated[existing] = {
      ...updated[existing],
      raw: newRaw,
      value: newValue,
    };
    return updated;
  }

  return [
    ...tokens,
    {
      raw: newRaw,
      utility,
      value: newValue,
      negative: false,
      arbitrary: false,
      category: "other",
    },
  ];
}

export function removeUtility(
  tokens: TailwindToken[],
  utility: string
): TailwindToken[] {
  return tokens.filter((t) => t.utility !== utility);
}
