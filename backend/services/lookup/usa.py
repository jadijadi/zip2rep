"""
US Representative lookup service.
Uses the Whoismyrepresentative.com API for ZIP code to Representative lookup.
"""
import httpx
import sys
import os
import re
from typing import List, Tuple

# Import ContactInfo from models
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from models import ContactInfo


def validate_us_zip_code(zip_code: str) -> Tuple[bool, str]:
    """
    Validate US ZIP code format.
    
    US ZIP codes can be:
    - 5 digits: 12345
    - 5+4 format: 12345-6789
    
    Returns:
        tuple: (is_valid, normalized_zip_code)
    """
    # Remove spaces, dashes, and any other characters
    normalized = re.sub(r'[^\d]', '', zip_code)
    
    # Check length - should be 5 digits (we'll use first 5 if longer)
    if len(normalized) < 5:
        return False, normalized
    
    # Extract first 5 digits for validation
    zip_5 = normalized[:5]
    
    # Check that first 5 digits are all numeric
    if not zip_5.isdigit():
        return False, normalized
    
    # ZIP codes cannot start with 00000
    if zip_5 == "00000":
        return False, normalized
    
    return True, zip_5


async def lookup_usa_representative(zip_code: str) -> List[ContactInfo]:
    """
    Look up US Representative by ZIP code.
    
    US ZIP codes are in format: 12345 or 12345-6789
    Returns House of Representatives members (not Senators, as Senators represent entire states).
    """
    # Validate ZIP code format
    is_valid, normalized_zip = validate_us_zip_code(zip_code)
    
    if not is_valid:
        raise ValueError(
            f"Invalid US ZIP code format: '{zip_code}'. "
            f"Expected format: 5 digits (e.g., 90210) or 5+4 format (e.g., 90210-1234)"
        )
    
    representatives = []
    primary_api_failed = False
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            # Use Whoismyrepresentative.com API - free service for ZIP code to Representative lookup
            # API documentation: https://whoismyrepresentative.com/api
            # Returns both Representatives and Senators, but we'll filter for Representatives only
            api_url = "https://whoismyrepresentative.com/getall_mems.php"
            
            try:
                response = await client.get(
                    api_url,
                    params={"zip": normalized_zip, "output": "json"},
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                    except Exception as json_error:
                        # If JSON parsing fails, check if response is HTML (API might be down)
                        response_text = response.text[:500]  # First 500 chars for debugging
                        raise Exception(
                            f"Invalid JSON response from API. Response: {response_text}. "
                            f"JSON error: {str(json_error)}"
                        )
                    
                    # API returns data in 'results' key (or might be direct array)
                    if isinstance(data, list):
                        reps_data = data
                    elif isinstance(data, dict):
                        reps_data = data.get("results", [])
                        # Some APIs might use different keys
                        if not reps_data:
                            reps_data = data.get("representatives", [])
                        if not reps_data:
                            reps_data = data.get("data", [])
                    else:
                        reps_data = []
                    
                    # Filter for House of Representatives members only
                    # Senators represent entire states, not specific districts
                    for rep in reps_data:
                        if not isinstance(rep, dict):
                            continue
                            
                        # Extract fields - API might use different field names
                        name = rep.get("name") or rep.get("Name") or ""
                        office_field = str(rep.get("office") or rep.get("Office") or "").lower()
                        district = str(rep.get("district") or rep.get("District") or "").strip()
                        state = rep.get("state") or rep.get("State") or ""
                        
                        # Skip if no name
                        if not name:
                            continue
                        
                        # Skip Senators - they represent entire states, not districts
                        # Check multiple ways to identify senators
                        is_senator = (
                            "senator" in office_field or 
                            "senate" in office_field or
                            rep.get("title", "").lower() == "senator" or
                            rep.get("Title", "").lower() == "senator"
                        )
                        
                        if is_senator:
                            continue
                        
                        # Identify Representatives
                        # Representatives have district numbers (except at-large districts)
                        # If district exists and is not empty, it's likely a Representative
                        is_representative = False
                        
                        # Check if it's explicitly a representative
                        is_rep_by_title = (
                            "representative" in office_field or 
                            "house" in office_field or
                            rep.get("title", "").lower() == "representative" or
                            rep.get("Title", "").lower() == "representative"
                        )
                        
                        if district and district.lower() not in ["", "none", "n/a"]:
                            # Has a district number - this is a Representative
                            is_representative = True
                        elif is_rep_by_title:
                            # Title explicitly says representative
                            is_representative = True
                        elif state and not is_senator:
                            # If we have a state and it's not a senator, assume it's a rep
                            # (This handles cases where district info might be missing)
                            is_representative = True
                        
                        if is_representative:
                            # Build contact info
                            party = rep.get("party") or rep.get("Party") or ""
                            phone = rep.get("phone") or rep.get("Phone") or ""
                            # Office field might contain address or office type
                            office_address = rep.get("office") or rep.get("Office") or ""
                            # If office field looks like office type rather than address, try other fields
                            if office_address.lower() in ["representative", "senator", "house", "senate"]:
                                office_address = rep.get("address") or rep.get("Address") or None
                            website = rep.get("link") or rep.get("Link") or rep.get("website") or rep.get("Website") or ""
                            
                            # Check for email in various possible fields (though APIs typically don't provide it)
                            email = (
                                rep.get("email") or 
                                rep.get("Email") or 
                                rep.get("email_address") or 
                                rep.get("EmailAddress") or
                                None
                            )
                            
                            # Format district information
                            # For at-large districts, use state name
                            district_str = ""
                            if district and district.lower() not in ["at-large", "at large", "none", "n/a", ""]:
                                district_str = f"{state}-{district}" if state else district
                            elif state:
                                district_str = f"{state}-At-Large"
                            
                            contact = ContactInfo(
                                name=name,
                                role="Member of the House of Representatives",
                                district=district_str if district_str else None,
                                party=party if party else None,
                                email=email,  # Checked but typically not provided by free APIs
                                website=website if website else None,
                                phone=phone if phone else None,
                                address=office_address if office_address else None,
                            )
                            representatives.append(contact)
                    
                    if representatives:
                        return representatives
                
                # If we got a 200 response but no representatives, note it for fallback
                primary_api_failed = (response.status_code == 200 and not representatives)
            
            except (httpx.HTTPStatusError, httpx.HTTPError) as e:
                # Primary API failed - will try fallback
                primary_api_failed = True
            
            # If primary API didn't work or returned no results, try 5 Calls API as fallback
            if not representatives:
                try:
                    # 5 Calls API - alternative free API
                    # Documentation: https://apidocs.5calls.org/representatives
                    fivecalls_url = f"https://api.5calls.org/v1/reps"
                    response = await client.get(
                        fivecalls_url,
                        params={"zip": normalized_zip},
                        timeout=10.0
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        # 5 Calls API returns reps in 'reps' key
                        reps_data = data.get("reps", [])
                        
                        for rep in reps_data:
                            if not isinstance(rep, dict):
                                continue
                            
                            # 5 Calls API structure
                            name = rep.get("name", "")
                            # Filter for House members only (chamber == "house")
                            chamber = rep.get("chamber", "").lower()
                            
                            if chamber != "house":
                                continue
                            
                            if name:
                                # Extract contact info from 5 Calls format
                                party = rep.get("party", "")
                                phone = rep.get("phone", "")
                                website = rep.get("contact_form", "") or rep.get("url", "")
                                district = rep.get("district", "")
                                state = rep.get("state", "")
                                
                                # Check for email in various possible fields (though APIs typically don't provide it)
                                email = (
                                    rep.get("email") or 
                                    rep.get("Email") or 
                                    rep.get("email_address") or 
                                    rep.get("EmailAddress") or
                                    None
                                )
                                
                                # Format district
                                district_str = ""
                                if district:
                                    district_str = f"{state}-{district}" if state else district
                                elif state:
                                    district_str = f"{state}-At-Large"
                                
                                contact = ContactInfo(
                                    name=name,
                                    role="Member of the House of Representatives",
                                    district=district_str if district_str else None,
                                    party=party if party else None,
                                    email=email,  # Checked but typically not provided by free APIs
                                    website=website if website else None,
                                    phone=phone if phone else None,
                                    address=None,  # 5 Calls doesn't provide address
                                )
                                representatives.append(contact)
                        
                        if representatives:
                            return representatives
                
                except Exception:
                    # If fallback also fails, continue to error handling
                    pass
            
            # If we still don't have results after trying both APIs
            if not representatives:
                raise ValueError(
                    f"No Representative found for ZIP code '{normalized_zip}'. "
                    f"Please verify the ZIP code is correct and try again."
                )
    
    except httpx.HTTPError as e:
        raise Exception(f"Error connecting to Representative API: {str(e)}")
    
    return representatives


# Implementation uses:
# 1. Whoismyrepresentative.com API (https://whoismyrepresentative.com/api) - Primary free service
#    - Converts ZIP codes to congressional districts and returns Representative information
#    - No API key required
#    - Returns both Representatives and Senators, but we filter for Representatives only
#    - Uses HTTPS (required)
#    - Note: Does not provide email addresses (only name, state, district, phone, office, website)
#
# 2. 5 Calls API (https://api.5calls.org/) - Fallback free service
#    - Alternative API for ZIP code to Representative lookup
#    - No API key required
#    - Returns Representatives and Senators with chamber field for filtering
#    - Documentation: https://apidocs.5calls.org/representatives
#    - Note: Does not provide email addresses (provides contact_form URL instead)
#
# Email Addresses:
# Free APIs do not provide email addresses for US Representatives. Many representatives use
# contact forms on their official websites instead of direct email addresses. Users can find
# contact information including email/contact forms on the representative's official website.
#
# Alternative services (if both APIs are unavailable):
# - Google Civic Information API (requires API key, free tier available)
# - Geocodio API (requires API key, paid service)
# - Congress.gov API (official but requires API key registration)
# - USgeocoder API (requires API key, paid service)
