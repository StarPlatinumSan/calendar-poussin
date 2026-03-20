import { DateTime } from 'luxon'

export function toUtcIsoFromLocal(dayISO, timeHHmm, sourceZone) {
  const localDateTime = DateTime.fromISO(`${dayISO}T${timeHHmm}`, {
    zone: sourceZone,
  })

  if (!localDateTime.isValid) {
    return null
  }

  return localDateTime.toUTC().toISO()
}

export function formatTimeInZone(utcISO, zone) {
  return DateTime.fromISO(utcISO, { zone: 'utc' }).setZone(zone).toFormat('HH:mm')
}

export function formatRangeInZone(startUTC, endUTC, zone) {
  const start = formatTimeInZone(startUTC, zone)
  const end = formatTimeInZone(endUTC, zone)
  return `${start} - ${end}`
}

export function toLocalDateTimeParts(utcISO, zone) {
  const local = DateTime.fromISO(utcISO, { zone: 'utc' }).setZone(zone)
  return {
    dayISO: local.toISODate(),
    timeHHmm: local.toFormat('HH:mm'),
  }
}

export function formatDayKeyInZone(utcISO, zone) {
  return DateTime.fromISO(utcISO, { zone: 'utc' }).setZone(zone).toISODate()
}

export function formatDayLabel(dayISO, zone) {
  return DateTime.fromISO(dayISO, { zone }).setLocale('fr').toFormat('cccc d LLL yyyy')
}

export function formatMonthLabel(monthCursor) {
  return monthCursor.setLocale('fr').toFormat('LLLL yyyy')
}

export function getDurationMinutes(startUTC, endUTC) {
  const start = DateTime.fromISO(startUTC, { zone: 'utc' })
  const end = DateTime.fromISO(endUTC, { zone: 'utc' })
  return Math.max(Math.round(end.diff(start, 'minutes').minutes), 0)
}

export function getDurationLabel(startUTC, endUTC) {
  const minutes = getDurationMinutes(startUTC, endUTC)
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60

  if (hours > 0 && remainder > 0) {
    return `${hours}h ${remainder}m`
  }

  if (hours > 0) {
    return `${hours}h`
  }

  return `${remainder}m`
}

export function getOffsetLabel(zone, date = DateTime.now()) {
  const offsetMinutes = date.setZone(zone).offset
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  const hours = Math.floor(absolute / 60)
  const minutes = absolute % 60
  return minutes === 0 ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${minutes}`
}

export function getDifferenceLabel(baseZone, targetZone, date = DateTime.now()) {
  const diffMinutes = date.setZone(targetZone).offset - date.setZone(baseZone).offset
  const hours = diffMinutes / 60
  const sign = hours >= 0 ? '+' : ''
  return `${sign}${hours}h`
}

export function buildMonthMatrix(monthCursor) {
  const first = monthCursor.startOf('month')
  const start = first.startOf('week')
  const end = first.endOf('month').endOf('week')
  const weeks = []
  let cursor = start

  while (cursor <= end) {
    const week = []

    for (let index = 0; index < 7; index += 1) {
      week.push(cursor)
      cursor = cursor.plus({ days: 1 })
    }

    weeks.push(week)
  }

  return weeks
}

export function getDayWindow(dayISO, zone) {
  const dayStart = DateTime.fromISO(dayISO, { zone }).startOf('day')
  return {
    dayStart,
    dayEnd: dayStart.plus({ days: 1 }),
  }
}

export function eventsForDay(events, dayISO, zone) {
  const { dayStart, dayEnd } = getDayWindow(dayISO, zone)
  const dayStartUtc = dayStart.toUTC()
  const dayEndUtc = dayEnd.toUTC()

  return events
    .filter((event) => {
      const startUtc = DateTime.fromISO(event.startUTC, { zone: 'utc' })
      const endUtc = DateTime.fromISO(event.endUTC, { zone: 'utc' })
      return endUtc > dayStartUtc && startUtc < dayEndUtc
    })
    .sort(
      (left, right) =>
        DateTime.fromISO(left.startUTC, { zone: 'utc' }).toMillis() -
        DateTime.fromISO(right.startUTC, { zone: 'utc' }).toMillis()
    )
}

export function clipEventToDay(event, dayISO, zone) {
  const { dayStart, dayEnd } = getDayWindow(dayISO, zone)
  const dayStartUtc = dayStart.toUTC()
  const dayEndUtc = dayEnd.toUTC()
  const startUtc = DateTime.fromISO(event.startUTC, { zone: 'utc' })
  const endUtc = DateTime.fromISO(event.endUTC, { zone: 'utc' })

  if (endUtc <= dayStartUtc || startUtc >= dayEndUtc) {
    return null
  }

  const clippedStartMs = Math.max(startUtc.toMillis(), dayStartUtc.toMillis())
  const clippedEndMs = Math.min(endUtc.toMillis(), dayEndUtc.toMillis())
  const clippedStart = DateTime.fromMillis(clippedStartMs, { zone: 'utc' }).setZone(
    zone
  )
  const clippedEnd = DateTime.fromMillis(clippedEndMs, { zone: 'utc' }).setZone(zone)

  return {
    startMinute: Math.max(
      Math.floor(clippedStart.diff(dayStart, 'minutes').minutes),
      0
    ),
    endMinute: Math.min(Math.ceil(clippedEnd.diff(dayStart, 'minutes').minutes), 1440),
  }
}
