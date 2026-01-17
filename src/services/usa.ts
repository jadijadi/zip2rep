/**
 * US Representative lookup service.
 * Uses the Whoismyrepresentative.com API and 5 Calls API for ZIP code to Representative lookup.
 * Also uses CSV data from src/data/legislators-current.csv as a fallback and for comparison.
 */

import type { ContactInfo } from '../types'
import legislatorsCSV from '../data/legislators-current.csv?raw'

interface CSVLegislator {
  last_name: string
  first_name: string
  middle_name: string
  suffix: string
  nickname: string
  full_name: string
  type: 'rep' | 'sen'
  state: string
  district: string
  party: string
  url: string
  address: string
  phone: string
  contact_form: string
}

interface RepresentativeLookup {
  [key: string]: CSVLegislator[] // key format: "STATE-DISTRICT" or "STATE-0" for at-large
}

// Parse CSV data and create lookup map
function parseLegislatorsCSV(): RepresentativeLookup {
  const lookup: RepresentativeLookup = {}
  const lines = legislatorsCSV.split('\n')
  
  if (lines.length < 2) {
    return lookup
  }

  // Parse header
  const header = lines[0].split(',')
  const getColumnIndex = (name: string): number => {
    return header.findIndex(col => col.toLowerCase() === name.toLowerCase())
  }

  const lastNameIdx = getColumnIndex('last_name')
  const firstNameIdx = getColumnIndex('first_name')
  const middleNameIdx = getColumnIndex('middle_name')
  const suffixIdx = getColumnIndex('suffix')
  const nicknameIdx = getColumnIndex('nickname')
  const fullNameIdx = getColumnIndex('full_name')
  const typeIdx = getColumnIndex('type')
  const stateIdx = getColumnIndex('state')
  const districtIdx = getColumnIndex('district')
  const partyIdx = getColumnIndex('party')
  const urlIdx = getColumnIndex('url')
  const addressIdx = getColumnIndex('address')
  const phoneIdx = getColumnIndex('phone')
  const contactFormIdx = getColumnIndex('contact_form')

  // Parse data rows (skip header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Simple CSV parsing (handles quoted fields)
    const fields: string[] = []
    let currentField = ''
    let inQuotes = false
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        fields.push(currentField)
        currentField = ''
      } else {
        currentField += char
      }
    }
    fields.push(currentField) // Add last field

    if (fields.length < Math.max(typeIdx, stateIdx, districtIdx, partyIdx, urlIdx, addressIdx, phoneIdx) + 1) {
      continue
    }

    const type = fields[typeIdx]?.toLowerCase().trim()
    if (type !== 'rep') {
      continue // Only process Representatives
    }

    const state = fields[stateIdx]?.trim() || ''
    const district = fields[districtIdx]?.trim() || '0'
    const districtNum = district === '' || district === '0' ? '0' : district

    if (!state) continue

    // Create lookup key: STATE-DISTRICT
    const lookupKey = `${state}-${districtNum}`

    const legislator: CSVLegislator = {
      last_name: fields[lastNameIdx]?.trim() || '',
      first_name: fields[firstNameIdx]?.trim() || '',
      middle_name: fields[middleNameIdx]?.trim() || '',
      suffix: fields[suffixIdx]?.trim() || '',
      nickname: fields[nicknameIdx]?.trim() || '',
      full_name: fields[fullNameIdx]?.trim() || '',
      type: 'rep',
      state,
      district: districtNum,
      party: fields[partyIdx]?.trim() || '',
      url: fields[urlIdx]?.trim() || '',
      address: fields[addressIdx]?.trim() || '',
      phone: fields[phoneIdx]?.trim() || '',
      contact_form: fields[contactFormIdx]?.trim() || '',
    }

    if (!lookup[lookupKey]) {
      lookup[lookupKey] = []
    }
    lookup[lookupKey].push(legislator)
  }

  return lookup
}

// Cache parsed CSV data
let csvLookupCache: RepresentativeLookup | null = null

function getCSVLookup(): RepresentativeLookup {
  if (!csvLookupCache) {
    csvLookupCache = parseLegislatorsCSV()
  }
  return csvLookupCache
}

// Convert CSV legislator to ContactInfo
function csvLegislatorToContactInfo(legislator: CSVLegislator): ContactInfo {
  const name = legislator.full_name || 
    `${legislator.first_name} ${legislator.middle_name ? legislator.middle_name + ' ' : ''}${legislator.last_name}${legislator.suffix ? ' ' + legislator.suffix : ''}`.trim()
  
  const districtStr = legislator.district === '0' 
    ? `${legislator.state}-At-Large` 
    : `${legislator.state}-${legislator.district}`

  return {
    name,
    role: 'Member of the House of Representatives',
    district: districtStr,
    party: legislator.party || null,
    email: null, // CSV doesn't have email
    website: legislator.url || legislator.contact_form || null,
    phone: legislator.phone || null,
    address: legislator.address || null,
  }
}

// Normalize name for comparison (remove extra spaces, convert to lowercase)
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Check if two names match (fuzzy matching)
function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1)
  const n2 = normalizeName(name2)
  return n1 === n2 || n1.includes(n2) || n2.includes(n1)
}

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

export interface LookupResult {
  representatives: ContactInfo[]
  missingFromAPI?: ContactInfo[] // Representatives in CSV but not returned by API
  apiErrors?: string[] // Any errors encountered
}

export async function lookupUSARepresentative(zipCode: string): Promise<ContactInfo[]> {
  const result = await lookupUSARepresentativeWithDetails(zipCode)
  return result.representatives
}

export async function lookupUSARepresentativeWithDetails(zipCode: string): Promise<LookupResult> {
  // Validate ZIP code format
  const [isValid, normalizedZip] = validateUSZipCode(zipCode)

  if (!isValid) {
    throw new Error(
      `Invalid US ZIP code format: '${zipCode}'. ` +
      `Expected format: 5 digits (e.g., 90210) or 5+4 format (e.g., 90210-1234)`
    )
  }

  const representatives: ContactInfo[] = []
  const apiErrors: string[] = []
  const csvLookup = getCSVLookup()

  // Helper function to fetch with CORS proxy fallback
  const fetchWithProxy = async (url: string): Promise<Response> => {
    try {
      // Try direct fetch first
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
      })
      // Check if response is actually ok (not blocked by CORS)
      if (response.ok || response.status !== 0) {
        return response
      }
      throw new Error('CORS blocked')
    } catch (error: any) {
      // If CORS fails, try using a CORS proxy
      if (
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('CORS blocked') ||
        error.name === 'TypeError' ||
        error.message?.includes('network')
      ) {
        // Use allorigins.win as a free CORS proxy
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
        const proxyResponse = await fetch(proxyUrl, {
          method: 'GET',
          mode: 'cors',
        })

        if (proxyResponse.ok) {
          const proxyData = await proxyResponse.json()
          // allorigins returns the content in a 'contents' field as a string
          // Parse it if it's JSON, otherwise return as-is
          let contents = proxyData.contents
          try {
            contents = JSON.parse(contents)
          } catch {
            // If not JSON, keep as string
          }
          // Create a mock Response object that works like a real response
          return new Response(JSON.stringify(contents), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' },
          }) as Response
        }
      }
      throw error
    }
  }

  // Try Whoismyrepresentative.com API first
  try {
    const apiUrl = new URL('https://whoismyrepresentative.com/getall_mems.php')
    apiUrl.searchParams.set('zip', normalizedZip)
    apiUrl.searchParams.set('output', 'json')

    const response = await fetchWithProxy(apiUrl.toString())

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

      // Track state-district pairs found in API
      const apiStateDistricts = new Set<string>()

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
          let districtNum = district
          if (district && !['at-large', 'at large', 'none', 'n/a', ''].includes(district.toLowerCase())) {
            districtStr = state ? `${state}-${district}` : district
            districtNum = district
          } else if (state) {
            districtStr = `${state}-At-Large`
            districtNum = '0'
          }

          // Track this state-district combination
          if (state && districtNum) {
            apiStateDistricts.add(`${state}-${districtNum}`)
          }

          // Try to enhance with CSV data
          const csvKey = state && districtNum ? `${state}-${districtNum}` : null
          let enhancedRep: ContactInfo | null = null

          if (csvKey && csvLookup[csvKey]) {
            // Find matching CSV entry by name
            const csvMatch = csvLookup[csvKey].find(csvRep => 
              namesMatch(csvRep.full_name, name) || 
              namesMatch(`${csvRep.first_name} ${csvRep.last_name}`, name)
            )

            if (csvMatch) {
              // Use CSV data to enhance API result
              enhancedRep = csvLegislatorToContactInfo(csvMatch)
              // Prefer API data for fields that might be more current
              enhancedRep.name = name // Use API name format
              enhancedRep.email = email // API might have email
              // Use CSV data for missing fields
              if (!enhancedRep.phone && phone) enhancedRep.phone = phone
              if (!enhancedRep.address && officeAddress) enhancedRep.address = officeAddress
              if (!enhancedRep.website && website) enhancedRep.website = website
            }
          }

          representatives.push(enhancedRep || {
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

      // Find missing entries: CSV entries for state-districts found in API but not returned
      const missingFromAPI: ContactInfo[] = []
      for (const [key, csvReps] of Object.entries(csvLookup)) {
        if (apiStateDistricts.has(key)) {
          // This state-district was found in API, check if all CSV entries are represented
          for (const csvRep of csvReps) {
            const csvContact = csvLegislatorToContactInfo(csvRep)
            // Check if this CSV entry matches any API result
            const foundInAPI = representatives.some(apiRep => 
              namesMatch(apiRep.name, csvContact.name) &&
              apiRep.district === csvContact.district
            )
            if (!foundInAPI) {
              missingFromAPI.push(csvContact)
            }
          }
        }
      }

      if (representatives.length > 0) {
        // Log missing entries for debugging
        if (missingFromAPI.length > 0) {
          console.warn(`Found ${missingFromAPI.length} representative(s) in CSV but missing from API:`, missingFromAPI)
        }
        return {
          representatives,
          missingFromAPI: missingFromAPI.length > 0 ? missingFromAPI : undefined,
          apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
        }
      }

      // If no results found, continue to fallback
      if (repsData.length === 0) {
        apiErrors.push(`No data returned for ZIP code '${normalizedZip}' from API`)
      } else if (representatives.length === 0) {
        apiErrors.push(
          `Found ${repsData.length} result(s) but none matched Representative criteria`
        )
      }
    } else if (response.status === 404) {
      apiErrors.push(`ZIP code '${normalizedZip}' not found in API`)
    } else {
      apiErrors.push(`Error from Whoismyrepresentative API: ${response.status} ${response.statusText}`)
    }
  } catch (error: any) {
    // Check if it's a CORS or network error
    const isNetworkError =
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('NetworkError') ||
      error.message?.includes('CORS') ||
      error.name === 'TypeError' ||
      error.message?.includes('network')

    if (isNetworkError) {
      // Try 5 Calls API as fallback (it might have better CORS support)
      try {
        // 5 Calls API uses a different endpoint - try location-based lookup
        // Note: This API might require location instead of just ZIP
        const fivecallsUrl = new URL('https://api.5calls.org/v1/reps')
        fivecallsUrl.searchParams.set('zip', normalizedZip)

        const fallbackResponse = await fetchWithProxy(fivecallsUrl.toString())

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
            // Find missing entries from CSV
            const apiStateDistricts = new Set<string>()
            representatives.forEach(rep => {
              if (rep.district) {
                apiStateDistricts.add(rep.district)
              }
            })

            const missingFromAPI: ContactInfo[] = []
            for (const [key, csvReps] of Object.entries(csvLookup)) {
              if (apiStateDistricts.has(key)) {
                for (const csvRep of csvReps) {
                  const csvContact = csvLegislatorToContactInfo(csvRep)
                  const foundInAPI = representatives.some(apiRep => 
                    namesMatch(apiRep.name, csvContact.name) &&
                    apiRep.district === csvContact.district
                  )
                  if (!foundInAPI) {
                    missingFromAPI.push(csvContact)
                  }
                }
              }
            }

            // Log missing entries for debugging
            if (missingFromAPI.length > 0) {
              console.warn(`Found ${missingFromAPI.length} representative(s) in CSV but missing from 5 Calls API:`, missingFromAPI)
            }

            return {
              representatives,
              missingFromAPI: missingFromAPI.length > 0 ? missingFromAPI : undefined,
              apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
            }
          }
        }
      } catch (fallbackError: any) {
        apiErrors.push(`5 Calls API fallback failed: ${fallbackError.message || fallbackError}`)
      }
    } else {
      // Not a network error, re-throw
      apiErrors.push(`API error: ${error.message || error}`)
    }
  }

  // Final fallback: Try to use CSV data if we have any state/district info from API errors
  // Note: Without ZIP->state mapping, we can't directly use CSV, but we can return what we have
  if (representatives.length === 0 && apiErrors.length > 0) {
    // If all APIs failed, we can't determine state/district from ZIP alone
    // So we can't use CSV as fallback without additional mapping data
    throw new Error(
      `Unable to find representatives for ZIP code '${normalizedZip}'. ` +
      `API errors: ${apiErrors.join('; ')}. ` +
      `Please verify the ZIP code is correct and try again.`
    )
  }

  // Return what we found, even if there were some API errors
  if (representatives.length > 0) {
    return {
      representatives,
      missingFromAPI: undefined,
      apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
    }
  }

  // If we get here, nothing worked
  throw new Error(
    `Network error: Unable to connect to representative APIs. ` +
    `This may be due to CORS restrictions or network issues. ` +
    `Please check your internet connection and try again. ` +
    `API errors: ${apiErrors.length > 0 ? apiErrors.join('; ') : 'Unknown error'}`
  )
}
