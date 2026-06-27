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

    applicant_name: str = ""
    applicant_name_quote: str = ""
    applicant_name_confidence: float = 0.0

    port_of_discharge: str = ""
    port_of_discharge_quote: str = ""
    port_of_discharge_confidence: float = 0.0

    goods_description: str = ""
    goods_description_quote: str = ""
    goods_description_confidence: float = 0.0

    incoterms: str = ""
    incoterms_quote: str = ""
    incoterms_confidence: float = 0.0

    # New fields for BA v2.0
    invoice_date: str = ""  # Format: YYYY-MM-DD
    invoice_date_quote: str = ""
    invoice_date_confidence: float = 0.0

    beneficiary_address: str = ""
    beneficiary_address_quote: str = ""
    beneficiary_address_confidence: float = 0.0

    applicant_address: str = ""
    applicant_address_quote: str = ""
    applicant_address_confidence: float = 0.0

    quantity: float = 0.0
    quantity_quote: str = ""
    quantity_confidence: float = 0.0

    unit_price: float = 0.0
    unit_price_quote: str = ""
    unit_price_confidence: float = 0.0

    signature_present: str = ""  # "PRESENT" or "MISSING"
    signature_present_quote: str = ""
    signature_present_confidence: float = 0.0

    # --- Validators: clamp all confidence fields to [0.0, 1.0] ---
    @field_validator(
        "invoice_number_confidence",
        "total_amount_confidence",
        "currency_confidence",
        "shipment_date_confidence",
        "port_of_loading_confidence",
        "beneficiary_name_confidence",
        "applicant_name_confidence",
        "port_of_discharge_confidence",
        "goods_description_confidence",
        "incoterms_confidence",
        "invoice_date_confidence",
        "beneficiary_address_confidence",
        "applicant_address_confidence",
        "quantity_confidence",
        "unit_price_confidence",
        "signature_present_confidence",
        mode="before",
    )
    @classmethod
    def clamp_confidence(cls, v: float) -> float:
        return _clamp_confidence(v)


class BLExtracted(BaseModel):
    shipper_name: str = ""
    shipper_name_quote: str = ""
    shipper_name_confidence: float = 0.0

    consignee_name: str = ""
    consignee_name_quote: str = ""
    consignee_name_confidence: float = 0.0

    notify_party: str = ""
    notify_party_quote: str = ""
    notify_party_confidence: float = 0.0

    port_of_loading: str = ""
    port_of_loading_quote: str = ""
    port_of_loading_confidence: float = 0.0

    port_of_discharge: str = ""
    port_of_discharge_quote: str = ""
    port_of_discharge_confidence: float = 0.0

    on_board_date: str = ""  # YYYY-MM-DD
    on_board_date_quote: str = ""
    on_board_date_confidence: float = 0.0

    goods_description: str = ""
    goods_description_quote: str = ""
    goods_description_confidence: float = 0.0

    quantity: str = ""
    quantity_quote: str = ""
    quantity_confidence: float = 0.0

    clean_on_board_clause: str = ""
    clean_on_board_clause_quote: str = ""
    clean_on_board_clause_confidence: float = 0.0

    original_copies_count: str = ""
    original_copies_count_quote: str = ""
    original_copies_count_confidence: float = 0.0

    # New fields for BA v2.0
    bl_date: str = ""  # YYYY-MM-DD
    bl_date_quote: str = ""
    bl_date_confidence: float = 0.0

    vessel_name_voyage: str = ""
    vessel_name_voyage_quote: str = ""
    vessel_name_voyage_confidence: float = 0.0

    signature_present: str = ""  # "PRESENT" or "MISSING"
    signature_present_quote: str = ""
    signature_present_confidence: float = 0.0

    @field_validator(
        "shipper_name_confidence",
        "consignee_name_confidence",
        "notify_party_confidence",
        "port_of_loading_confidence",
        "port_of_discharge_confidence",
        "on_board_date_confidence",
        "goods_description_confidence",
        "quantity_confidence",
        "clean_on_board_clause_confidence",
        "original_copies_count_confidence",
        "bl_date_confidence",
        "vessel_name_voyage_confidence",
        "signature_present_confidence",
        mode="before"
    )
    @classmethod
    def clamp_bl_confidence(cls, v: float) -> float:
        return _clamp_confidence(v)


class PLExtracted(BaseModel):
    goods_name: str = ""
    goods_name_quote: str = ""
    goods_name_confidence: float = 0.0

    quantity: float = 0.0
    quantity_quote: str = ""
    quantity_confidence: float = 0.0

    net_weight: str = ""
    net_weight_quote: str = ""
    net_weight_confidence: float = 0.0

    gross_weight: str = ""
    gross_weight_quote: str = ""
    gross_weight_confidence: float = 0.0

    packages_count: float = 0.0
    packages_count_quote: str = ""
    packages_count_confidence: float = 0.0

    @field_validator(
        "goods_name_confidence",
        "quantity_confidence",
        "net_weight_confidence",
        "gross_weight_confidence",
        "packages_count_confidence",
        mode="before"
    )
    @classmethod
    def clamp_pl_confidence(cls, v: float) -> float:
        return _clamp_confidence(v)



class COExtracted(BaseModel):
    co_number: str = ""
    co_number_quote: str = ""
    co_number_confidence: float = 0.0

    co_date: str = ""  # Format: YYYY-MM-DD
    co_date_quote: str = ""
    co_date_confidence: float = 0.0

    country_of_origin: str = ""
    country_of_origin_quote: str = ""
    country_of_origin_confidence: float = 0.0

    invoice_number: str = ""
    invoice_number_quote: str = ""
    invoice_number_confidence: float = 0.0

    shipper_name: str = ""
    shipper_name_quote: str = ""
    shipper_name_confidence: float = 0.0

    consignee_name: str = ""
    consignee_name_quote: str = ""
    consignee_name_confidence: float = 0.0

    goods_description: str = ""
    goods_description_quote: str = ""
    goods_description_confidence: float = 0.0

    signature_present: str = ""  # "PRESENT" or "MISSING"
    signature_present_quote: str = ""
    signature_present_confidence: float = 0.0

    @field_validator(
        "co_number_confidence",
        "co_date_confidence",
        "country_of_origin_confidence",
        "invoice_number_confidence",
        "shipper_name_confidence",
        "consignee_name_confidence",
        "goods_description_confidence",
        "signature_present_confidence",
        mode="before"
    )
    @classmethod
    def clamp_co_confidence(cls, v: float) -> float:
        return _clamp_confidence(v)


class CQExtracted(BaseModel):
    cq_number: str = ""
    cq_number_quote: str = ""
    cq_number_confidence: float = 0.0

    cq_date: str = ""  # Format: YYYY-MM-DD
    cq_date_quote: str = ""
    cq_date_confidence: float = 0.0

    goods_description: str = ""
    goods_description_quote: str = ""
    goods_description_confidence: float = 0.0

    invoice_number: str = ""
    invoice_number_quote: str = ""
    invoice_number_confidence: float = 0.0

    quality_statement: str = ""  # e.g., "goods comply with the specifications"
    quality_statement_quote: str = ""
    quality_statement_confidence: float = 0.0

    signature_present: str = ""  # "PRESENT" or "MISSING"
    signature_present_quote: str = ""
    signature_present_confidence: float = 0.0

    @field_validator(
        "cq_number_confidence",
        "cq_date_confidence",
        "goods_description_confidence",
        "invoice_number_confidence",
        "quality_statement_confidence",
        "signature_present_confidence",
        mode="before"
    )
    @classmethod
    def clamp_cq_confidence(cls, v: float) -> float:
        return _clamp_confidence(v)


class InsuranceExtracted(BaseModel):
    insurance_number: str = ""
    insurance_number_quote: str = ""
    insurance_number_confidence: float = 0.0

    insurance_date: str = ""  # Format: YYYY-MM-DD
    insurance_date_quote: str = ""
    insurance_date_confidence: float = 0.0

    insured_amount: str = ""
    insured_amount_quote: str = ""
    insured_amount_confidence: float = 0.0

    currency: str = ""
    currency_quote: str = ""
    currency_confidence: float = 0.0

    insured_name: str = ""
    insured_name_quote: str = ""
    insured_name_confidence: float = 0.0

    invoice_number: str = ""
    invoice_number_quote: str = ""
    invoice_number_confidence: float = 0.0

    signature_present: str = ""  # "PRESENT" or "MISSING"
    signature_present_quote: str = ""
    signature_present_confidence: float = 0.0

    @field_validator(
        "insurance_number_confidence",
        "insurance_date_confidence",
        "insured_amount_confidence",
        "currency_confidence",
        "insured_name_confidence",
        "invoice_number_confidence",
        "signature_present_confidence",
        mode="before"
    )
    @classmethod
    def clamp_insurance_confidence(cls, v: float) -> float:
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
    extracted_bl: Optional[BLExtracted] = None
    extracted_pl: Optional[PLExtracted] = None
    extracted_co: Optional[COExtracted] = None
    extracted_cq: Optional[CQExtracted] = None
    extracted_insurance: Optional[InsuranceExtracted] = None
    discrepancies: List[Discrepancy]
    layer1_discrepancies: List[Discrepancy] = []
    cross_discrepancies: List[Discrepancy] = []
    waiver_draft: Optional[str] = None
    cannot_waive: bool = False


class AuditLogSchema(BaseModel):
    time: str
    message: str
    type: str


