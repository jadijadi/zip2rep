/**
 * Main lookup service that routes to country-specific services
 */

import { lookupCanadaMP } from './canada'
import { lookupUSARepresentative } from './usa'
import type { ContactInfo } from '../types'

export interface LookupResponse {
  country: string
  postal_code: string
  representatives: ContactInfo[]
}

// Re-export ContactInfo to ensure it's recognized as used
export type { ContactInfo }

export async function lookupMP(country: string, postalCode: string): Promise<LookupResponse> {
  const countryUpper = country.toUpperCase().trim()
  let representatives = [] as ContactInfo[]

  switch (countryUpper) {
    case 'CA':
    case 'CAN':
    case 'CANADA':
      representatives = await lookupCanadaMP(postalCode)
      break
    case 'US':
    case 'USA':
    case 'UNITED STATES':
      representatives = await lookupUSARepresentative(postalCode)
      break
    default:
      throw new Error(
        `Country '${country}' is not supported. Supported countries: CA, US`
      )
  }

  if (representatives.length === 0) {
    throw new Error(
      `No representatives found for postal code '${postalCode}' in ${country}`
    )
  }

  return {
    country: countryUpper,
    postal_code: postalCode,
    representatives,
  }
}

export function getSupportedCountries() {
  return [
    { code: 'CA', name: 'Canada', format: 'Postal Code (e.g., K1A 0A6)' },
    { code: 'US', name: 'United States', format: 'Zip Code (e.g., 10001)' },
  ]
}
