/**
 * US Representative lookup service.
 * Uses APIs only for ZIP-to-district mapping, then uses CSV data from src/data/legislators-current.csv
 * and house.gov data as the primary source of truth for representative information (more accurate and up-to-date).
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

// Cache for house.gov ZIP lookup results
let houseGovZipCache: Map<string, ContactInfo[]> = new Map()

// Use house.gov ZIP code search to find representatives
async function lookupHouseGovByZip(zipCode: string): Promise<ContactInfo[]> {
  // Check cache first
  if (houseGovZipCache.has(zipCode)) {
    return houseGovZipCache.get(zipCode) || []
  }

  const representatives: ContactInfo[] = []

  try {
    // Use the official house.gov ZIP lookup endpoint
    const lookupUrl = `https://ziplook.house.gov/htbin/findrep_house?ZIP=${zipCode}`
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(lookupUrl)}`
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(proxyUrl, { 
      signal: controller.signal,
      method: 'GET'
    })
    clearTimeout(timeoutId)

    if (response.ok) {
      const proxyData = await response.json()
      const html = proxyData.contents

      if (html && typeof html === 'string') {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')

        // Parse the "Your Possible Representatives" section
        // Format: Name, Party, State District
        // Example: "Scott H. Peters", "Democrat", "California District 50"
        
        // First, find the "Your Possible Representatives" section
        let repsSection: Element | null = null
        
        // Look for the heading
        const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b')
        for (const heading of Array.from(headings)) {
          const text = heading.textContent?.toLowerCase() || ''
          if (text.includes('possible representative') || text.includes('your representative')) {
            // Find the section containing the representatives (next sibling or parent's next sibling)
            repsSection = heading.nextElementSibling || heading.parentElement?.nextElementSibling || heading.parentElement
            break
          }
        }
        
        // If we found the section, only parse within it
        const searchRoot = repsSection || doc.body
        
        // State abbreviation map
        const stateAbbrMap: { [key: string]: string } = {
          'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
          'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
          'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
          'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
          'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
          'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
          'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
          'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
          'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
          'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
          'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
          'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
          'Wisconsin': 'WI', 'Wyoming': 'WY',
        }
        
        // Exclude navigation and footer links
        const excludeKeywords = [
          'terms of use', 'accessibility', 'contact webmaster', 'privacy policy',
          'site map', 'site tools', 'watch live', 'skip', 'search', 'navigation',
          'visitors', 'educators', 'students', 'media', 'employment', 'doing business'
        ]
        
        // Use a Set to track unique representatives by name+district to avoid duplicates
        const seenReps = new Set<string>()
        
        // Method 1: Look for structured text pattern first (most reliable)
        // Pattern: "Name Party State District" (e.g., "Scott H. Peters Democrat California District 50")
        // The text might be on separate lines, so normalize whitespace first
        let sectionText = searchRoot.textContent || ''
        // Normalize whitespace - replace multiple spaces/newlines/tabs with single space
        sectionText = sectionText.replace(/[\s\n\r\t]+/g, ' ')
        
        // Debug: log a sample of the text to see what we're parsing
        console.log('Parsing section text (first 1000 chars):', sectionText.substring(0, 1000))
        
        // Pattern that matches: Name (with optional middle initial) + Party + State + District
        // Use global flag and reset lastIndex to ensure we get all matches
        // Make pattern more flexible to handle variations
        const repPattern = /([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)\s+(Democrat|Republican|Independent)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+District\s+(\d+)/gi
        const matches: Array<{name: string, party: string, state: string, district: string}> = []
        
        // Collect all matches first - use matchAll for better results
        const allMatches = sectionText.matchAll(repPattern)
        for (const match of allMatches) {
          const name = match[1].trim()
          const party = match[2]
          const stateName = match[3]
          const district = match[4]
          
          // Convert state name to abbreviation
          const state = stateAbbrMap[stateName] || stateName
          
          matches.push({ name, party, state, district })
          console.log(`Matched: ${name} - ${party} - ${state} - ${district}`)
        }
        
        console.log(`Total matches found: ${matches.length}`)
        
        // Process matches and add to representatives
        for (const { name, party, state, district } of matches) {
          // Create unique key for deduplication (normalize name variations)
          const normalizedName = name.toLowerCase().replace(/\s+/g, ' ')
          const uniqueKey = `${normalizedName}-${state}-${district}`
          
          if (!seenReps.has(uniqueKey)) {
            seenReps.add(uniqueKey)
            representatives.push({
              name: name,
              role: 'Member of the House of Representatives',
              district: `${state}-${district}`,
              party: party,
              email: null,
              website: null,
              phone: null,
              address: null,
            })
          }
        }
        
        console.log(`Found ${representatives.length} representatives from house.gov for ZIP ${zipCode}:`, representatives.map(r => `${r.name} (${r.district})`))
        
        // Method 2: Parse by looking for blocks/containers that have all the info
        // Look for divs or list items that contain name, party, and district
        // This is a fallback if regex didn't find all reps
        if (representatives.length < 3) {
          // Try finding representative blocks - they might be in divs or list items
          const repBlocks = searchRoot.querySelectorAll('div, li, p, tr, span')
          
          repBlocks.forEach((block) => {
            const blockText = block.textContent || ''
            
            // Check if this block contains a representative pattern
            // Look for: Name + Party + State District
            const nameMatch = blockText.match(/([A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+)/)
            const partyMatch = blockText.match(/\b(Democrat|Republican|Independent)\b/i)
            const districtMatch = blockText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+District\s+(\d+)/i)
            
            if (nameMatch && partyMatch && districtMatch) {
              const name = nameMatch[1].trim()
              const party = partyMatch[1]
              const stateName = districtMatch[1]
              const district = districtMatch[2]
              
              // Skip if it's a navigation link
              const nameLower = name.toLowerCase()
              if (excludeKeywords.some(keyword => nameLower.includes(keyword))) {
                return
              }
              
              // Convert state name to abbreviation
              const state = stateAbbrMap[stateName] || stateName
              
              // Create unique key for deduplication
              const uniqueKey = `${name.toLowerCase()}-${state}-${district}`
              
              if (!seenReps.has(uniqueKey)) {
                seenReps.add(uniqueKey)
                
                // Try to find website link in this block
                const link = block.querySelector('a[href*="house.gov"]')
                const href = link?.getAttribute('href') || ''
                
                representatives.push({
                  name: name,
                  role: 'Member of the House of Representatives',
                  district: `${state}-${district}`,
                  party: party,
                  email: null,
                  website: href.startsWith('http') ? href : href ? `https://www.house.gov${href}` : null,
                  phone: null,
                  address: null,
                })
              }
            }
          })
        }
        
        // Re-sort and deduplicate after all parsing methods
        const finalReps: ContactInfo[] = []
        const finalSeen = new Set<string>()
        
        for (const rep of representatives) {
          const key = `${rep.name.toLowerCase()}-${rep.district}`
          if (!finalSeen.has(key)) {
            finalSeen.add(key)
            finalReps.push(rep)
          }
        }
        
        representatives.length = 0
        representatives.push(...finalReps)
        
        // Method 3: If still no results, try link-based parsing as fallback
        if (representatives.length === 0) {
          const allLinks = searchRoot.querySelectorAll('a[href*="house.gov"], a[href*=".gov"]')
          
          allLinks.forEach((link) => {
            const name = link.textContent?.trim() || ''
            const href = link.getAttribute('href') || ''
            
            // Skip navigation/footer links
            const nameLower = name.toLowerCase()
            if (excludeKeywords.some(keyword => nameLower.includes(keyword))) {
              return
            }
            
            // Check if this looks like a representative name (has first and last name pattern)
            const namePattern = /^[A-Z][a-z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-z]+$/
            if (name && namePattern.test(name) && name.length > 5) {
              
              // Get parent container to find party and district info
              const container = link.closest('div, li, p, td, span') || link.parentElement
              const containerText = container?.textContent || ''
              
              // Extract party
              let party = ''
              if (containerText.match(/\bDemocrat\b/i)) {
                party = 'Democrat'
              } else if (containerText.match(/\bRepublican\b/i)) {
                party = 'Republican'
              } else if (containerText.match(/\bIndependent\b/i)) {
                party = 'Independent'
              }
              
              // Extract state and district
              const districtMatch = containerText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+District\s+(\d+)|([A-Z]{2})\s+District\s+(\d+)/i)
              let state = ''
              let district = ''
              
              if (districtMatch) {
                state = districtMatch[1] || districtMatch[3] || ''
                district = districtMatch[2] || districtMatch[4] || ''
                
                if (state.length > 2) {
                  state = stateAbbrMap[state] || state
                }
              }
              
              // Only add if we have name, party, and district
              if (name && party && state && district) {
                const uniqueKey = `${name.toLowerCase()}-${state}-${district}`
                
                if (!seenReps.has(uniqueKey)) {
                  seenReps.add(uniqueKey)
                  representatives.push({
                    name: name,
                    role: 'Member of the House of Representatives',
                    district: `${state}-${district}`,
                    party: party,
                    email: null,
                    website: href.startsWith('http') ? href : href ? `https://www.house.gov${href}` : null,
                    phone: null,
                    address: null,
                  })
                }
              }
            }
          })
        }
      }
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.warn('house.gov ZIP lookup failed:', error.message || error)
    }
  }

  // Cache results
  if (representatives.length > 0) {
    houseGovZipCache.set(zipCode, representatives)
  }

  return representatives
}

// Note: fetchHouseGovData and getStateAbbreviation removed - we now use lookupHouseGovByZip for ZIP-specific lookups

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
  
  // Step 1: Use house.gov ZIP lookup to get representative names (primary source)
  let houseGovReps: ContactInfo[] = []
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    houseGovReps = await Promise.race([
      lookupHouseGovByZip(normalizedZip),
      new Promise<ContactInfo[]>((resolve) => {
        setTimeout(() => resolve([]), 5000)
      })
    ])
    
    clearTimeout(timeoutId)
  } catch (error: any) {
    console.warn('house.gov ZIP lookup failed, using fallback:', error.message || error)
  }

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

  // Use API only to get state/district mapping from ZIP code
  // Then use CSV as the primary source of truth for representative data
  const foundStateDistricts = new Set<string>()

  // Try Whoismyrepresentative.com API first to get ZIP -> district mapping
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

      // Extract state-district pairs from API (don't trust API's representative names)
      // Also collect email addresses if available from API
      const apiEmailsByDistrict = new Map<string, string>() // key: "STATE-DISTRICT", value: email
      
      for (const rep of repsData) {
        if (typeof rep !== 'object') {
          continue
        }

        const officeField = String(rep.office || rep.Office || '').toLowerCase()
        const district = String(rep.district || rep.District || '').trim()
        const state = rep.state || rep.State || ''
        
        // Check if API has email address
        const email = rep.email || rep.Email || rep.email_address || rep.contact_email || null

        // Skip Senators
        const isSenator =
          officeField.includes('senator') ||
          officeField.includes('senate') ||
          (rep.title || '').toLowerCase() === 'senator' ||
          (rep.Title || '').toLowerCase() === 'senator'

        if (isSenator) {
          continue
        }

        // Identify Representatives by checking for district or title
        const isRepByTitle =
          officeField.includes('representative') ||
          officeField.includes('house') ||
          (rep.title || '').toLowerCase() === 'representative' ||
          (rep.Title || '').toLowerCase() === 'representative'

        let isRepresentative = false
        let districtNum = district

        if (district && !['', 'none', 'n/a'].includes(district.toLowerCase())) {
          isRepresentative = true
          districtNum = district
        } else if (isRepByTitle && state) {
          isRepresentative = true
          districtNum = '0' // At-large
        } else if (state && !isSenator) {
          // If we have a state and it's not a senator, assume it's a rep
          isRepresentative = true
          districtNum = '0' // At-large
        }

        if (isRepresentative && state && districtNum) {
          const key = `${state}-${districtNum}`
          foundStateDistricts.add(key)
          
          // Store email if available
          if (email && typeof email === 'string' && email.includes('@')) {
            apiEmailsByDistrict.set(key, email)
          }
        }
      }

      // Step 2: If we got names from house.gov, enrich them with CSV/API data
      if (houseGovReps.length > 0) {
        // Use Set to ensure no duplicates during enrichment
        const enrichedRepsSet = new Map<string, ContactInfo>()
        
        // Enrich house.gov names with detailed data from CSV
        for (const houseGovRep of houseGovReps) {
          // Create unique key for this rep
          const repKey = houseGovRep.district || houseGovRep.name.toLowerCase()
          
          // Skip if we already processed this rep
          if (enrichedRepsSet.has(repKey)) {
            continue
          }
          
          let enrichedRep = { ...houseGovRep }
          
          // Try to find matching CSV entry by name and district
          if (houseGovRep.district) {
            const [state, district] = houseGovRep.district.split('-')
            const csvKey = `${state}-${district}`
            
            if (csvLookup[csvKey]) {
              // Find best matching CSV entry by name
              const csvMatch = csvLookup[csvKey].find(csvRep => {
                const csvName = csvRep.full_name.toLowerCase().replace(/\s+/g, ' ')
                const houseName = houseGovRep.name.toLowerCase().replace(/\s+/g, ' ')
                // More precise matching
                const csvParts = csvName.split(' ').filter(p => p.length > 1)
                const houseParts = houseName.split(' ').filter(p => p.length > 1)
                
                // Check if last names match and at least one first name part matches
                const csvLastName = csvParts[csvParts.length - 1]
                const houseLastName = houseParts[houseParts.length - 1]
                
                return csvLastName === houseLastName && 
                       (csvParts[0] === houseParts[0] || 
                        csvName.includes(houseParts[0]) || 
                        houseName.includes(csvParts[0]))
              })
              
              if (csvMatch) {
                const csvContact = csvLegislatorToContactInfo(csvMatch)
                
                // Check if API has email for this district
                const apiEmail = houseGovRep.district ? apiEmailsByDistrict.get(houseGovRep.district) : null
                
                // Merge: use house.gov name, but CSV for other details including email if available
                enrichedRep = {
                  ...csvContact,
                  name: houseGovRep.name, // Prefer house.gov name format
                  website: houseGovRep.website || csvContact.website,
                  district: houseGovRep.district || csvContact.district,
                  email: apiEmail || csvContact.email || houseGovRep.email || null, // Prefer API email, then CSV, then house.gov
                  phone: csvContact.phone || houseGovRep.phone || null, // Prefer CSV phone
                  address: csvContact.address || houseGovRep.address || null, // Prefer CSV address
                }
              } else {
                // No CSV match, but check if API has email
                const apiEmail = houseGovRep.district ? apiEmailsByDistrict.get(houseGovRep.district) : null
                if (apiEmail) {
                  enrichedRep.email = apiEmail
                }
              }
            }
          }
          
          enrichedRepsSet.set(repKey, enrichedRep)
        }
        
        // Convert Map values to array
        representatives.push(...Array.from(enrichedRepsSet.values()))
        
        if (representatives.length > 0) {
          return {
            representatives,
            missingFromAPI: undefined,
            apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
          }
        }
      }
      
      // Fallback: Use CSV/API if house.gov didn't return results
      if (foundStateDistricts.size > 0) {
        for (const key of foundStateDistricts) {
          const reps = csvLookup[key] || []
          
          for (const rep of reps) {
            const contact = csvLegislatorToContactInfo(rep)
            representatives.push(contact)
          }
        }

        if (representatives.length > 0) {
          return {
            representatives,
            missingFromAPI: undefined,
            apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
          }
        }
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

          // Extract state-district pairs from 5 Calls API (don't trust API names)
          for (const rep of fallbackRepsData) {
            if (typeof rep !== 'object') {
              continue
            }

            const chamber = (rep.chamber || '').toLowerCase()
            if (chamber !== 'house') {
              continue
            }

            const district = rep.district || ''
            const state = rep.state || ''

            if (state) {
              const districtNum = district || '0'
              const key = `${state}-${districtNum}`
              foundStateDistricts.add(key)
            }
          }

          // Use CSV as fallback after getting districts from 5 Calls API
          if (foundStateDistricts.size > 0 && representatives.length === 0) {
            for (const key of foundStateDistricts) {
              const reps = csvLookup[key] || []
              
              for (const rep of reps) {
                const contact = csvLegislatorToContactInfo(rep)
                representatives.push(contact)
              }
            }

            if (representatives.length > 0) {
              return {
                representatives,
                missingFromAPI: undefined,
                apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
              }
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

  // Final check: Use CSV if we found any districts but haven't returned yet
  if (foundStateDistricts.size > 0 && representatives.length === 0) {
    // We found districts but lookup didn't return results - try CSV
    for (const key of foundStateDistricts) {
      const reps = csvLookup[key] || []
      
      for (const rep of reps) {
        const contact = csvLegislatorToContactInfo(rep)
        representatives.push(contact)
      }
    }
  }
  
  // If house.gov returned results but we haven't enriched them yet, use them as-is
  if (houseGovReps.length > 0 && representatives.length === 0) {
    representatives.push(...houseGovReps)
  }

  // Return what we found
  if (representatives.length > 0) {
    return {
      representatives,
      missingFromAPI: undefined,
      apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
    }
  }

  // If we get here, we couldn't find any districts from APIs
  throw new Error(
    `Unable to find representatives for ZIP code '${normalizedZip}'. ` +
    `Could not determine congressional district from APIs. ` +
    `API errors: ${apiErrors.length > 0 ? apiErrors.join('; ') : 'Unknown error'}. ` +
    `Please verify the ZIP code is correct and try again.`
  )
}
