<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { getHealth } from '../services/health'

const healthQuery = useQuery({
  queryKey: ['health'],
  queryFn: getHealth,
  retry: false,
})
</script>

<template>
  <main class="min-h-screen bg-[#10110f] px-5 py-8 text-stone-100 sm:px-10 sm:py-12">
    <div class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-between sm:min-h-[calc(100vh-6rem)]">
      <header class="flex items-center justify-between">
        <a class="text-sm font-semibold tracking-[0.24em] text-stone-100" href="/" aria-label="TRAKIA, inicio">TRAKIA</a>
        <span class="text-xs tracking-[0.16em] text-stone-500">ENTRENAMIENTO PERSONAL</span>
      </header>

      <section class="grid gap-12 py-20 md:grid-cols-[1.2fr_0.8fr] md:items-end md:py-28">
        <div>
          <p class="mb-6 text-xs font-medium uppercase tracking-[0.24em] text-lime-300">Tu espacio de entrenamiento</p>
          <h1 class="max-w-2xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-stone-50 sm:text-7xl">
            Entrena con intención. Registra tu progreso.
          </h1>
          <p class="mt-7 max-w-xl text-base leading-7 text-stone-400 sm:text-lg">
            Aplicación personal para planificar, ejecutar y registrar entrenamiento de fuerza, resistencia y HYROX.
          </p>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-7">
          <div class="flex items-center gap-3">
            <span class="relative flex size-2.5" aria-hidden="true">
              <span class="absolute inline-flex size-full animate-ping rounded-full bg-lime-300 opacity-50"></span>
              <span class="relative inline-flex size-2.5 rounded-full bg-lime-300"></span>
            </span>
            <p class="text-sm font-medium text-stone-100">Interfaz activa</p>
          </div>
          <div class="mt-7 border-t border-white/10 pt-5">
            <p class="text-xs uppercase tracking-[0.18em] text-stone-500">Conexión de servicio</p>
            <p v-if="healthQuery.isPending.value" class="mt-2 text-sm text-stone-300">Comprobando API…</p>
            <p v-else-if="healthQuery.isSuccess.value" class="mt-2 text-sm text-lime-300">API conectada</p>
            <p v-else class="mt-2 text-sm text-amber-300">API no disponible</p>
          </div>
        </div>
      </section>

      <footer class="flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
        <span>TRAKIA · Fuerza, resistencia y HYROX</span>
        <span>Un espacio privado para tu práctica</span>
      </footer>
    </div>
  </main>
</template>
