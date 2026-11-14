function exerciseName(exercise) {
  return exercise.name ?? 'Nombre no disponible'
}

function durationLabel(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes} min`
  if (minutes === 0) return `${remainingSeconds} s`
  return `${minutes} min ${remainingSeconds} s`
}

export function describeCalendarBlock(block) {
  if (block.type === 'sets') {
    return {
      heading: 'Series',
      items: block.exercises.map(({ exercise, sets }) => ({
        name: exerciseName(exercise),
        detail: `${sets} ${sets === 1 ? 'serie' : 'series'}`,
      })),
    }
  }

  if (block.type === 'circuit' && block.mode === 'rounds') {
    return {
      heading: `Circuito · ${block.rounds} ${block.rounds === 1 ? 'ronda' : 'rondas'}`,
      items: block.exercises.map(({ exercise }) => ({ name: exerciseName(exercise), detail: '' })),
    }
  }

  if (block.type === 'circuit') {
    return {
      heading: `AMRAP · ${durationLabel(block.maxDurationSeconds)}`,
      items: block.exercises.map(({ exercise }) => ({ name: exerciseName(exercise), detail: '' })),
    }
  }

  return {
    heading: `Intervalos · ${block.cycles} ${block.cycles === 1 ? 'ciclo' : 'ciclos'}`,
    items: block.phases.map((phase) => ({
      name: phase.exercise ? exerciseName(phase.exercise.exercise) : 'Descanso sin ejercicio',
      detail:
        phase.type === 'work'
          ? `Trabajo · ${durationLabel(phase.windowSeconds)}`
          : phase.exercise
            ? `Recuperación activa · ${durationLabel(phase.windowSeconds)}`
            : `Descanso · ${durationLabel(phase.windowSeconds)}`,
    })),
  }
}
