from pydantic import BaseModel, field_validator
from typing import List, Optional


def _clamp_confidence(v: float) -> float:
    """Clamps AI confidence score to [0.0, 1.0] to prevent invalid values."""
    if v is None:
        return 0.0
    return max(0.0, min(1.0, float(v)))


class ExtractedDocument(BaseModel):
    invoice_number: str = ""
    invoice_number_quote: str = ""
    invoice_number_confidence: float = 0.0  # Scale 0.0 - 1.0, clamped by validator

    total_amount: float = 0.0
    total_amount_quote: str = ""
    total_amount_confidence: float = 0.0

    currency: str = ""
    currency_quote: str = ""
    currency_confidence: float = 0.0

    shipment_date: str = ""  # Format: YYYY-MM-DD
    shipment_date_quote: str = ""
    shipment_date_confidence: float = 0.0

    port_of_loading: str = ""
    port_of_loading_quote: str = ""
    port_of_loading_confidence: float = 0.0

    beneficiary_name: str = ""
    beneficiary_name_quote: str = ""
    beneficiary_name_confidence: float = 0.0

    # --- Validators: clamp all confidence fields to [0.0, 1.0] ---
    @field_validator(
        "invoice_number_confidence",
        "total_amount_confidence",
        "currency_confidence",
        "shipment_date_confidence",
        "port_of_loading_confidence",
        "beneficiary_name_confidence",
        mode="before",
    )
    @classmethod
    def clamp_confidence(cls, v: float) -> float:
        return _clamp_confidence(v)


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


class AuditLogSchema(BaseModel):
    time: str
    message: str
    type: str

