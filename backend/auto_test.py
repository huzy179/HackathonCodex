import asyncio
import os
import json
import fitz  # PyMuPDF
from app.services import pdf_to_base64_image, analyze_document_with_ai, audit_extracted_document, compare_lc, generate_waiver_draft

# Test L/C Terms
TEST_LC_TERMS = {
    "max_amount": 50000.0,
    "currency": "USD",
    "latest_shipment": "2026-06-30",
    "beneficiary_name": "GLOBAL TRADING CORP",
    "port_of_loading": "HAIPHONG PORT"
}

def create_mock_pdf(filename: str, text_content: str):
    """
    Dynamically creates a mock PDF file using PyMuPDF to be used in batch testing.
    """
    doc = fitz.open()
    page = doc.new_page()
    # Insert text lines
    y = 50
    for line in text_content.strip().split("\n"):
        page.insert_text((50, y), line, fontsize=11)
        y += 25
    
    # Save PDF
    doc.save(filename)
    doc.close()
    print(f"[*] Created mock PDF: {filename}")

async def run_test_case(pdf_path: str, case_name: str):
    print("\n" + "="*80)
    print(f"RUNNING TEST CASE: {case_name} ({pdf_path})")
    print("="*80)
    
    if not os.path.exists(pdf_path):
        print(f"[!] File not found: {pdf_path}")
        return

    # Read PDF bytes
    with open(pdf_path, "rb") as f:
        file_bytes = f.read()

    # Step 1: Render PDF to Base64 image
    print("[1/5] Converting PDF to image base64...")
    image_base64 = await pdf_to_base64_image(file_bytes)  # MUST await — async function (uses asyncio.to_thread)
    

    # Step 2: Agent 1 (Extraction)
    print("[2/5] Running Agent 1 (GPT-4o Vision Data Extraction)...")
    extracted_doc = await analyze_document_with_ai(image_base64)
    print(f"      - Extracted Invoice No: {extracted_doc.invoice_number}")
    print(f"      - Extracted Amount: {extracted_doc.total_amount} {extracted_doc.currency}")
    print(f"      - Extracted Date: {extracted_doc.shipment_date}")
    
    # Step 3: Agent 2 (Auditing)
    print("[3/5] Running Agent 2 (Kiểm duyệt độc lập)...")
    audited_doc = await audit_extracted_document(image_base64, extracted_doc)
    print(f"      - Audited Amount: {audited_doc.total_amount} {audited_doc.currency}")
    print(f"      - Audited Beneficiary: {audited_doc.beneficiary_name}")
    
    # Step 4: Compare L/C
    print("[4/5] Running UCP 600 Business Rules Compare...")
    discrepancies = compare_lc(TEST_LC_TERMS, audited_doc)
    
    if discrepancies:
        print(f"\n[⚠️ ALERT] Phát hiện {len(discrepancies)} lỗi bất hợp lệ:")
        for idx, d in enumerate(discrepancies, 1):
            print(f"   {idx}. Trường: {d.field} | Thực tế: {d.actual_value} | L/C: {d.expected_value}")
            print(f"      Chi tiết: {d.reason}")
    else:
        print("\n[✅ PASS] Bộ chứng từ hợp lệ hoàn toàn với điều khoản L/C!")

    # Step 5: Draft Waiver
    print("\n[5/5] Agentic Flow: Soạn thư xin Waiver tự động từ AI...")
    waiver_draft = await generate_waiver_draft(discrepancies, TEST_LC_TERMS)
    print("--- DỰ THẢO EMAIL/SWIFT ---")
    print(waiver_draft[:250] + "\n... [Cắt bớt để hiển thị gọn] ...")

async def main():
    # Setup test folder
    os.makedirs("test_samples", exist_ok=True)
    
    # Check for OPENAI_API_KEY
    if not os.getenv("OPENAI_API_KEY"):
        print("[!] Warning: OPENAI_API_KEY environment variable is not set. Testing will fail on API calls.")
        print("Please configure it in .env or your terminal first.")
        return

    # Create case 1: Valid document
    case_1_text = (
        "COMMERCIAL INVOICE\n"
        "Invoice Number: INV-2026-001\n"
        "Total Amount: USD 48,500.00\n"
        "Beneficiary: GLOBAL TRADING CORP\n"
        "Port of Loading: HAIPHONG PORT\n"
        "Shipment Date: 2026-06-25"
    )
    create_mock_pdf("test_samples/invoice_valid.pdf", case_1_text)

    # Create case 2: Invalid document (over limit and late date)
    case_2_text = (
        "COMMERCIAL INVOICE\n"
        "Invoice Number: INV-2026-002\n"
        "Total Amount: USD 73,000.00\n"
        "Beneficiary: GLOBAL TRADING CO LTD\n"
        "Port of Loading: SHANGHAI PORT\n"
        "Shipment Date: 2026-07-05"
    )
    create_mock_pdf("test_samples/invoice_invalid.pdf", case_2_text)

    # Run tests
    await run_test_case("test_samples/invoice_valid.pdf", "Hóa đơn Hợp lệ (Pass)")
    await run_test_case("test_samples/invoice_invalid.pdf", "Hóa đơn Sai lệch (Fail)")

    print("\n[+] BATCH TESTING RUN COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())
