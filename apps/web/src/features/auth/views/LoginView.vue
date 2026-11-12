<script setup lang="ts">
import { LoginRequestSchema } from '@trakia/contracts'
import { computed, ref } from 'vue'
import { ApiError } from '../../../shared/api/http'
import { useAuth } from '../useAuth'

const email = ref('')
const password = ref('')
const validationError = ref('')
const auth = useAuth()

const errorMessage = computed(() => {
  if (validationError.value) return validationError.value
  const error = auth.loginError.value
  if (error instanceof ApiError && error.status === 401) return 'El correo o la contraseña no son correctos.'
  if (error instanceof ApiError && error.status === 429)
    return 'Demasiados intentos. Espera un momento y vuelve a probar.'
  return error ? 'No se pudo iniciar sesión. Comprueba la conexión e inténtalo de nuevo.' : ''
})

async function submit() {
  validationError.value = ''
  const parsed = LoginRequestSchema.safeParse({ email: email.value.trim(), password: password.value })
  if (!parsed.success) {
    validationError.value = parsed.error.issues.some((issue) => issue.path.includes('email'))
      ? 'Escribe un correo electrónico válido.'
      : 'Escribe tu contraseña.'
    return
  }
  try {
    await auth.login(parsed.data)
  } catch {
    // The mutation state displays a safe, non-sensitive error.
  }
}
</script>

<template>
  <main class="login-shell">
    <section class="login-panel" aria-labelledby="login-title">
      <a class="brand" href="/" aria-label="TRAKIA">TRAKIA<span aria-hidden="true">.</span></a>
      <div class="login-copy">
        <h1 id="login-title">Vuelve a tu<br />ritmo.</h1>
        <p class="intro">Accede para continuar con tu entrenamiento.</p>
      </div>
      <form class="login-form" @submit.prevent="submit">
        <label for="email">Correo electrónico</label>
        <input id="email" v-model="email" type="email" autocomplete="username" inputmode="email" required />
        <label for="password">Contraseña</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required />
        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <button type="submit" :disabled="auth.isLoggingIn.value">
          {{ auth.isLoggingIn.value ? 'Comprobando…' : 'Entrar' }}
          <span aria-hidden="true">↗</span>
        </button>
      </form>
      <p class="private-note">
        <span aria-hidden="true">⌁</span> Acceso privado · tus datos, bajo tu control
      </p>
    </section>
    <aside class="login-art" aria-label="Entrenamiento con intención">
      <div class="art-caption"><span>01 / CONSTANCIA</span><span>FUERZA · RESISTENCIA · HYROX</span></div>
      <p class="art-quote">El progreso<br />se construye<br /><em>una sesión</em><br />a la vez.</p>
      <div class="art-mark" aria-hidden="true">T</div>
      <div class="art-bottom"><span>TRAKIA TRAINING LOG</span><span>EST. FOR YOUR NEXT REP</span></div>
    </aside>
  </main>
</template>
