import { defineConfig } from '@adonisjs/cors'

/**
 * CORS configuration for the BouCheck API.
 *
 * In production only the frontend origin (https://boucheck.beonup.com.br)
 * is allowed. In development, all origins are permitted to avoid issues
 * with localhost port variations.
 *
 * Credentials are enabled so that cookies/auth headers are accepted cross-origin.
 *
 * Validates: Requirement 11.2
 */
const isDev = process.env.NODE_ENV !== 'production'

const corsConfig = defineConfig({
  enabled: true,
  origin: isDev ? true : ['https://boucheck.beonup.com.br'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
