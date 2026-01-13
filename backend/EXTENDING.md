# Extending Zip2MP to Support New Countries

This guide explains how to add support for new countries to the Zip2MP application.

## Architecture Overview

The application uses a modular lookup system where each country has its own lookup service. The main API routes requests to the appropriate lookup function based on the country code.

## Steps to Add a New Country

### 1. Create a Lookup Module

Create a new file in `backend/services/lookup/` named after your country (e.g., `uk.py`, `australia.py`).

### 2. Implement the Lookup Function

Your lookup function should:
- Accept a `postal_code` parameter (string)
- Return a `List[ContactInfo]`
- Handle errors appropriately
- Be async (use `async def`)

Example template:

```python
"""
[Country Name] MP lookup service.
"""
import httpx
import sys
import os
from typing import List

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from models import ContactInfo


async def lookup_[country]_mp(postal_code: str) -> List[ContactInfo]:
    """
    Look up [Country] MP by postal code.
    
    Args:
        postal_code: The postal/zip code to look up
        
    Returns:
        List of ContactInfo objects representing the representatives
    """
    # Normalize postal code
    normalized_postal = postal_code.strip().upper()
    
    # Validate format
    if not is_valid_postal_code(normalized_postal):
        raise ValueError(f"Invalid postal code format: {postal_code}")
    
    representatives = []
    
    try:
        # Implement your lookup logic here
        # This might involve:
        # 1. Converting postal code to constituency/riding/district
        # 2. Querying an API for MP information
        # 3. Parsing and formatting the response
        
        async with httpx.AsyncClient() as client:
            # Example API call
            response = await client.get(
                "https://api.example.com/lookup",
                params={"postal_code": normalized_postal},
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                # Parse data and create ContactInfo objects
                representatives.append(ContactInfo(
                    name=data["name"],
                    role="Member of Parliament",
                    email=data.get("email"),
                    phone=data.get("phone"),
                    website=data.get("website"),
                    address=data.get("address"),
                    party=data.get("party"),
                    riding=data.get("constituency"),  # Adjust field names as needed
                ))
    
    except httpx.HTTPError as e:
        raise Exception(f"Error connecting to API: {str(e)}")
    
    return representatives
```

### 3. Register the Lookup Function

Add your lookup function to `backend/main.py`:

1. Import your function:
```python
from services.lookup.[country] import lookup_[country]_mp
```

2. Add it to the `LOOKUP_FUNCTIONS` dictionary:
```python
LOOKUP_FUNCTIONS = {
    # ... existing entries ...
    "[COUNTRY_CODE]": lookup_[country]_mp,
    "[COUNTRY_NAME]": lookup_[country]_mp,
}
```

3. Update the `/api/countries` endpoint to include your country:
```python
@app.get("/api/countries")
async def get_supported_countries():
    return {
        "countries": [
            # ... existing entries ...
            {"code": "[COUNTRY_CODE]", "name": "[Country Name]", "format": "Postal Code Format"},
        ]
    }
```

### 4. Update Documentation

- Add your country to the README.md
- Update the API documentation if needed
- Add any required API keys or setup instructions

## API Resources by Country

### Canada
- **Parliament of Canada API**: https://openparliament.ca/api/
- **Postal Code to Riding**: Elections Canada data or Canada Post API
- **Format**: A1A 1A1 (6 characters, space optional)

### United States
- **Google Civic Information API**: https://developers.google.com/civic-information
- **ProPublica Congress API**: https://www.propublica.org/datastore/api/propublica-congress-api
- **Format**: 5 digits (12345) or ZIP+4 (12345-6789)

### United Kingdom
- **TheyWorkForYou API**: https://www.theyworkforyou.com/api/
- **Postcode.io**: https://postcodes.io/
- **Format**: Various formats (e.g., SW1A 1AA, M1 1AA)

### Australia
- **Australian Electoral Commission**: Public data available
- **Format**: 4 digits (e.g., 2000)

### Other Countries
Research available APIs or data sources for:
- Postal code to constituency mapping
- MP/representative information APIs
- Government open data portals

## Best Practices

1. **Error Handling**: Always validate postal code format before making API calls
2. **Rate Limiting**: Be mindful of API rate limits
3. **Caching**: Consider caching results for frequently requested postal codes
4. **Environment Variables**: Store API keys in environment variables
5. **Testing**: Test with various postal codes, including edge cases
6. **Documentation**: Document any required API keys or setup steps

## Testing Your Implementation

1. Start the backend server:
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

2. Test the endpoint:
```bash
curl -X POST http://localhost:8000/api/lookup \
  -H "Content-Type: application/json" \
  -d '{"country": "YOUR_CODE", "postal_code": "TEST_CODE"}'
```

3. Test from the frontend:
   - Start the frontend: `cd frontend && npm run dev`
   - Select your country and enter a test postal code

## Example: Adding UK Support

See `backend/services/lookup/uk_example.py` (if created) for a complete example implementation.
