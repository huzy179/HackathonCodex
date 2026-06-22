from pydantic import BaseModel
from typing import List, Optional

class ExtractedDocument(BaseModel):
    invoice_number: str
    invoice_number_quote: str
    invoice_number_confidence: float  # Scale 0.0 - 1.0
    
    total_amount: float
    total_amount_quote: str
    total_amount_confidence: float
    
    currency: str
    currency_quote: str
    currency_confidence: float
    
    shipment_date: str  # Format: YYYY-MM-DD
    shipment_date_quote: str
    shipment_date_confidence: float
    
    port_of_loading: str
    port_of_loading_quote: str
    port_of_loading_confidence: float
    
    beneficiary_name: str
    beneficiary_name_quote: str
    beneficiary_name_confidence: float

class Discrepancy(BaseModel):
    field: str
    actual_value: str
    expected_value: str
    reason: str
    severity: str = "Error"

class CheckLCResponse(BaseModel):
    status: str
    extracted: ExtractedDocument
    discrepancies: List[Discrepancy]
    waiver_draft: Optional[str] = None
