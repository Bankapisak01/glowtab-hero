export const DEFAULT_LED_BRIGHTNESS = 150;
export function normalizeLedBrightness(value) {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  )
    return DEFAULT_LED_BRIGHTNESS;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(300, Math.max(0, Math.round(number / 10) * 10))
    : DEFAULT_LED_BRIGHTNESS;
}
