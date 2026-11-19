export { getMadridCivilDate, getNextMadridMidnight } from '../../shared/utils/madrid-civil-date.js'

const compactWeekDate = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
function utcDate(value) {
  return new Date(`${value}T00:00:00.000Z`)
}

function dateFields(date, timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]))
}

function firstString(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.find((item) => typeof item === 'string')
  return undefined
}

export function isPlanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = utcDate(value)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function addCivilDays(value, amount) {
  if (!isPlanDate(value) || !Number.isInteger(amount)) {
    throw new RangeError('Expected a civil date and an integer day offset.')
  }
  const date = utcDate(value)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function mondayOfCivilWeek(value) {
  if (!isPlanDate(value)) throw new RangeError('Expected a valid civil date.')
  const weekday = utcDate(value).getUTCDay()
  return addCivilDays(value, weekday === 0 ? -6 : 1 - weekday)
}

export function getWeekDates(monday) {
  if (!isPlanDate(monday) || utcDate(monday).getUTCDay() !== 1) {
    throw new RangeError('Expected a Monday civil date.')
  }
  return Array.from({ length: 7 }, (_, index) => addCivilDays(monday, index))
}

export function parseWeekStart(queryValue) {
  const value = firstString(queryValue)
  if (!isPlanDate(value)) return undefined
  return utcDate(value).getUTCDay() === 1 ? value : undefined
}

export function resolveExpandedDates(queryValue, weekStart, today) {
  if (!isPlanDate(weekStart) || utcDate(weekStart).getUTCDay() !== 1) return []
  const validDates = new Set(getWeekDates(weekStart))
  if (queryValue === undefined) return validDates.has(today) ? [today] : []

  const values = Array.isArray(queryValue) ? queryValue : [queryValue]
  return [...new Set(values.filter((value) => typeof value === 'string' && validDates.has(value)))].sort()
}

export function serializeExpandedDates(values) {
  const dates = [...new Set(values.filter(isPlanDate))].sort()
  return dates.length > 0 ? dates : ''
}

export function formatDayHeading(value) {
  const date = utcDate(value)
  const parts = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(date)
  const weekday = parts.find(({ type }) => type === 'weekday')?.value ?? ''
  const day = parts.find(({ type }) => type === 'day')?.value ?? ''
  return `${weekday.charAt(0).toLocaleUpperCase('es-ES')}${weekday.slice(1)}, ${day}`
}

export function formatDayAbbreviation(value) {
  const date = utcDate(value)
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', timeZone: 'UTC' }).format(date).replace('.', '')
}

export function formatWeekRange(from, to) {
  const start = utcDate(from)
  const end = utcDate(to)
  const startParts = dateFields(start)
  const endParts = dateFields(end)
  const startDay = Number(startParts.day)
  const endDay = Number(endParts.day)
  const startMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(start)
  const endMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(end)

  if (startParts.year === endParts.year && startParts.month === endParts.month) {
    return `${startDay}–${endDay} de ${startMonth} de ${endParts.year}`
  }
  if (startParts.year === endParts.year) {
    return `${startDay} de ${startMonth} – ${endDay} de ${endMonth} de ${endParts.year}`
  }
  return `${startDay} de ${startMonth} de ${startParts.year} – ${endDay} de ${endMonth} de ${endParts.year}`
}

export function formatCompactWeekRange(from, to) {
  const start = utcDate(from)
  const end = utcDate(to)
  const startParts = dateFields(start)
  const endParts = dateFields(end)
  const startLabel = compactWeekDate.format(start).replace(/\.$/, '')
  const endLabel = compactWeekDate.format(end).replace(/\.$/, '')

  if (startParts.year !== endParts.year) {
    return `${startLabel} ${startParts.year} — ${endLabel} ${endParts.year}`
  }
  return `${startLabel} — ${endLabel}`
}
