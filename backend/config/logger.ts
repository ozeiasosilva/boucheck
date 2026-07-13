import env from '#start/env'
import { defineConfig } from '@adonisjs/core/logger'
import { logSerializers } from '../app/services/log_serializer.js'

export default defineConfig({
  default: 'app',

  loggers: {
    app: {
      enabled: true,
      name: 'boucheck',
      level: env.get('LOG_LEVEL', 'info'),
      transport: null,
      serializers: logSerializers,
    },
  },
})
