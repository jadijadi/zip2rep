"""
Base classes and interfaces for MP lookup services.
"""
from typing import List
from pydantic import BaseModel


class ContactInfo(BaseModel):
    name: str
    role: str
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    address: str | None = None
    party: str | None = None
    riding: str | None = None
    district: str | None = None


async def lookup_mp(country: str, postal_code: str) -> List[ContactInfo]:
    """
    Base lookup function - should be implemented by country-specific modules.
    """
    raise NotImplementedError("This function should be implemented by country-specific modules")
