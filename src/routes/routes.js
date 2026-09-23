import { health } from './health.js'
import { example } from './example.js'
import { bankDetails } from './bank-details.js'

export const routes = [health, bankDetails, ...example]
