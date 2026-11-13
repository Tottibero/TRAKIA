import { ExerciseDefinitionSchema, ExerciseSchema, type Exercise } from './index.js'

const validDefinition = {
  key: 'barbell-squat',
  name: 'Barbell squat',
  category: 'strength',
  supportedMetrics: ['reps', 'weight'],
} as const

function expectValid(value: unknown, label: string): void {
  const result = ExerciseDefinitionSchema.safeParse(value)
  if (!result.success) throw new Error(`${label}: expected valid, got ${result.error.message}`)
}

function expectInvalid(value: unknown, label: string): void {
  if (ExerciseDefinitionSchema.safeParse(value).success) {
    throw new Error(`${label}: expected validation failure`)
  }
}

function test(label: string, run: () => void): void {
  run()
  console.log(`✓ ${label}`)
}

test('accepts a valid public exercise with UUID', () => {
  const exercise: Exercise = {
    ...validDefinition,
    supportedMetrics: [...validDefinition.supportedMetrics],
    id: '550e8400-e29b-41d4-a716-446655440000',
  }
  if (!ExerciseSchema.safeParse(exercise).success) throw new Error('Expected public exercise to pass')
})

test('accepts an importable definition without internal UUID', () => {
  expectValid(validDefinition, 'importable definition')
})

test('rejects invalid catalog keys', () => {
  expectInvalid({ ...validDefinition, key: 'Barbell Squat' }, 'invalid key')
})

test('rejects empty names', () => {
  expectInvalid({ ...validDefinition, name: '   ' }, 'empty name')
})

test('rejects unknown categories', () => {
  expectInvalid({ ...validDefinition, category: 'powerlifting' }, 'unknown category')
})

test('rejects duplicate and empty supported metrics', () => {
  expectInvalid({ ...validDefinition, supportedMetrics: ['reps', 'reps'] }, 'duplicate metrics')
  expectInvalid({ ...validDefinition, supportedMetrics: [] }, 'empty metrics')
})

test('allows external references to be omitted', () => {
  expectValid(validDefinition, 'optional references')
})

test('validates a positive integer wger reference', () => {
  expectValid({ ...validDefinition, externalReferences: [{ provider: 'wger', externalId: 12 }] }, 'wger')
  expectInvalid(
    { ...validDefinition, externalReferences: [{ provider: 'wger', externalId: 0 }] },
    'invalid wger id',
  )
})

test('validates supported YouTube video URLs', () => {
  expectValid(
    {
      ...validDefinition,
      externalReferences: [{ provider: 'youtube', videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk' }],
    },
    'YouTube URL',
  )
  expectInvalid(
    {
      ...validDefinition,
      externalReferences: [{ provider: 'youtube', videoUrl: 'https://example.com/watch?v=abcdefghijk' }],
    },
    'non-YouTube URL',
  )
})

test('detects duplicate YouTube videos across equivalent URL forms', () => {
  expectInvalid(
    {
      ...validDefinition,
      externalReferences: [
        { provider: 'youtube', videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk' },
        { provider: 'youtube', videoUrl: 'https://youtu.be/abcdefghijk' },
      ],
    },
    'duplicate video id',
  )
})

test('rejects multiple wger references', () => {
  expectInvalid(
    {
      ...validDefinition,
      externalReferences: [
        { provider: 'wger', externalId: 12 },
        { provider: 'wger', externalId: 13 },
      ],
    },
    'multiple wger references',
  )
})

test('exports schemas and inferred public types through the package entry point', () => {
  expectValid(validDefinition, 'public package export')
  if (!ExerciseSchema.safeParse({ ...validDefinition, id: '550e8400-e29b-41d4-a716-446655440000' }).success) {
    throw new Error('ExerciseSchema is not exported from the public entry point')
  }
})
