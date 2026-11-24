<script setup lang="ts">
import { LoginRequestSchema } from '@trakia/contracts'
import { computed, ref } from 'vue'
import { ApiError } from '../../../shared/api/http'
import { useAuth } from '../useAuth'

const email = ref('')
const password = ref('')
const passwordVisible = ref(false)
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
  <main class="login-page" aria-labelledby="login-brand-name">
    <section class="login-content">
      <div class="login-brand">
        <img
          class="login-brand__mark"
          src="/brand/trackia.png"
          alt=""
          aria-hidden="true"
          width="1536"
          height="1024"
        />
        <h1 id="login-brand-name" class="login-brand__name">
          <span>TRAK</span><span class="login-brand__accent">IA</span>
        </h1>
      </div>
      <form class="login-form" @submit.prevent="submit">
        <label for="email">Correo electrónico</label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="username"
          inputmode="email"
          placeholder="nombre@ejemplo.com"
          required
        />
        <label for="password">Contraseña</label>
        <div class="login-password-field">
          <input
            id="password"
            v-model="password"
            :type="passwordVisible ? 'text' : 'password'"
            autocomplete="current-password"
            required
          />
          <button
            class="login-password-toggle"
            type="button"
            :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            :aria-pressed="passwordVisible"
            aria-controls="password"
            @click="passwordVisible = !passwordVisible"
          >
            <svg v-if="passwordVisible" viewBox="0 0 24 24" aria-hidden="true" fill="none">
              <path
                d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c5.6 0 9 7 9 7a16 16 0 0 1-2.3 3.1M6.2 6.2C3.9 7.8 3 12 3 12s3.4 7 9 7c1 0 2-.2 2.9-.6"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true" fill="none">
              <path
                d="M3 12s3.4-7 9-7 9 7 9 7-3.4 7-9 7-9-7-9-7Z"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
              />
              <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.7" />
            </svg>
          </button>
        </div>
        <p v-if="errorMessage" class="login-error" role="alert">{{ errorMessage }}</p>
        <button class="login-submit" type="submit" :disabled="auth.isLoggingIn.value">
          {{ auth.isLoggingIn.value ? 'Comprobando…' : 'Entrar' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: max(1.5rem, env(safe-area-inset-top)) max(1.25rem, env(safe-area-inset-right))
    max(1.5rem, env(safe-area-inset-bottom)) max(1.25rem, env(safe-area-inset-left));
  background: var(--trakia-background);
}

.login-content {
  width: min(100%, 25rem);
}

.login-brand {
  display: grid;
  justify-items: center;
  gap: 0.625rem;
  margin-bottom: 1.75rem;
}

.login-brand__mark {
  display: block;
  width: min(12rem, 68vw);
  height: auto;
}

.login-brand__name {
  margin: 0;
  color: var(--trakia-text);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  line-height: 1.2;
}

.login-brand__accent {
  color: var(--trakia-accent);
}

.login-form {
  display: grid;
  gap: 0.5rem;
}

.login-form label {
  margin-top: 0.5rem;
  color: var(--trakia-text-strong);
  font-size: 0.875rem;
  font-weight: 600;
}

.login-form label:not(:first-child) {
  margin-top: 0.625rem;
}

.login-form input {
  width: 100%;
  min-height: 3.125rem;
  border: 1px solid var(--trakia-border);
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-surface);
  padding: 0 0.875rem;
  color: var(--trakia-text);
  font: inherit;
  font-size: 1rem;
}

.login-password-field {
  position: relative;
}

.login-password-field input {
  padding-right: 3.75rem;
}

.login-password-toggle {
  position: absolute;
  top: 50%;
  right: 0.375rem;
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  transform: translateY(-50%);
  place-items: center;
  border: 0;
  border-radius: var(--trakia-radius-control);
  background: transparent;
  color: var(--trakia-muted);
  cursor: pointer;
  touch-action: manipulation;
}

.login-password-toggle:hover {
  color: var(--trakia-text);
}

.login-password-toggle svg {
  width: 1.25rem;
  height: 1.25rem;
}

.login-form input::placeholder {
  color: var(--trakia-muted-subtle);
  opacity: 1;
}

.login-form input:-webkit-autofill,
.login-form input:-webkit-autofill:hover,
.login-form input:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--trakia-text);
  caret-color: var(--trakia-accent);
  box-shadow: 0 0 0 1000px var(--trakia-surface) inset;
}

.login-form input:focus-visible {
  border-color: var(--trakia-focus);
  outline: 2px solid var(--trakia-focus);
  outline-offset: 2px;
}

.login-error {
  margin: 0.25rem 0;
  color: var(--trakia-danger);
  font-size: 0.875rem;
  line-height: 1.45;
}

.login-submit {
  width: 100%;
  min-height: 3.5rem;
  margin-top: 0.75rem;
  border: 0;
  border-radius: var(--trakia-radius-control);
  background: var(--trakia-accent-action);
  padding: 0 1rem;
  color: var(--trakia-accent-action-foreground);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 160ms ease;
}

.login-submit:hover:not(:disabled) {
  background: var(--trakia-accent-action-hover);
}

.login-submit:active:not(:disabled) {
  background: var(--trakia-accent-action-hover);
}

.login-submit:disabled {
  cursor: wait;
  opacity: 0.68;
}
</style>
