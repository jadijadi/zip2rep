from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import sys
import os

# Add services directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import ContactInfo
from services.lookup.canada import lookup_canada_mp
from services.lookup.usa import lookup_usa_representative

app = FastAPI(title="Zip2MP API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LookupRequest(BaseModel):
    country: str
    postal_code: str


class LookupResponse(BaseModel):
    country: str
    postal_code: str
    representatives: List[ContactInfo]
    source: Optional[str] = None


# Country lookup registry
LOOKUP_FUNCTIONS = {
    "CA": lookup_canada_mp,
    "CAN": lookup_canada_mp,
    "CANADA": lookup_canada_mp,
    "US": lookup_usa_representative,
    "USA": lookup_usa_representative,
    "UNITED STATES": lookup_usa_representative,
}


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "supported_countries": ["CA", "US"]}


@app.post("/api/lookup", response_model=LookupResponse)
async def lookup_mp(request: LookupRequest):
    """
    Look up Member of Parliament or representative by country and postal/zip code.
    
    Supported countries:
    - CA/CAN/CANADA: Canadian postal codes (e.g., "K1A 0A6")
    - US/USA/UNITED STATES: US zip codes (e.g., "10001")
    """
    country_upper = request.country.upper().strip()
    
    if country_upper not in LOOKUP_FUNCTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Country '{request.country}' is not supported. Supported countries: CA, US"
        )
    
    try:
        lookup_func = LOOKUP_FUNCTIONS[country_upper]
        representatives = await lookup_func(request.postal_code.strip())
        
        if not representatives:
            raise HTTPException(
                status_code=404,
                detail=f"No representatives found for postal code '{request.postal_code}' in {request.country}"
            )
        
        return LookupResponse(
            country=country_upper,
            postal_code=request.postal_code,
            representatives=representatives
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error looking up representative: {str(e)}"
        )


@app.get("/api/countries")
async def get_supported_countries():
    """Get list of supported countries."""
    return {
        "countries": [
            {"code": "CA", "name": "Canada", "format": "Postal Code (e.g., K1A 0A6)"},
            {"code": "US", "name": "United States", "format": "Zip Code (e.g., 10001)"},
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
