import { defineConfig } from '@adonisjs/core/bodyparser'

export default defineConfig({
  /**
   * The bodyparser will parse the following content-types using the
   * multipart parser.
   */
  multipart: {
    autoProcess: true,
    processManually: [],
    encoding: 'utf-8',
    limit: '50mb',
    types: ['multipart/form-data'],
  },

  /**
   * Configure the JSON parser to parse request body with one of the
   * following content types.
   */
  json: {
    encoding: 'utf-8',
    limit: '1mb',
    strict: true,
    types: [
      'application/json',
      'application/json-patch+json',
      'application/vnd.api+json',
      'application/csp-report',
    ],
  },

  /**
   * The URL encoded parser is used to parse the HTML form submission
   * request body.
   */
  form: {
    encoding: 'utf-8',
    limit: '1mb',
    queryString: {},
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * The raw parser is used to parse requests with raw body.
   */
  raw: {
    encoding: 'utf-8',
    limit: '1mb',
    types: ['text/*'],
  },
})
