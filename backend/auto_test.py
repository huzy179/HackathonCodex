import asyncio
import os
import json
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Import app components
try:
    from app.main import app
    from app.schemas import ExtractedDocument, BLExtracted, PLExtracted, Discrepancy
    import app.services as services
except ImportError:
    import sys
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from app.main import app
    from app.schemas import ExtractedDocument, BLExtracted, PLExtracted, Discrepancy
    import app.services as services

# Test L/C Terms matching client configuration
TEST_LC_TERMS = {
    "max_amount": "50000",
    "currency": "USD",
    "latest_shipment": "2026-06-30",
    "beneficiary_name": "GLOBAL TRADING CORP",
    "port_of_loading": "HAIPHONG PORT",
    "applicant_name": "IMPORT CO LTD",
    "expiry_date": "2026-07-15",
    "port_of_discharge": "HAMBURG PORT",
    "goods_description": "AGRICULTURAL PRODUCTS",
    "incoterms": "CIF",
    "partial_shipment": "ALLOWED",
    "transhipment": "PROHIBITED",
    "amount_tolerance": "5/5"
}

# Mock Extraction Data - Valid Case
MOCK_INVOICE_VALID = ExtractedDocument(
    invoice_number="INV-2026-001",
    invoice_number_quote="Invoice Number: INV-2026-001",
    invoice_number_confidence=1.0,
    total_amount=48500.0,
    total_amount_quote="Total Amount: USD 48,500.00",
    total_amount_confidence=1.0,
    currency="USD",
    currency_quote="USD",
    currency_confidence=1.0,
    shipment_date="2026-06-25",
    shipment_date_quote="Shipment Date: 2026-06-25",
    shipment_date_confidence=1.0,
    port_of_loading="HAIPHONG PORT",
    port_of_loading_quote="Port of Loading: HAIPHONG PORT",
    port_of_loading_confidence=1.0,
    beneficiary_name="GLOBAL TRADING CORP",
    beneficiary_name_quote="Beneficiary: GLOBAL TRADING CORP",
    beneficiary_name_confidence=1.0,
    applicant_name="IMPORT CO LTD",
    applicant_name_quote="Applicant: IMPORT CO LTD",
    applicant_name_confidence=1.0,
    port_of_discharge="HAMBURG PORT",
    port_of_discharge_quote="Port of Discharge: HAMBURG PORT",
    port_of_discharge_confidence=1.0,
    goods_description="AGRICULTURAL PRODUCTS",
    goods_description_quote="Goods: AGRICULTURAL PRODUCTS",
    goods_description_confidence=1.0,
    incoterms="CIF",
    incoterms_quote="CIF",
    incoterms_confidence=1.0
)

MOCK_BL_VALID = BLExtracted(
    shipper_name="GLOBAL TRADING CORP",
    shipper_name_confidence=1.0,
    consignee_name="IMPORT CO LTD",
    consignee_name_confidence=1.0,
    port_of_loading="HAIPHONG PORT",
    port_of_loading_confidence=1.0,
    port_of_discharge="HAMBURG PORT",
    port_of_discharge_confidence=1.0,
    goods_description="AGRICULTURAL PRODUCTS",
    goods_description_confidence=1.0,
    on_board_date="2026-06-25",
    on_board_date_confidence=1.0
)

MOCK_PL_VALID = PLExtracted(
    exporter_name="GLOBAL TRADING CORP",
    exporter_name_confidence=1.0,
    goods_name="AGRICULTURAL PRODUCTS",
    goods_name_confidence=1.0,
    quantity=1000.0,
    quantity_confidence=1.0,
    gross_weight="50000 KGS",
    gross_weight_confidence=1.0
)

# Mock Extraction Data - Invalid / Discrepant Case
MOCK_INVOICE_INVALID = ExtractedDocument(
    invoice_number="INV-2026-002",
    invoice_number_quote="Invoice: INV-2026-002",
    invoice_number_confidence=0.7,  # Low confidence trigger audit
    total_amount=60000.0,  # Fails: Limit is 50000 + 5% (52500)
    total_amount_quote="Amount: USD 60,000.00",
    total_amount_confidence=0.9,
    currency="USD",
    currency_quote="USD",
    currency_confidence=1.0,
    shipment_date="2026-07-05",  # Fails: Latest is 2026-06-30
    shipment_date_quote="Date: 2026-07-05",
    shipment_date_confidence=0.95,
    port_of_loading="HAIPHONG PORT",
    port_of_loading_quote="Loading: HAIPHONG PORT",
    port_of_loading_confidence=1.0,
    beneficiary_name="GLOBAL TRADING CORP",
    beneficiary_name_quote="Beneficiary: GLOBAL TRADING CORP",
    beneficiary_name_confidence=1.0,
    applicant_name="IMPORT CO LTD",
    applicant_name_quote="Applicant: IMPORT CO LTD",
    applicant_name_confidence=1.0,
    port_of_discharge="HAMBURG PORT",
    port_of_discharge_quote="Discharge: HAMBURG PORT",
    port_of_discharge_confidence=1.0,
    goods_description="AGRICULTURAL PRODUCTS",
    goods_description_quote="Goods: AGRICULTURAL PRODUCTS",
    goods_description_confidence=1.0,
    incoterms="FOB",  # Fails: L/C requires CIF
    incoterms_quote="FOB",
    incoterms_confidence=1.0
)

MOCK_BL_INVALID = BLExtracted(
    shipper_name="OTHER SUPPLIER CORP",  # Fails Layer 2 cross check with invoice beneficiary
    shipper_name_confidence=0.6,  # Trigger audit
    consignee_name="IMPORT CO LTD",
    consignee_name_confidence=1.0,
    port_of_loading="HAIPHONG PORT",
    port_of_loading_confidence=1.0,
    port_of_discharge="ROTTERDAM PORT",  # Fails Layer 2 cross check with invoice discharge port
    port_of_discharge_confidence=1.0,
    goods_description="ELECTRONIC SPARES",  # Fails Layer 2 cross check with invoice goods description
    goods_description_confidence=1.0,
    on_board_date="2026-07-05",
    on_board_date_confidence=1.0
)

MOCK_PL_INVALID = PLExtracted(
    exporter_name="OTHER SUPPLIER CORP",
    exporter_name_confidence=1.0,
    goods_name="ELECTRONIC SPARES",  # Fails Layer 2 cross check with invoice goods description
    goods_name_confidence=0.5,  # Trigger audit
    quantity=100.0,
    quantity_confidence=1.0,
    gross_weight="500 KGS",
    gross_weight_confidence=1.0
)

# Async mocks helpers
async def async_pdf_to_base64_image(file_bytes):
    return ("dummy_base64", 0, 1)

class TestLCVisionPipeline(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("app.main.pdf_to_base64_image", side_effect=async_pdf_to_base64_image)
    @patch("app.main.classify_document")
    @patch("app.main.analyze_document_with_ai")
    @patch("app.main.analyze_bill_of_lading_with_ai")
    @patch("app.main.analyze_packing_list_with_ai")
    @patch("app.main.audit_extracted_document")
    @patch("app.main.audit_bill_of_lading")
    @patch("app.main.audit_packing_list")
    def test_multi_document_check_valid(
        self, mock_pl_audit, mock_bl_audit, mock_invoice_audit,
        mock_pl_ai, mock_bl_ai, mock_invoice_ai, mock_classify, mock_pdf2img
    ):
        """
        Tests the /api/v1/check-lc endpoint with a valid set of documents.
        Checks if Layer 2 & 3 validations pass with no discrepancies.
        """
        # Define async side effects
        async def mock_classify_side_effect(image_b64):
            if not hasattr(mock_classify_side_effect, "counter"):
                mock_classify_side_effect.counter = 0
            res = ["INVOICE", "BILL_OF_LADING", "PACKING_LIST"][mock_classify_side_effect.counter]
            mock_classify_side_effect.counter += 1
            return res
        
        async def mock_invoice_ai_effect(image_b64):
            return MOCK_INVOICE_VALID

        async def mock_bl_ai_effect(image_b64):
            return MOCK_BL_VALID

        async def mock_pl_ai_effect(image_b64):
            return MOCK_PL_VALID

        mock_classify.side_effect = mock_classify_side_effect
        mock_invoice_ai.side_effect = mock_invoice_ai_effect
        mock_bl_ai.side_effect = mock_bl_ai_effect
        mock_pl_ai.side_effect = mock_pl_ai_effect

        # Prepare form upload with 3 files
        files = [
            ("files", ("invoice.pdf", b"dummy PDF bytes for invoice", "application/pdf")),
            ("files", ("bill_of_lading.pdf", b"dummy PDF bytes for BL", "application/pdf")),
            ("files", ("packing_list.pdf", b"dummy PDF bytes for PL", "application/pdf"))
        ]
        data = {
            "lc_rules": json.dumps(TEST_LC_TERMS)
        }

        # Request
        response = self.client.post("/api/v1/check-lc", files=files, data=data)
        self.assertEqual(response.status_code, 200)

        # Parse streaming response line by line
        lines = response.text.strip().split("\n")
        print("\nDEBUG STREAMED LINES FOR VALID:", lines)
        result_payload = None
        progress_steps = []
        for line in lines:
            if not line.strip():
                continue
            payload = json.loads(line)
            if payload["type"] == "progress":
                progress_steps.append(payload["msg"])
            elif payload["type"] == "result":
                result_payload = payload["data"]

        # Assertions
        self.assertIsNotNone(result_payload, "Result payload should be streamed at the end")
        self.assertEqual(result_payload["status"], "success")
        
        # No discrepancies should be found
        self.assertEqual(len(result_payload["discrepancies"]), 0, "Should have 0 L/C compliance errors")
        self.assertEqual(len(result_payload["cross_discrepancies"]), 0, "Should have 0 cross-document errors")

    @patch("app.main.pdf_to_base64_image", side_effect=async_pdf_to_base64_image)
    @patch("app.main.classify_document")
    @patch("app.main.analyze_document_with_ai")
    @patch("app.main.analyze_bill_of_lading_with_ai")
    @patch("app.main.analyze_packing_list_with_ai")
    @patch("app.main.audit_extracted_document")
    @patch("app.main.audit_bill_of_lading")
    @patch("app.main.audit_packing_list")
    def test_multi_document_check_discrepant(
        self, mock_pl_audit, mock_bl_audit, mock_invoice_audit,
        mock_pl_ai, mock_bl_ai, mock_invoice_ai, mock_classify, mock_pdf2img
    ):
        """
        Tests the /api/v1/check-lc endpoint with discrepant documents.
        Checks if Layer 2 & 3 validations detect all planned discrepancies.
        """
        async def mock_classify_side_effect(image_b64):
            if not hasattr(mock_classify_side_effect, "counter"):
                mock_classify_side_effect.counter = 0
            res = ["INVOICE", "BILL_OF_LADING", "PACKING_LIST"][mock_classify_side_effect.counter]
            mock_classify_side_effect.counter += 1
            return res
        
        async def mock_invoice_ai_effect(image_b64):
            return MOCK_INVOICE_INVALID

        async def mock_bl_ai_effect(image_b64):
            return MOCK_BL_INVALID

        async def mock_pl_ai_effect(image_b64):
            return MOCK_PL_INVALID

        async def mock_invoice_audit_effect(image_b64, doc):
            return MOCK_INVOICE_INVALID

        async def mock_bl_audit_effect(image_b64, doc):
            return MOCK_BL_INVALID

        async def mock_pl_audit_effect(image_b64, doc):
            return MOCK_PL_INVALID

        mock_classify.side_effect = mock_classify_side_effect
        mock_invoice_ai.side_effect = mock_invoice_ai_effect
        mock_bl_ai.side_effect = mock_bl_ai_effect
        mock_pl_ai.side_effect = mock_pl_ai_effect
        
        mock_invoice_audit.side_effect = mock_invoice_audit_effect
        mock_bl_audit.side_effect = mock_bl_audit_effect
        mock_pl_audit.side_effect = mock_pl_audit_effect

        # Prepare form upload with 3 files
        files = [
            ("files", ("invoice.pdf", b"dummy PDF bytes", "application/pdf")),
            ("files", ("bill_of_lading.pdf", b"dummy PDF bytes", "application/pdf")),
            ("files", ("packing_list.pdf", b"dummy PDF bytes", "application/pdf"))
        ]
        data = {
            "lc_rules": json.dumps(TEST_LC_TERMS)
        }

        # Request
        response = self.client.post("/api/v1/check-lc", files=files, data=data)
        self.assertEqual(response.status_code, 200)

        # Parse streaming response
        result_payload = None
        for line in response.text.strip().split("\n"):
            if not line.strip():
                continue
            payload = json.loads(line)
            if payload["type"] == "result":
                result_payload = payload["data"]

        self.assertIsNotNone(result_payload)
        
        # Layer 3: L/C discrepancies assertions
        discrepancies = result_payload["discrepancies"]
        fields_with_errors = [d["field"] for d in discrepancies]
        
        # Should flag Total Amount (60000 vs 50000 + 5% tolerance)
        self.assertIn("total_amount", fields_with_errors)
        # Should flag Shipment Date (2026-07-05 vs 2026-06-30)
        self.assertIn("shipment_date", fields_with_errors)
        # Should flag Incoterms (FOB vs CIF)
        self.assertIn("incoterms", fields_with_errors)

        # Layer 2: Cross-document discrepancies assertions
        cross_discrepancies = result_payload["cross_discrepancies"]
        cross_fields = [d["field"] for d in cross_discrepancies]
        
        # Shipper (OTHER SUPPLIER CORP) vs Invoice Beneficiary (GLOBAL TRADING CORP)
        self.assertIn("cross_beneficiary_shipper", cross_fields)
        # B/L Discharge Port (ROTTERDAM PORT) vs Invoice Discharge Port (HAMBURG PORT)
        self.assertIn("cross_discharge_port", cross_fields)
        # Goods Description discrepancies
        self.assertIn("cross_goods_invoice_bl", cross_fields)
        self.assertIn("cross_goods_invoice_pl", cross_fields)

        # AI Waiver Draft checking
        self.assertIsNotNone(result_payload["waiver_draft"])
        self.assertTrue(len(result_payload["waiver_draft"]) > 100)

    def test_validate_documents_endpoint(self):
        """
        Tests the /api/v1/validate-documents endpoint with valid and invalid payloads.
        """
        # 1. Valid case
        payload_valid = {
            "lc_rules": TEST_LC_TERMS,
            "extracted": {
                **MOCK_INVOICE_VALID.model_dump(),
                "invoice_date": "2026-06-25",
                "invoice_date_confidence": 1.0,
                "beneficiary_address": "123 Street",
                "beneficiary_address_confidence": 1.0,
                "applicant_address": "456 Avenue",
                "applicant_address_confidence": 1.0,
                "quantity": 1000.0,
                "quantity_confidence": 1.0,
                "unit_price": 48.5,
                "unit_price_confidence": 1.0,
                "signature_present": "PRESENT",
                "signature_present_confidence": 1.0
            },
            "extracted_bl": {
                **MOCK_BL_VALID.model_dump(),
                "notify_party": "SAME AS CONSIGNEE",
                "notify_party_confidence": 1.0,
                "clean_on_board_clause": "Clean on Board",
                "clean_on_board_clause_confidence": 1.0,
                "original_copies_count": "3 originals",
                "original_copies_count_confidence": 1.0,
                "bl_date": "2026-06-25",
                "bl_date_confidence": 1.0,
                "vessel_name_voyage": "OCEAN STAR V100",
                "vessel_name_voyage_confidence": 1.0,
                "signature_present": "PRESENT",
                "signature_present_confidence": 1.0,
                "quantity": "50000 KGS and 1000 PACKAGES",
                "quantity_confidence": 1.0
            },
            "extracted_pl": {
                **MOCK_PL_VALID.model_dump(),
                "net_weight": "49000 KGS",
                "net_weight_confidence": 1.0,
                "packages_count": 1000,
                "packages_count_confidence": 1.0
            },
            "extracted_co": {
                "co_number": "CO-2026-999",
                "co_date": "2026-06-25",
                "country_of_origin": "VIETNAM",
                "invoice_number": "INV-2026-001",
                "shipper_name": "GLOBAL TRADING CORP",
                "consignee_name": "IMPORT CO LTD",
                "goods_description": "AGRICULTURAL PRODUCTS",
                "signature_present": "PRESENT"
            },
            "extracted_cq": {
                "cq_number": "CQ-2026-111",
                "cq_date": "2026-06-26",
                "invoice_number": "INV-2026-001",
                "goods_description": "AGRICULTURAL PRODUCTS",
                "quality_statement": "COMPLIES WITH QUALITY STANDARDS",
                "signature_present": "PRESENT"
            }
        }
        response = self.client.post("/api/v1/validate-documents", json=payload_valid)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(len(data["discrepancies"]), 0)
        self.assertEqual(len(data["layer1_discrepancies"]), 0)
        self.assertEqual(len(data["cross_discrepancies"]), 0)

        # 2. Invalid case (fails Layer 1 checks for C/O and C/Q, fails Cross checks)
        payload_invalid = {
            "lc_rules": TEST_LC_TERMS,
            "extracted": {
                **MOCK_INVOICE_VALID.model_dump(),
                "invoice_date": "2026-06-25",
                "invoice_date_confidence": 1.0,
                "beneficiary_address": "123 Street",
                "beneficiary_address_confidence": 1.0,
                "applicant_address": "456 Avenue",
                "applicant_address_confidence": 1.0,
                "quantity": 1000.0,
                "quantity_confidence": 1.0,
                "unit_price": 48.5,
                "unit_price_confidence": 1.0,
                "signature_present": "PRESENT",
                "signature_present_confidence": 1.0
            },
            "extracted_bl": {
                **MOCK_BL_VALID.model_dump(),
                "notify_party": "SAME AS CONSIGNEE",
                "notify_party_confidence": 1.0,
                "clean_on_board_clause": "Clean on Board",
                "clean_on_board_clause_confidence": 1.0,
                "original_copies_count": "3 originals",
                "original_copies_count_confidence": 1.0,
                "bl_date": "2026-06-25",
                "bl_date_confidence": 1.0,
                "vessel_name_voyage": "OCEAN STAR V100",
                "vessel_name_voyage_confidence": 1.0,
                "signature_present": "PRESENT",
                "signature_present_confidence": 1.0,
                "quantity": "50000 KGS and 1000 PACKAGES",
                "quantity_confidence": 1.0
            },
            "extracted_pl": {
                **MOCK_PL_VALID.model_dump(),
                "net_weight": "49000 KGS",
                "net_weight_confidence": 1.0,
                "packages_count": 1000,
                "packages_count_confidence": 1.0
            },
            "extracted_co": {
                "co_number": "",  # Empty number -> Layer 1 Warning
                "co_date": "invalid-date",  # Invalid date format -> Layer 1 Warning
                "country_of_origin": "VIETNAM",
                "invoice_number": "INV-2026-DIFFERENT",  # Doesn't match invoice number -> Layer 2 Cross Error
                "shipper_name": "FAKE SUPPLIER CORP",  # Doesn't match beneficiary -> Layer 2 Cross Error
                "consignee_name": "IMPORT CO LTD",
                "goods_description": "AGRICULTURAL PRODUCTS",
                "signature_present": "MISSING"  # Missing signature -> Layer 1 Warning
            },
            "extracted_cq": {
                "cq_number": "CQ-999",
                "cq_date": "2026-06-26",
                "invoice_number": "INV-2026-001",
                "goods_description": "ELECTRONIC COMPONENTS",  # Cross goods description discrepancy -> Layer 2 Cross Error
                "quality_statement": "",  # Missing quality statement -> Layer 1 Warning
                "signature_present": "MISSING"  # Missing signature -> Layer 1 Warning
            }
        }
        response = self.client.post("/api/v1/validate-documents", json=payload_invalid)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        
        # Check Layer 1 discrepancies
        l1_fields = [d["field"] for d in data["layer1_discrepancies"]]
        self.assertIn("co_number", l1_fields)
        self.assertIn("co_date", l1_fields)
        self.assertIn("co_signature", l1_fields)
        self.assertIn("cq_statement", l1_fields)
        self.assertIn("cq_signature", l1_fields)

        # Check Cross-document (Layer 2) discrepancies
        cross_fields = [d["field"] for d in data["cross_discrepancies"]]
        self.assertIn("cross_co_invoice_number", cross_fields)
        self.assertIn("cross_co_shipper_beneficiary", cross_fields)
        self.assertIn("cross_cq_goods_invoice", cross_fields)

def run_tests():
    print("[*] Starting Offline Mock Unit & Integration Tests...")
    suite = unittest.TestLoader().loadTestsFromTestCase(TestLCVisionPipeline)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    if result.wasSuccessful():
        print("\n[PASS] ALL PIPELINE INTEGRATION & COMPLIANCE TESTS COMPLETED SUCCESSFULLY!")
        return True
    else:
        print("\n[FAIL] PIPELINE INTEGRATION TESTS FAILED.")
        return False

if __name__ == "__main__":
    run_tests()
