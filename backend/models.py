from pydantic import BaseModel
from typing import Optional, List


class ContactInfo(BaseModel):
    name: str
    role: str
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    party: Optional[str] = None
    riding: Optional[str] = None  # For Canada
    district: Optional[str] = None  # For US
