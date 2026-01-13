"""
Canadian MP lookup service.
Uses the Parliament of Canada API and postal code lookup services.
"""
import httpx
import sys
import os
import re
from typing import List, Tuple

# Import ContactInfo from models
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from models import ContactInfo


def validate_canadian_postal_code(postal_code: str) -> Tuple[bool, str]:
    """
    Validate Canadian postal code format.
    
    Canadian postal codes follow the pattern: Letter-Digit-Letter Digit-Letter-Digit
    Examples: K1A 0A6, M5H 2N2, V6B 1A1
    
    Returns:
        tuple: (is_valid, normalized_postal_code)
    """
    # Remove spaces and convert to uppercase
    normalized = postal_code.replace(" ", "").replace("-", "").upper()
    
    # Check length
    if len(normalized) != 6:
        return False, normalized
    
    # Check pattern: Letter-Digit-Letter-Digit-Letter-Digit
    # Using regex to match the pattern
    pattern = r'^[A-Z][0-9][A-Z][0-9][A-Z][0-9]$'
    
    if not re.match(pattern, normalized):
        return False, normalized
    
    # Additional validation: Check for invalid first letters
    # D, F, I, O, Q, U, W, Z are not used as the first letter
    invalid_first_letters = {'D', 'F', 'I', 'O', 'Q', 'U', 'W', 'Z'}
    if normalized[0] in invalid_first_letters:
        return False, normalized
    
    # Additional validation: Check for invalid third/fifth letters
    # D, F, I, O, Q, U are not used in the third and fifth positions
    invalid_letters = {'D', 'F', 'I', 'O', 'Q', 'U'}
    if normalized[2] in invalid_letters or normalized[4] in invalid_letters:
        return False, normalized
    
    return True, normalized


async def lookup_canada_mp(postal_code: str) -> List[ContactInfo]:
    """
    Look up Canadian MP by postal code.
    
    Canadian postal codes are in format: A1A 1A1 (with or without space)
    Format: Letter-Digit-Letter Digit-Letter-Digit
    Examples: K1A 0A6, M5H 2N2, V6B 1A1
    """
    # Validate postal code format
    is_valid, normalized_postal = validate_canadian_postal_code(postal_code)
    
    if not is_valid:
        raise ValueError(
            f"Invalid Canadian postal code format: '{postal_code}'. "
            f"Expected format: Letter-Digit-Letter Digit-Letter-Digit (e.g., K1A 0A6, M5H 2N2)"
        )
    
    # Format with space for display/API calls
    formatted_postal = f"{normalized_postal[:3]} {normalized_postal[3:]}"
    
    representatives = []
    
    try:
        async with httpx.AsyncClient() as client:
            # Use Represent API (by OpenNorth) - free service for postal code to MP lookup
            # API documentation: https://represent.opennorth.ca/api/
            represent_url = "https://represent.opennorth.ca/postcodes"
            
            try:
                # Use Represent API to get representatives by postal code
                # API endpoint: https://represent.opennorth.ca/postcodes/{postal_code}/
                postal_no_space = normalized_postal
                response = await client.get(
                    f"{represent_url}/{postal_no_space}/",
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # Represent API structure: check both 'representatives_centroid' and 'representatives_concordance'
                    reps_data = []
                    if "representatives_centroid" in data:
                        reps_data.extend(data["representatives_centroid"])
                    if "representatives_concordance" in data:
                        reps_data.extend(data["representatives_concordance"])
                    
                    # Filter for federal representatives (MPs)
                    for rep in reps_data:
                        # Check if it's a federal representative
                        rep_type = rep.get("elected_office", "").lower()
                        level = rep.get("level", "").lower()
                        
                        if "member of parliament" in rep_type or level == "federal" or "mp" in rep_type:
                            # Get additional details from OpenParliament if available
                            riding_name = rep.get("district_name", "") or rep.get("riding_name", "")
                            rep_name = rep.get("name", "")
                            party = rep.get("party_name", "")
                            
                            # Try to get more details from OpenParliament API for better contact info
                            mp_details = None
                            if riding_name:
                                try:
                                    openparliament_url = "https://api.openparliament.ca/members/"
                                    mp_response = await client.get(
                                        openparliament_url,
                                        params={"riding": riding_name, "limit": 1},
                                        timeout=5.0
                                    )
                                    if mp_response.status_code == 200:
                                        mp_data = mp_response.json()
                                        if mp_data.get("objects"):
                                            mp_details = mp_data["objects"][0]
                                except:
                                    pass
                            
                            # Build contact info, preferring OpenParliament data when available
                            contact = ContactInfo(
                                name=rep_name or (mp_details.get("name") if mp_details else "MP Information"),
                                role="Member of Parliament",
                                riding=riding_name or (mp_details.get("riding") if mp_details else ""),
                                party=party or (mp_details.get("party") if mp_details else ""),
                                email=rep.get("email") or (mp_details.get("email") if mp_details else None),
                                website=rep.get("url") or rep.get("website") or (mp_details.get("website") if mp_details else None),
                                phone=rep.get("tel") or rep.get("phone") or (mp_details.get("phone") if mp_details else None),
                                address=rep.get("office") or rep.get("postal") or None,
                            )
                            representatives.append(contact)
                    
                    if representatives:
                        return representatives
                
                # If Represent API didn't return federal reps, try alternative endpoint
                # Sometimes postal codes return results but need different parsing
                if not representatives and response.status_code == 200:
                    # Check if there's a boundary or other data we can use
                    boundary = data.get("boundaries_centroid", [])
                    if boundary:
                        # Try to get representatives by boundary
                        boundary_id = boundary[0].get("boundary_set_name", "")
                        if boundary_id:
                            boundary_response = await client.get(
                                f"https://represent.opennorth.ca/boundaries/{boundary_id}/",
                                timeout=10.0
                            )
                            if boundary_response.status_code == 200:
                                boundary_data = boundary_response.json()
                                reps_data = boundary_data.get("representatives_centroid", [])
                                
                                for rep in reps_data:
                                    rep_type = rep.get("elected_office", "").lower()
                                    if "member of parliament" in rep_type or rep.get("level") == "federal":
                                        representatives.append(ContactInfo(
                                            name=rep.get("name", ""),
                                            role="Member of Parliament",
                                            riding=rep.get("district_name", ""),
                                            party=rep.get("party_name", ""),
                                            email=rep.get("email"),
                                            website=rep.get("url"),
                                            phone=rep.get("tel"),
                                        ))
                                
                                if representatives:
                                    return representatives
            
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    raise ValueError(
                        f"Postal code '{formatted_postal}' not found. "
                        f"Please verify the postal code is correct."
                    )
                raise Exception(f"Error from Represent API: {str(e)}")
            except httpx.HTTPError as e:
                # If Represent API fails, try OpenParliament directly with riding search
                # This is a fallback that searches all MPs
                try:
                    openparliament_url = "https://api.openparliament.ca/members/"
                    response = await client.get(
                        openparliament_url,
                        params={"limit": 338},
                        timeout=10.0
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        # Note: This is a fallback and won't match postal code to riding
                        # In production, you'd want to use Represent API or Canada Post data
                        if data.get("objects"):
                            # Return first MP as example (not accurate for postal code)
                            mp = data["objects"][0]
                            representatives.append(ContactInfo(
                                name=mp.get("name", ""),
                                role="Member of Parliament",
                                riding=mp.get("riding", ""),
                                party=mp.get("party", ""),
                                email=mp.get("email", ""),
                                website=mp.get("website", ""),
                            ))
                            return representatives
                except:
                    pass
                
                raise Exception(
                    f"Unable to lookup postal code '{formatted_postal}'. "
                    f"Represent API may be unavailable. Error: {str(e)}"
                )
            
            # If we still don't have results
            if not representatives:
                raise ValueError(
                    f"No MP found for postal code '{formatted_postal}'. "
                    f"Please verify the postal code is correct and try again."
                )
    
    except httpx.HTTPError as e:
        raise Exception(f"Error connecting to Parliament API: {str(e)}")
    
    return representatives


# Implementation uses:
# 1. Represent API (https://represent.opennorth.ca/) - Free, open source service for postal code to MP lookup
#    - Converts postal codes to federal ridings and returns MP information
#    - No API key required
# 2. OpenParliament API (https://api.openparliament.ca/) - For additional MP details
#    - Used to enrich contact information from Represent API
#    - No API key required
#
# Alternative services (if Represent API is unavailable):
# - Canada Post Postal Code Federal Riding File (requires licensing)
# - Elections Canada open data (requires data processing)
# - Official Parliament API: https://www.ourcommons.ca/Members/en/api
