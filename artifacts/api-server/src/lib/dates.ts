const LA_TZ = "America/Los_Angeles";

export function todayPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: LA_TZ });
}
