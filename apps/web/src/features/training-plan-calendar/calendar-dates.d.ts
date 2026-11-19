import type { PlanDate } from '@trakia/contracts'

export function isPlanDate(value: unknown): value is PlanDate
export function getMadridCivilDate(now?: Date | number): PlanDate
export function addCivilDays(value: PlanDate, amount: number): PlanDate
export function mondayOfCivilWeek(value: PlanDate): PlanDate
export function getWeekDates(monday: PlanDate): PlanDate[]
export function parseWeekStart(queryValue: unknown): PlanDate | undefined
export function resolveExpandedDates(queryValue: unknown, weekStart: PlanDate, today: PlanDate): PlanDate[]
export function serializeExpandedDates(values: PlanDate[]): PlanDate[] | ''
export function formatDayHeading(value: PlanDate): string
export function formatDayAbbreviation(value: PlanDate): string
export function formatWeekRange(from: PlanDate, to: PlanDate): string
export function formatCompactWeekRange(from: PlanDate, to: PlanDate): string
export function getNextMadridMidnight(now?: number): number
