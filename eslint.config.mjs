// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import eslintConfigPrettier from 'eslint-config-prettier'

// @nuxt/eslint generates a project-aware flat config in .nuxt; we extend it and
// disable stylistic rules that conflict with Prettier.
export default withNuxt(eslintConfigPrettier).append({
  ignores: ['.output/**', '.nuxt/**', 'dist/**', 'node_modules/**'],
})
