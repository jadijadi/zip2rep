/**
 * US Representative lookup service.
 * Uses the Whoismyrepresentative.com API and 5 Calls API for ZIP code to Representative lookup.
 */

import type { ContactInfo } from '../types'

function validateUSZipCode(zipCode: string): [boolean, string] {
  // Remove spaces, dashes, and any other characters
  const normalized = zipCode.replace(/[^\d]/g, '')

  // Check length - should be 5 digits (we'll use first 5 if longer)
  if (normalized.length < 5) {
    return [false, normalized]
  }

  // Extract first 5 digits for validation
  const zip5 = normalized.slice(0, 5)

  // Check that first 5 digits are all numeric
  if (!/^\d+$/.test(zip5)) {
    return [false, normalized]
  }

  // ZIP codes cannot start with 00000
  if (zip5 === '00000') {
    return [false, normalized]
  }

  return [true, zip5]
}

export async function lookupUSARepresentative(zipCode: string): Promise<ContactInfo[]> {
  // Validate ZIP code format
  const [isValid, normalizedZip] = validateUSZipCode(zipCode)

  if (!isValid) {
    throw new Error(
      `Invalid US ZIP code format: '${zipCode}'. ` +
      `Expected format: 5 digits (e.g., 90210) or 5+4 format (e.g., 90210-1234)`
    )
  }

  const representatives: ContactInfo[] = []

  try {
    // Use Whoismyrepresentative.com API - free service for ZIP code to Representative lookup
    const apiUrl = new URL('https://whoismyrepresentative.com/getall_mems.php')
    apiUrl.searchParams.set('zip', normalizedZip)
    apiUrl.searchParams.set('output', 'json')

    try {
      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (response.ok) {
        let data: any
        try {
          data = await response.json()
        } catch (jsonError: any) {
          const responseText = await response.text()
          throw new Error(
            `Invalid JSON response from API. Response: ${responseText.slice(0, 500)}. ` +
            `JSON error: ${jsonError.message || jsonError}`
          )
        }

        // API returns data in 'results' key (or might be direct array)
        let repsData: any[] = []
        if (Array.isArray(data)) {
          repsData = data
        } else if (typeof data === 'object') {
          repsData = data.results || data.representatives || data.data || []
        }

        // Filter for House of Representatives members only
        for (const rep of repsData) {
          if (typeof rep !== 'object') {
            continue
          }

          const name = rep.name || rep.Name || ''
          const officeField = String(rep.office || rep.Office || '').toLowerCase()
          const district = String(rep.district || rep.District || '').trim()
          const state = rep.state || rep.State || ''

          // Skip if no name
          if (!name) {
            continue
          }

          // Skip Senators - they represent entire states, not districts
          const isSenator =
            officeField.includes('senator') ||
            officeField.includes('senate') ||
            (rep.title || '').toLowerCase() === 'senator' ||
            (rep.Title || '').toLowerCase() === 'senator'

          if (isSenator) {
            continue
          }

          // Identify Representatives
          const isRepByTitle =
            officeField.includes('representative') ||
            officeField.includes('house') ||
            (rep.title || '').toLowerCase() === 'representative' ||
            (rep.Title || '').toLowerCase() === 'representative'

          let isRepresentative = false

          if (district && !['', 'none', 'n/a'].includes(district.toLowerCase())) {
            // Has a district number - this is a Representative
            isRepresentative = true
          } else if (isRepByTitle) {
            // Title explicitly says representative
            isRepresentative = true
          } else if (state && !isSenator) {
            // If we have a state and it's not a senator, assume it's a rep
            isRepresentative = true
          }

          if (isRepresentative) {
            const party = rep.party || rep.Party || ''
            const phone = rep.phone || rep.Phone || ''
            let officeAddress = rep.office || rep.Office || ''
            // If office field looks like office type rather than address, try other fields
            if (['representative', 'senator', 'house', 'senate'].includes(officeAddress.toLowerCase())) {
              officeAddress = rep.address || rep.Address || ''
            }
            const website = rep.link || rep.Link || rep.website || rep.Website || ''

            // Check for email in various possible fields (though APIs typically don't provide it)
            const email =
              rep.email ||
              rep.Email ||
              rep.email_address ||
              rep.EmailAddress ||
              null

            // Format district information
            let districtStr = ''
            if (district && !['at-large', 'at large', 'none', 'n/a', ''].includes(district.toLowerCase())) {
              districtStr = state ? `${state}-${district}` : district
            } else if (state) {
              districtStr = `${state}-At-Large`
            }

            representatives.push({
              name,
              role: 'Member of the House of Representatives',
              district: districtStr || null,
              party: party || null,
              email,
              website: website || null,
              phone: phone || null,
              address: officeAddress || null,
            })
          }
        }

        if (representatives.length > 0) {
          return representatives
        }

        // If no results found
        if (repsData.length === 0) {
          throw new Error(
            `No data returned for ZIP code '${normalizedZip}'. ` +
            `The API returned an empty result set. Please verify the ZIP code is correct.`
          )
        } else {
          throw new Error(
            `No Representative found for ZIP code '${normalizedZip}'. ` +
            `Found ${repsData.length} result(s) but none matched Representative criteria. ` +
            `Please verify the ZIP code is correct and try again.`
          )
        }
      } else if (response.status === 404) {
        throw new Error(
          `ZIP code '${normalizedZip}' not found. ` +
          `Please verify the ZIP code is correct.`
        )
      } else {
        throw new Error(`Error from Whoismyrepresentative API: ${response.status} ${response.statusText}`)
      }
    } catch (error: any) {
      // If primary API failed, try 5 Calls API as fallback
      if (error.message && !error.message.includes('not found') && !error.message.includes('No Representative')) {
        // Try fallback API
        try {
          const fivecallsUrl = new URL('https://api.5calls.org/v1/reps')
          fivecallsUrl.searchParams.set('zip', normalizedZip)

          const fallbackResponse = await fetch(fivecallsUrl.toString(), {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          })

          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json()
            const fallbackRepsData = fallbackData.reps || []

            for (const rep of fallbackRepsData) {
              if (typeof rep !== 'object') {
                continue
              }

              const name = rep.name || ''
              const chamber = (rep.chamber || '').toLowerCase()

              // Filter for House members only
              if (chamber !== 'house') {
                continue
              }

              if (name) {
                const party = rep.party || ''
                const phone = rep.phone || ''
                const website = rep.contact_form || rep.url || ''
                const district = rep.district || ''
                const state = rep.state || ''

                // Check for email
                const email =
                  rep.email ||
                  rep.Email ||
                  rep.email_address ||
                  rep.EmailAddress ||
                  null

                // Format district
                let districtStr = ''
                if (district) {
                  districtStr = state ? `${state}-${district}` : district
                } else if (state) {
                  districtStr = `${state}-At-Large`
                }

                representatives.push({
                  name,
                  role: 'Member of the House of Representatives',
                  district: districtStr || null,
                  party: party || null,
                  email,
                  website: website || null,
                  phone: phone || null,
                  address: null, // 5 Calls doesn't provide address
                })
              }
            }

            if (representatives.length > 0) {
              return representatives
            }
          }
        } catch (fallbackError) {
          // If fallback also fails, throw original error
        }
      }

      // Re-throw the original error if fallback didn't work
      throw error
    }

    // If we still don't have results
    if (representatives.length === 0) {
      throw new Error(
        `No Representative found for ZIP code '${normalizedZip}'. ` +
        `Please verify the ZIP code is correct and try again.`
      )
    }
  } catch (error: any) {
    if (error.message) {
      throw error
    }
    throw new Error(`Error connecting to Representative API: ${error.message || error}`)
  }

  return representatives
}
