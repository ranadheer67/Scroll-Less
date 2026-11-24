export function calculateReclaimedTime(currentMinutes, targetMinutes) {
  const perDay = Math.max(0, currentMinutes - targetMinutes)
  return { perDay, perWeek: perDay * 7, perMonth: perDay * 30, perYear: perDay * 365 }
}

export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (!hours) return `${remaining}m`
  if (!remaining) return `${hours}h`
  return `${hours}h ${remaining}m`
}
