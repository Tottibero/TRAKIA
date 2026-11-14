const MADRID_TIME_ZONE = 'Europe/Madrid'
const madridDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
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

function timezoneOffsetAt(epochMilliseconds) {
  const wholeSecond = Math.floor(epochMilliseconds / 1000) * 1000
  const parts = Object.fromEntries(
    madridDateTime.formatToParts(new Date(wholeSecond)).map(({ type, value }) => [type, value]),
  )
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return localAsUtc - wholeSecond
}

export function isPlanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = utcDate(value)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function getMadridCivilDate(now = new Date()) {
  const fields = dateFields(now instanceof Date ? now : new Date(now), MADRID_TIME_ZONE)
  return `${fields.year}-${fields.month}-${fields.day}`
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

export function getNextMadridMidnight(now = Date.now()) {
  const nextDate = addCivilDays(getMadridCivilDate(now), 1)
  const targetAsUtc = Date.parse(`${nextDate}T00:00:00.000Z`)
  let estimate = targetAsUtc
  for (let attempt = 0; attempt < 3; attempt += 1) {
    estimate = targetAsUtc - timezoneOffsetAt(estimate)
  }
  return estimate
}
