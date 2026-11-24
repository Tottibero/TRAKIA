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

function dateFields(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]))
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

export function getMadridCivilDate(now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now)
  const fields = dateFields(instant, MADRID_TIME_ZONE)
  return `${fields.year}-${fields.month}-${fields.day}`
}

export function getNextMadridMidnight(now = Date.now()) {
  const nextDate = addCivilDay(getMadridCivilDate(now))
  const targetAsUtc = Date.parse(`${nextDate}T00:00:00.000Z`)
  let estimate = targetAsUtc
  for (let attempt = 0; attempt < 3; attempt += 1) estimate = targetAsUtc - timezoneOffsetAt(estimate)
  return estimate
}

function addCivilDay(value) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
