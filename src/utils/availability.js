import { DateTime } from 'luxon'
import { USER_ORDER, USERS } from '../constants/timezones'
import { getDayWindow } from './dateTime'

function mergeIntervals(intervals) {
  if (intervals.length === 0) {
    return []
  }

  const sorted = [...intervals].sort((left, right) => left[0] - right[0])
  const merged = [sorted[0]]

  for (let index = 1; index < sorted.length; index += 1) {
    const [nextStart, nextEnd] = sorted[index]
    const last = merged[merged.length - 1]

    if (nextStart <= last[1]) {
      last[1] = Math.max(last[1], nextEnd)
      continue
    }

    merged.push([nextStart, nextEnd])
  }

  return merged
}

function invertIntervals(busyIntervals, dayMinutes = 1440) {
  if (busyIntervals.length === 0) {
    return [[0, dayMinutes]]
  }

  const freeIntervals = []
  let cursor = 0

  busyIntervals.forEach(([start, end]) => {
    if (start > cursor) {
      freeIntervals.push([cursor, start])
    }
    cursor = Math.max(cursor, end)
  })

  if (cursor < dayMinutes) {
    freeIntervals.push([cursor, dayMinutes])
  }

  return freeIntervals
}

function intersectIntervals(left, right) {
  const result = []
  let leftIndex = 0
  let rightIndex = 0

  while (leftIndex < left.length && rightIndex < right.length) {
    const [leftStart, leftEnd] = left[leftIndex]
    const [rightStart, rightEnd] = right[rightIndex]
    const overlapStart = Math.max(leftStart, rightStart)
    const overlapEnd = Math.min(leftEnd, rightEnd)

    if (overlapStart < overlapEnd) {
      result.push([overlapStart, overlapEnd])
    }

    if (leftEnd < rightEnd) {
      leftIndex += 1
    } else {
      rightIndex += 1
    }
  }

  return result
}

export function getSharedFreeWindows(events, dayISO, zone) {
  const { dayStart, dayEnd } = getDayWindow(dayISO, zone)
  const dayStartUtc = dayStart.toUTC()
  const dayEndUtc = dayEnd.toUTC()

  const busyByUser = USER_ORDER.reduce((accumulator, userId) => {
    const intervals = events
      .filter((event) => event.createdBy === userId || event.createdBy === 'appel')
      .map((event) => {
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
        const clippedEnd = DateTime.fromMillis(clippedEndMs, { zone: 'utc' }).setZone(
          zone
        )
        const startMinute = Math.max(
          Math.floor(clippedStart.diff(dayStart, 'minutes').minutes),
          0
        )
        const endMinute = Math.min(
          Math.ceil(clippedEnd.diff(dayStart, 'minutes').minutes),
          1440
        )

        return [startMinute, endMinute]
      })
      .filter(Boolean)

    return {
      ...accumulator,
      [userId]: mergeIntervals(intervals),
    }
  }, {})

  const canadaFree = invertIntervals(busyByUser.canada || [])
  const franceFree = invertIntervals(busyByUser.france || [])

  return intersectIntervals(canadaFree, franceFree).filter(
    ([start, end]) => end - start >= 30
  )
}

export function formatSharedWindow(dayISO, startMinute, endMinute, zone = USERS.canada.zone) {
  const dayStart = DateTime.fromISO(dayISO, { zone }).startOf('day')
  const start = dayStart.plus({ minutes: startMinute })
  const end = dayStart.plus({ minutes: endMinute })
  const montreal = USERS.canada.zone
  const grenoble = USERS.france.zone

  return {
    montreal: `${start.setZone(montreal).toFormat('HH:mm')} - ${end
      .setZone(montreal)
      .toFormat('HH:mm')}`,
    grenoble: `${start.setZone(grenoble).toFormat('HH:mm')} - ${end
      .setZone(grenoble)
      .toFormat('HH:mm')}`,
  }
}
