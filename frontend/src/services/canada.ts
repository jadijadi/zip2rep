/**
 * Canadian MP lookup service.
 * Uses the Parliament of Canada API and postal code lookup services.
 */

import type { ContactInfo } from '../types'

function validateCanadianPostalCode(postalCode: string): [boolean, string] {
  // Remove spaces and convert to uppercase
  const normalized = postalCode.replace(/[\s-]/g, '').toUpperCase()

  // Check length
  if (normalized.length !== 6) {
    return [false, normalized]
  }

  // Check pattern: Letter-Digit-Letter-Digit-Letter-Digit
  const pattern = /^[A-Z][0-9][A-Z][0-9][A-Z][0-9]$/

  if (!pattern.test(normalized)) {
    return [false, normalized]
  }

  // Additional validation: Check for invalid first letters
  const invalidFirstLetters = new Set(['D', 'F', 'I', 'O', 'Q', 'U', 'W', 'Z'])
  if (invalidFirstLetters.has(normalized[0])) {
    return [false, normalized]
  }

  // Additional validation: Check for invalid third/fifth letters
  const invalidLetters = new Set(['D', 'F', 'I', 'O', 'Q', 'U'])
  if (invalidLetters.has(normalized[2]) || invalidLetters.has(normalized[4])) {
    return [false, normalized]
  }

  return [true, normalized]
}

export async function lookupCanadaMP(postalCode: string): Promise<ContactInfo[]> {
  // Validate postal code format
  const [isValid, normalizedPostal] = validateCanadianPostalCode(postalCode)

  if (!isValid) {
    throw new Error(
      `Invalid Canadian postal code format: '${postalCode}'. ` +
      `Expected format: Letter-Digit-Letter Digit-Letter-Digit (e.g., K1A 0A6, M5H 2N2)`
    )
  }

  // Format with space for display/API calls
  const formattedPostal = `${normalizedPostal.slice(0, 3)} ${normalizedPostal.slice(3)}`
  const representatives: ContactInfo[] = []

  try {
    // Use Represent API (by OpenNorth) - free service for postal code to MP lookup
    const representUrl = `https://represent.opennorth.ca/postcodes/${normalizedPostal}/`

    try {
      const response = await fetch(representUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()

        // Represent API structure: check both 'representatives_centroid' and 'representatives_concordance'
        const repsData: any[] = []
        if (data.representatives_centroid) {
          repsData.push(...data.representatives_centroid)
        }
        if (data.representatives_concordance) {
          repsData.push(...data.representatives_concordance)
        }

        // Filter for federal representatives (MPs)
        for (const rep of repsData) {
          const repType = (rep.elected_office || '').toLowerCase()
          const level = (rep.level || '').toLowerCase()

          if (
            repType.includes('member of parliament') ||
            level === 'federal' ||
            repType.includes('mp')
          ) {
            const ridingName = rep.district_name || rep.riding_name || ''
            const repName = rep.name || ''
            const party = rep.party_name || ''

            // Try to get more details from OpenParliament API for better contact info
            let mpDetails: any = null
            if (ridingName) {
              try {
                const openparliamentUrl = new URL('https://api.openparliament.ca/members/')
                openparliamentUrl.searchParams.set('riding', ridingName)
                openparliamentUrl.searchParams.set('limit', '1')

                const mpResponse = await fetch(openparliamentUrl.toString(), {
                  method: 'GET',
                  headers: {
                    'Accept': 'application/json',
                  },
                })

                if (mpResponse.ok) {
                  const mpData = await mpResponse.json()
                  if (mpData.objects && mpData.objects.length > 0) {
                    mpDetails = mpData.objects[0]
                  }
                }
              } catch (e) {
                // Ignore errors from OpenParliament API
              }
            }

            // Build contact info, preferring OpenParliament data when available
            const contact: ContactInfo = {
              name: repName || (mpDetails?.name || 'MP Information'),
              role: 'Member of Parliament',
              riding: ridingName || (mpDetails?.riding || ''),
              party: party || (mpDetails?.party || '') || null,
              email: rep.email || mpDetails?.email || null,
              website: rep.url || rep.website || mpDetails?.website || null,
              phone: rep.tel || rep.phone || mpDetails?.phone || null,
              address: rep.office || rep.postal || null,
            }
            representatives.push(contact)
          }
        }

        if (representatives.length > 0) {
          return representatives
        }

        // If Represent API didn't return federal reps, try alternative endpoint
        if (representatives.length === 0 && response.ok) {
          const boundary = data.boundaries_centroid || []
          if (boundary.length > 0) {
            const boundaryId = boundary[0].boundary_set_name
            if (boundaryId) {
              try {
                const boundaryUrl = `https://represent.opennorth.ca/boundaries/${boundaryId}/`
                const boundaryResponse = await fetch(boundaryUrl, {
                  method: 'GET',
                  headers: {
                    'Accept': 'application/json',
                  },
                })

                if (boundaryResponse.ok) {
                  const boundaryData = await boundaryResponse.json()
                  const boundaryRepsData = boundaryData.representatives_centroid || []

                  for (const rep of boundaryRepsData) {
                    const repType = (rep.elected_office || '').toLowerCase()
                    if (
                      repType.includes('member of parliament') ||
                      rep.level === 'federal'
                    ) {
                      representatives.push({
                        name: rep.name || '',
                        role: 'Member of Parliament',
                        riding: rep.district_name || '',
                        party: rep.party_name || null,
                        email: rep.email || null,
                        website: rep.url || null,
                        phone: rep.tel || null,
                      })
                    }
                  }

                  if (representatives.length > 0) {
                    return representatives
                  }
                }
              } catch (e) {
                // Ignore boundary lookup errors
              }
            }
          }
        }
      } else if (response.status === 404) {
        throw new Error(
          `Postal code '${formattedPostal}' not found. ` +
          `Please verify the postal code is correct.`
        )
      } else {
        throw new Error(`Error from Represent API: ${response.status} ${response.statusText}`)
      }
    } catch (error: any) {
      if (error.message && error.message.includes('not found')) {
        throw error
      }
      throw new Error(
        `Unable to lookup postal code '${formattedPostal}'. ` +
        `Represent API may be unavailable. Error: ${error.message || error}`
      )
    }

    // If we still don't have results
    if (representatives.length === 0) {
      throw new Error(
        `No MP found for postal code '${formattedPostal}'. ` +
        `Please verify the postal code is correct and try again.`
      )
    }
  } catch (error: any) {
    if (error.message) {
      throw error
    }
    throw new Error(`Error connecting to Parliament API: ${error.message || error}`)
  }

  return representatives
}
