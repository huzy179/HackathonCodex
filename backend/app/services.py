import asyncio
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None
import os
import json
import base64
from typing import Optional
from datetime import datetime
from openai import AsyncOpenAI
from .schemas import ExtractedDocument, Discrepancy, BLExtracted, PLExtracted, COExtracted, CQExtracted, InsuranceExtracted

# Initialize single shared Async OpenAI Client (reused across all agents)
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY") or "mock-key-for-local-testing")

# Maximum PDF file size accepted (10 MB) - guard against memory exhaustion
MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB


def _render_pdf_to_base64(file_bytes: bytes) -> tuple[str, int, int]:
    """
    [Sync] Scans PDF pages to find the best candidate (highest keyword count)
    and renders that page to a JPEG image encoded in base64.
    Returns a tuple of (base64_string, selected_page_idx, total_pages).
    """
    if fitz is None:
        raise ImportError("Thư viện PyMuPDF (fitz) không khả dụng trên hệ thống này. Vui lòng cài đặt bổ sung.")
    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        total_pages = len(doc)
        if total_pages == 0:
            raise ValueError("File PDF không chứa trang nào.")
        
        # Heuristic keywords for commercial invoices and shipping documents
        keywords = ["invoice", "total amount", "beneficiary", "shipment date", "amount due", "hóa đơn", "tổng tiền", "người thụ hưởng", "port of loading"]
        
        best_page_idx = 0
        max_keyword_count = -1
        
        # Scan up to 10 pages to avoid performance overhead on large files
        num_pages_to_scan = min(total_pages, 10)
        for i in range(num_pages_to_scan):
            try:
                text = doc[i].get_text().lower()
                count = sum(1 for kw in keywords if kw in text)
                if count > max_keyword_count:
                    max_keyword_count = count
                    best_page_idx = i
            except Exception:
                pass
                
        page = doc[best_page_idx]
        pix = page.get_pixmap(dpi=150)  # 150 DPI is balanced for quality and size
        image_bytes = pix.tobytes("jpg")
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")
        return image_base64, best_page_idx, total_pages


async def pdf_to_base64_image(file_bytes: bytes) -> tuple[str, int, int]:
    """
    [Async] Scans and renders the best page of the PDF to a JPEG image.
    Returns (base64_string, selected_page_idx, total_pages).
    """
    if len(file_bytes) > MAX_PDF_BYTES:
        raise ValueError(f"File PDF vượt quá giới hạn kích thước cho phép ({MAX_PDF_BYTES // 1024 // 1024} MB).")
    return await asyncio.to_thread(_render_pdf_to_base64, file_bytes)


async def analyze_document_with_ai(image_base64: str) -> ExtractedDocument:
    """
    Agent 1 (Extractor): Uses GPT-4o Vision API to directly look at the document image,
    run OCR, and parse data with quotes and self-assessed confidence scores.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu thanh toán quốc tế kiểm tra L/C (Agent 1).\n"
        "Nhiệm vụ: Hãy phân tích hình ảnh chứng từ được cung cấp, tự nhận diện chữ (OCR) và điền vào cấu trúc JSON.\n"
        "Đối với mỗi trường dữ liệu (ví dụ: invoice_number, total_amount...), bạn phải cung cấp:\n"
        "1. Giá trị trích xuất thực tế (total_amount phải là số thực, shipment_date và invoice_date định dạng YYYY-MM-DD, quantity và unit_price là số thực).\n"
        "2. ĐOẠN TRÍCH DẪN GỐC (exact quote/snippet) chứa con số hoặc thông tin đó hiển thị trên ảnh để làm minh chứng.\n"
        "3. ĐIỂM TIN CẬY (confidence score) từ 0.0 đến 1.0. Đánh giá thấp (dưới 0.8) nếu chữ bị mờ nhòe, bị dấu đóng đè lên, "
        "hoặc thông tin mang tính chất suy đoán/không rõ ràng trên ảnh.\n"
        "Các trường thông tin cần bóc tách bao gồm: invoice_number, total_amount, currency, shipment_date, port_of_loading, "
        "beneficiary_name, applicant_name, port_of_discharge, goods_description, incoterms, "
        "invoice_date, beneficiary_address, applicant_address, quantity, unit_price, signature_present ('PRESENT' hoặc 'MISSING').\n"
        "Tuyệt đối không bịa dữ liệu. Nếu không nhìn thấy, hãy để chuỗi rỗng cho quote và giá trị mặc định."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Đây là ảnh trang đầu tiên của chứng từ thương mại cần bóc tách. Hãy phân tích kỹ hình ảnh này:"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            }
        ],
        response_format=ExtractedDocument
    )
    
    return response.choices[0].message.parsed

async def audit_extracted_document(image_base64: str, extracted: ExtractedDocument) -> ExtractedDocument:
    """
    Agent 2 (Auditor): Reviews the proposed extraction against the document image.
    Corrects any OCR typos, wrong numbers, stamps overlay issues, or date format errors.
    Re-assesses and updates the confidence score if changes are made.
    """
    system_prompt = (
        "Bạn là chuyên gia Kiểm toán viên độc lập kiểm tra tài liệu thanh toán quốc tế (Agent 2).\n"
        "Nhiệm vụ: Bạn hãy nhận dữ liệu bóc tách được từ Agent 1 và đối chiếu kỹ lưỡng lại với hình ảnh chứng từ gốc.\n"
        "Hãy kiểm tra xem các trích dẫn (quote), giá trị và điểm tự tin (confidence) có khớp và chính xác 100% so với những gì hiển thị trên ảnh hay không.\n"
        "Nếu phát hiện Agent 1 bóc tách sai lệch hoặc đánh giá sai độ tin cậy (ví dụ như chữ rất mờ nhưng Agent 1 để điểm tin cậy 1.0), "
        "bạn hãy tiến hành đính chính dữ liệu và cập nhật lại điểm tự tin tương ứng.\n"
        "Các trường cần đối chiếu: invoice_number, total_amount, currency, shipment_date, port_of_loading, beneficiary_name, applicant_name, port_of_discharge, goods_description, incoterms, "
        "invoice_date, beneficiary_address, applicant_address, quantity, unit_price, signature_present.\n"
        "Đầu ra của bạn phải tuân thủ tuyệt đối cấu trúc ExtractedDocument JSON."
    )

    user_content = [
        {"type": "text", "text": f"Dữ liệu bóc tách đề xuất từ Agent 1 cần kiểm tra chéo:\n{extracted.model_dump_json(indent=2)}\n\nHãy đối chiếu kỹ với hình ảnh chứng từ gốc này để kiểm toán và chỉnh sửa nếu có sai sót:"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{image_base64}"
            }
        }
    ]

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        response_format=ExtractedDocument
    )

    return response.choices[0].message.parsed

async def classify_document(image_base64: str) -> str:
    """
    Uses GPT-4o to classify the document image into:
    "INVOICE", "BILL_OF_LADING", "PACKING_LIST", "LETTER_OF_CREDIT", "CO", "CQ", or "UNKNOWN".
    """
    system_prompt = (
        "Bạn là trợ lý phân loại chứng từ thương mại quốc tế.\n"
        "Hãy phân tích hình ảnh được cung cấp và xác định loại chứng từ này thuộc loại nào:\n"
        "- 'INVOICE': Hóa đơn thương mại (Commercial Invoice).\n"
        "- 'BILL_OF_LADING': Vận đơn đường biển (Bill of Lading / B/L).\n"
        "- 'PACKING_LIST': Phiếu đóng gói hàng hóa (Packing List).\n"
        "- 'LETTER_OF_CREDIT': Thư tín dụng (Letter of Credit / L/C / MT700).\n"
        "- 'CO': Chứng nhận xuất xứ (Certificate of Origin / C/O).\n"
        "- 'CQ': Chứng nhận chất lượng (Certificate of Quality / C/Q).\n"
        "- 'UNKNOWN': Tài liệu khác.\n"
        "Chỉ trả ra đúng một trong các từ khóa trên ở định dạng chữ in hoa."
    )
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Phân loại chứng từ này:"},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.0
        )
        val = response.choices[0].message.content.strip().upper()
        if val in ["INVOICE", "BILL_OF_LADING", "PACKING_LIST", "LETTER_OF_CREDIT", "CO", "CQ"]:
            return val
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"

async def analyze_bill_of_lading_with_ai(image_base64: str) -> BLExtracted:
    """
    Agent 1 (Extractor) for Bill of Lading.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu vận đơn đường biển (Bill of Lading - B/L) thanh toán quốc tế (Agent 1).\n"
        "Nhiệm vụ: Hãy phân tích hình ảnh vận đơn được cung cấp, tự nhận diện chữ (OCR) và điền vào cấu trúc JSON BLExtracted.\n"
        "Đối với mỗi trường dữ liệu (ví dụ: shipper_name, port_of_loading, on_board_date...), bạn phải cung cấp:\n"
        "1. Giá trị trích xuất thực tế (on_board_date và bl_date phải định dạng YYYY-MM-DD).\n"
        "2. ĐOẠN TRÍCH DẪN GỐC (exact quote/snippet) chứa thông tin đó hiển thị trên ảnh.\n"
        "3. ĐIỂM TIN CẬY (confidence score) từ 0.0 đến 1.0.\n"
        "Các trường cần bóc tách:\n"
        "- shipper_name: Tên Shipper\n"
        "- consignee_name: Tên Consignee\n"
        "- notify_party: Tên Notify Party\n"
        "- port_of_loading: Cảng bốc hàng\n"
        "- port_of_discharge: Cảng dỡ hàng\n"
        "- on_board_date: Ngày xếp hàng lên tàu (thường ghi 'Clean on board', 'Shipped on board' kèm ngày)\n"
        "- goods_description: Mô tả hàng hóa\n"
        "- quantity: Số lượng / Trọng lượng hàng hóa\n"
        "- clean_on_board_clause: Ghi chú thể hiện vận đơn sạch ('CLEAN ON BOARD' hoặc các câu tương đương)\n"
        "- original_copies_count: Số bộ vận đơn gốc phát hành (VD: '3/3 originals', 'Three (3)')\n"
        "- bl_date: Ngày ký phát hành B/L (Format YYYY-MM-DD)\n"
        "- vessel_name_voyage: Tên tàu và số chuyến (vessel name & voyage no)\n"
        "- signature_present: Chữ ký của Carrier / Agent ('PRESENT' hoặc 'MISSING')\n"
        "Tuyệt đối không bịa dữ liệu. Nếu không nhìn thấy, hãy để chuỗi rỗng cho quote và giá trị mặc định."
    )
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Bóc tách dữ liệu từ Bill of Lading này:"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            }
        ],
        response_format=BLExtracted
    )
    return response.choices[0].message.parsed

async def audit_bill_of_lading(image_base64: str, extracted: BLExtracted) -> BLExtracted:
    """
    Agent 2 (Auditor) for Bill of Lading.
    """
    system_prompt = (
        "Bạn là chuyên gia Kiểm toán viên độc lập kiểm tra vận đơn đường biển (Agent 2).\n"
        "Nhiệm vụ: Nhận dữ liệu bóc tách đề xuất từ Agent 1 và đối chiếu lại với hình ảnh B/L gốc.\n"
        "Đính chính bất kỳ lỗi nào hiển thị trên ảnh và cập nhật lại điểm tự tin tương ứng.\n"
        "Các trường đối chiếu: shipper_name, consignee_name, notify_party, port_of_loading, port_of_discharge, on_board_date, goods_description, quantity, clean_on_board_clause, original_copies_count, bl_date, vessel_name_voyage, signature_present.\n"
        "Đầu ra của bạn phải tuân thủ tuyệt đối cấu trúc BLExtracted JSON."
    )
    user_content = [
        {"type": "text", "text": f"Dữ liệu đề xuất từ Agent 1:\n{extracted.model_dump_json(indent=2)}\n\nHãy đối chiếu kỹ với hình ảnh gốc để kiểm toán:"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{image_base64}"
            }
        }
    ]
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        response_format=BLExtracted
    )
    return response.choices[0].message.parsed

async def analyze_packing_list_with_ai(image_base64: str) -> PLExtracted:
    """
    Agent 1 (Extractor) for Packing List.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu Phiếu đóng gói hàng hóa (Packing List) thanh toán quốc tế (Agent 1).\n"
        "Nhiệm vụ: Hãy phân tích hình ảnh được cung cấp và điền vào cấu trúc JSON PLExtracted.\n"
        "Các trường cần bóc tách:\n"
        "- goods_name: Tên hàng hóa\n"
        "- quantity: Số lượng từng loại\n"
        "- net_weight: Trọng lượng tịnh (Net Weight)\n"
        "- gross_weight: Trọng lượng cả bao bì (Gross Weight)\n"
        "- packages_count: Số kiện/thùng (Number of Packages)\n"
        "Tuyệt đối không bịa dữ liệu. Nếu không nhìn thấy, hãy để chuỗi rỗng cho quote và giá trị mặc định."
    )
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Bóc tách dữ liệu từ Packing List này:"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            }
        ],
        response_format=PLExtracted
    )
    return response.choices[0].message.parsed

async def audit_packing_list(image_base64: str, extracted: PLExtracted) -> PLExtracted:
    """
    Agent 2 (Auditor) for Packing List.
    """
    system_prompt = (
        "Bạn là chuyên gia Kiểm toán viên độc lập kiểm tra Phiếu đóng gói (Agent 2).\n"
        "Nhiệm vụ: Nhận dữ liệu bóc tách đề xuất từ Agent 1 và đối chiếu lại với hình ảnh Packing List gốc.\n"
        "Đầu ra của bạn phải tuân thủ tuyệt đối cấu trúc PLExtracted JSON."
    )
    user_content = [
        {"type": "text", "text": f"Dữ liệu đề xuất từ Agent 1:\n{extracted.model_dump_json(indent=2)}\n\nHãy đối chiếu kỹ với hình ảnh gốc để kiểm toán:"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{image_base64}"
            }
        }
    ]
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        response_format=PLExtracted
    )
    return response.choices[0].message.parsed

async def analyze_co_with_ai(image_base64: str) -> COExtracted:
    """
    Agent 1 (Extractor) for Certificate of Origin (C/O).
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu Chứng nhận xuất xứ (Certificate of Origin - C/O) thanh toán quốc tế (Agent 1).\n"
        "Nhiệm vụ: Hãy phân tích hình ảnh được cung cấp và điền vào cấu trúc JSON COExtracted.\n"
        "Các trường cần bóc tách:\n"
        "- co_number: Số chứng nhận xuất xứ (C/O No.)\n"
        "- co_date: Ngày phát hành C/O (Format: YYYY-MM-DD)\n"
        "- country_of_origin: Quốc gia xuất xứ (Country of Origin, ví dụ: Vietnam, China...)\n"
        "- invoice_number: Số hóa đơn thương mại được tham chiếu trên C/O\n"
        "- shipper_name: Tên của người giao hàng (Shipper/Exporter)\n"
        "- consignee_name: Tên của người nhận hàng (Consignee)\n"
        "- goods_description: Mô tả hàng hóa\n"
        "- signature_present: Sự hiện diện của chữ ký & đóng dấu xác nhận ('PRESENT' hoặc 'MISSING')\n"
        "Tuyệt đối không bịa dữ liệu. Nếu không nhìn thấy, hãy để chuỗi rỗng cho quote và giá trị mặc định."
    )
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Bóc tách dữ liệu từ C/O này:"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            }
        ],
        response_format=COExtracted
    )
    return response.choices[0].message.parsed

async def audit_co(image_base64: str, extracted: COExtracted) -> COExtracted:
    """
    Agent 2 (Auditor) for Certificate of Origin (C/O).
    """
    system_prompt = (
        "Bạn là chuyên gia Kiểm toán viên độc lập kiểm tra Chứng nhận xuất xứ (C/O) (Agent 2).\n"
        "Nhiệm vụ: Nhận dữ liệu bóc tách đề xuất từ Agent 1 và đối chiếu lại với hình ảnh C/O gốc để kiểm toán.\n"
        "Hãy rà soát kỹ số hiệu, ngày tháng, tên các bên, xuất xứ và chữ ký xem có chính xác 100% không. Cập nhật lại giá trị và độ tự tin (confidence) tương ứng nếu có sai sót.\n"
        "Đầu ra của bạn phải tuân thủ tuyệt đối cấu trúc COExtracted JSON."
    )
    user_content = [
        {"type": "text", "text": f"Dữ liệu đề xuất từ Agent 1:\n{extracted.model_dump_json(indent=2)}\n\nHãy đối chiếu kỹ với hình ảnh gốc để kiểm toán:"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{image_base64}"
            }
        }
    ]
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        response_format=COExtracted
    )
    return response.choices[0].message.parsed

async def analyze_cq_with_ai(image_base64: str) -> CQExtracted:
    """
    Agent 1 (Extractor) for Certificate of Quality (C/Q).
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu Chứng nhận chất lượng (Certificate of Quality - C/Q) thanh toán quốc tế (Agent 1).\n"
        "Nhiệm vụ: Hãy phân tích hình ảnh được cung cấp và điền vào cấu trúc JSON CQExtracted.\n"
        "Các trường cần bóc tách:\n"
        "- cq_number: Số chứng nhận chất lượng (C/Q No.)\n"
        "- cq_date: Ngày phát hành C/Q (Format: YYYY-MM-DD)\n"
        "- goods_description: Mô tả hàng hóa\n"
        "- invoice_number: Số hóa đơn thương mại được tham chiếu\n"
        "- quality_statement: Nội dung cam kết chất lượng (ví dụ: 'goods are in good quality', 'complies with specifications'...)\n"
        "- signature_present: Sự hiện diện của chữ ký & đóng dấu xác nhận ('PRESENT' hoặc 'MISSING')\n"
        "Tuyệt đối không bịa dữ liệu. Nếu không nhìn thấy, hãy để chuỗi rỗng cho quote và giá trị mặc định."
    )
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Bóc tách dữ liệu từ C/Q này:"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            }
        ],
        response_format=CQExtracted
    )
    return response.choices[0].message.parsed

async def audit_cq(image_base64: str, extracted: CQExtracted) -> CQExtracted:
    """
    Agent 2 (Auditor) for Certificate of Quality (C/Q).
    """
    system_prompt = (
        "Bạn là chuyên gia Kiểm toán viên độc lập kiểm tra Chứng nhận chất lượng (C/Q) (Agent 2).\n"
        "Nhiệm vụ: Nhận dữ liệu bóc tách đề xuất từ Agent 1 và đối chiếu lại với hình ảnh C/Q gốc để kiểm toán.\n"
        "Hãy rà soát kỹ số hiệu, ngày tháng, mô tả hàng hóa, cam kết chất lượng và chữ ký xem có chính xác 100% không. Cập nhật lại giá trị và độ tự tin (confidence) tương ứng nếu có sai sót.\n"
        "Đầu ra của bạn phải tuân thủ tuyệt đối cấu trúc CQExtracted JSON."
    )
    user_content = [
        {"type": "text", "text": f"Dữ liệu đề xuất từ Agent 1:\n{extracted.model_dump_json(indent=2)}\n\nHãy đối chiếu kỹ với hình ảnh gốc để kiểm toán:"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{image_base64}"
            }
        }
    ]
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        response_format=CQExtracted
    )
    return response.choices[0].message.parsed


async def analyze_insurance_with_ai(image_base64: str) -> InsuranceExtracted:
    """
    Agent 1 (Extractor) for Insurance Certificate.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu Chứng thư bảo hiểm (Insurance Certificate) thanh toán quốc tế (Agent 1).\n"
        "Nhiệm vụ: Hãy phân tích hình ảnh được cung cấp và điền vào cấu trúc JSON InsuranceExtracted.\n"
        "Các trường cần bóc tách:\n"
        "- insurance_number: Số chứng thư bảo hiểm (Policy/Certificate No.)\n"
        "- insurance_date: Ngày phát hành chứng thư bảo hiểm (Format: YYYY-MM-DD)\n"
        "- insured_amount: Số tiền bảo hiểm\n"
        "- currency: Loại tiền tệ của số tiền bảo hiểm\n"
        "- insured_name: Tên bên được bảo hiểm (Insured party)\n"
        "- invoice_number: Số hóa đơn thương mại được tham chiếu\n"
        "- signature_present: Sự hiện diện của chữ ký/đóng dấu xác nhận ('PRESENT' hoặc 'MISSING')\n"
        "Tuyệt đối không bịa dữ liệu. Nếu không nhìn thấy, hãy để chuỗi rỗng cho quote và giá trị mặc định."
    )
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Bóc tách dữ liệu từ Chứng thư bảo hiểm này:"},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                    }
                ]
            }
        ],
        response_format=InsuranceExtracted
    )
    return response.choices[0].message.parsed


async def audit_insurance(image_base64: str, extracted: InsuranceExtracted) -> InsuranceExtracted:
    """
    Agent 2 (Auditor) for Insurance Certificate.
    """
    system_prompt = (
        "Bạn là chuyên gia Kiểm toán viên độc lập kiểm tra Chứng thư bảo hiểm (Insurance Certificate) (Agent 2).\n"
        "Nhiệm vụ: Nhận dữ liệu bóc tách đề xuất từ Agent 1 và đối chiếu lại với hình ảnh chứng thư bảo hiểm gốc để kiểm toán.\n"
        "Hãy rà soát kỹ số hiệu bảo hiểm, ngày phát hành, số tiền bảo hiểm, loại tiền tệ, tên bên được bảo hiểm và chữ ký xem có chính xác 100% không. Cập nhật lại giá trị và độ tự tin (confidence) tương ứng nếu có sai sót.\n"
        "Đầu ra của bạn phải tuân thủ tuyệt đối cấu trúc InsuranceExtracted JSON."
    )
    user_content = [
        {"type": "text", "text": f"Dữ liệu đề xuất từ Agent 1:\n{extracted.model_dump_json(indent=2)}\n\nHãy đối chiếu kỹ với hình ảnh gốc để kiểm toán:"},
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{image_base64}"
            }
        }
    ]
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        response_format=InsuranceExtracted
    )
    return response.choices[0].message.parsed

def validate_layer1(
    invoice: ExtractedDocument,
    bl: Optional[BLExtracted],
    pl: Optional[PLExtracted],
    co: Optional[COExtracted] = None,
    cq: Optional[CQExtracted] = None,
    insurance: Optional[InsuranceExtracted] = None
) -> list[Discrepancy]:
    """
    Layer 1: Document-level Validation (Kiểm tra nội bộ từng chứng từ)
    """
    discrepancies = []

    # --- 1A. Commercial Invoice ---
    if invoice and invoice.invoice_number != "":  # Avoid running on dummy fallback invoices
        if not invoice.invoice_number.strip():
            discrepancies.append(Discrepancy(field="invoice_number", actual_value="Trống", expected_value="Phải có", reason="Invoice Number không được để trống", severity="Error"))
        
        if not invoice.invoice_date.strip():
            discrepancies.append(Discrepancy(field="invoice_date", actual_value="Trống", expected_value="Định dạng YYYY-MM-DD", reason="Invoice Date không được để trống", severity="Error"))
        else:
            try:
                datetime.strptime(invoice.invoice_date.strip(), "%Y-%m-%d")
            except ValueError:
                discrepancies.append(Discrepancy(field="invoice_date", actual_value=invoice.invoice_date, expected_value="Định dạng YYYY-MM-DD", reason="Invoice Date định dạng ngày không hợp lệ", severity="Error"))

        if not invoice.beneficiary_name.strip():
            discrepancies.append(Discrepancy(field="invoice_beneficiary", actual_value="Trống", expected_value="Phải có", reason="Tên & địa chỉ Beneficiary không được để trống", severity="Error"))

        if not invoice.applicant_name.strip():
            discrepancies.append(Discrepancy(field="invoice_applicant", actual_value="Trống", expected_value="Phải có", reason="Tên & địa chỉ Applicant không được để trống", severity="Error"))

        if not invoice.goods_description.strip():
            discrepancies.append(Discrepancy(field="invoice_goods", actual_value="Trống", expected_value="Phải có", reason="Mô tả hàng hóa không được để trống", severity="Error"))

        if invoice.quantity <= 0:
            discrepancies.append(Discrepancy(field="invoice_quantity", actual_value=str(invoice.quantity), expected_value="> 0", reason="Số lượng hàng hóa phải là số dương", severity="Error"))

        if invoice.unit_price <= 0:
            discrepancies.append(Discrepancy(field="invoice_unit_price", actual_value=str(invoice.unit_price), expected_value="> 0", reason="Đơn giá hàng hóa phải là số dương", severity="Error"))

        if invoice.quantity > 0 and invoice.unit_price > 0 and invoice.total_amount > 0:
            expected_total = invoice.quantity * invoice.unit_price
            if abs(invoice.total_amount - expected_total) > 0.5:  # allow tiny tolerance for rounding
                discrepancies.append(Discrepancy(field="invoice_total_amount", actual_value=f"{invoice.total_amount:,.2f}", expected_value=f"{expected_total:,.2f}", reason="Tổng giá trị không bằng Số lượng × Đơn giá", severity="Error"))

        if not invoice.currency.strip():
            discrepancies.append(Discrepancy(field="invoice_currency", actual_value="Trống", expected_value="Phải có", reason="Loại tiền tệ không được để trống", severity="Error"))

        if not invoice.incoterms.strip():
            discrepancies.append(Discrepancy(field="invoice_incoterms", actual_value="Trống", expected_value="Phải có Incoterms", reason="Thiếu điều kiện Incoterms", severity="Warning"))

        if invoice.signature_present != "PRESENT":
            discrepancies.append(Discrepancy(field="invoice_signature", actual_value="Vắng mặt / Không rõ", expected_value="PRESENT", reason="Thiếu chữ ký / con dấu của Beneficiary", severity="Warning"))

    # --- 1B. Bill of Lading (B/L) ---
    if bl:
        if not bl.shipper_name.strip():
            discrepancies.append(Discrepancy(field="bl_shipper", actual_value="Trống", expected_value="Phải có", reason="Tên Shipper không được để trống", severity="Error"))

        if not bl.consignee_name.strip():
            discrepancies.append(Discrepancy(field="bl_consignee", actual_value="Trống", expected_value="Phải có", reason="Tên Consignee không được để trống", severity="Error"))

        if not bl.notify_party.strip():
            discrepancies.append(Discrepancy(field="bl_notify_party", actual_value="Trống", expected_value="Phải có", reason="Thiếu thông tin Notify Party trên B/L", severity="Warning"))

        if not bl.port_of_loading.strip():
            discrepancies.append(Discrepancy(field="bl_port_of_loading", actual_value="Trống", expected_value="Phải có", reason="Cảng bốc hàng không được để trống", severity="Error"))

        if not bl.port_of_discharge.strip():
            discrepancies.append(Discrepancy(field="bl_port_of_discharge", actual_value="Trống", expected_value="Phải có", reason="Cảng dỡ hàng không được để trống", severity="Error"))

        if not bl.on_board_date.strip():
            discrepancies.append(Discrepancy(field="bl_on_board_date", actual_value="Trống", expected_value="Định dạng YYYY-MM-DD", reason="Ngày xếp hàng lên tàu (On Board Date) không được để trống", severity="Error"))

        if not bl.bl_date.strip():
            discrepancies.append(Discrepancy(field="bl_date", actual_value="Trống", expected_value="Định dạng YYYY-MM-DD", reason="Ngày phát hành B/L không được để trống", severity="Error"))

        if not bl.vessel_name_voyage.strip():
            discrepancies.append(Discrepancy(field="bl_vessel", actual_value="Trống", expected_value="Phải có", reason="Thiếu thông tin Vessel Name & Voyage No.", severity="Warning"))

        if not bl.goods_description.strip():
            discrepancies.append(Discrepancy(field="bl_goods", actual_value="Trống", expected_value="Phải có", reason="Mô tả hàng hóa trên B/L không được để trống", severity="Error"))

        if not bl.quantity.strip():
            discrepancies.append(Discrepancy(field="bl_quantity", actual_value="Trống", expected_value="Phải có", reason="Số lượng/Trọng lượng hàng không được để trống", severity="Error"))

        clean_lower = bl.clean_on_board_clause.strip().lower()
        if not clean_lower or ("clean" not in clean_lower and "on board" not in clean_lower):
            discrepancies.append(Discrepancy(field="bl_clean_clause", actual_value=bl.clean_on_board_clause or "Không có", expected_value="Clean on Board", reason="Vận đơn phải là loại sạch (Clean on Board) — không được có ghi chú bảo lưu xấu", severity="Error"))

        if bl.signature_present != "PRESENT":
            discrepancies.append(Discrepancy(field="bl_signature", actual_value="Vắng mặt / Không rõ", expected_value="PRESENT", reason="Thiếu chữ ký của Carrier hoặc Agent (UCP 600 Art.20)", severity="Error"))

        if not bl.original_copies_count.strip():
            discrepancies.append(Discrepancy(field="bl_copies", actual_value="Trống", expected_value="Phải ghi rõ số bản gốc", reason="Thiếu thông tin số bộ B/L gốc phát hành", severity="Warning"))

    # --- 1C. Packing List (P/L) ---
    if pl:
        if not pl.goods_name.strip():
            discrepancies.append(Discrepancy(field="pl_goods", actual_value="Trống", expected_value="Phải có", reason="Tên hàng hóa trên Packing List không được để trống", severity="Error"))

        if pl.quantity <= 0:
            discrepancies.append(Discrepancy(field="pl_quantity", actual_value=str(pl.quantity), expected_value="> 0", reason="Số lượng hàng trên Packing List phải là số dương", severity="Error"))

        if not pl.net_weight.strip():
            discrepancies.append(Discrepancy(field="pl_net_weight", actual_value="Trống", expected_value="Phải có", reason="Trọng lượng tịnh (Net Weight) không được để trống", severity="Error"))

        if not pl.gross_weight.strip():
            discrepancies.append(Discrepancy(field="pl_gross_weight", actual_value="Trống", expected_value="Phải có", reason="Trọng lượng cả bao bì (Gross Weight) không được để trống", severity="Error"))

        if pl.packages_count <= 0:
            discrepancies.append(Discrepancy(field="pl_packages_count", actual_value=str(pl.packages_count), expected_value="> 0", reason="Số kiện/thùng (Number of Packages) phải là số dương", severity="Error"))

    # --- 1D. Certificate of Origin (C/O) ---
    if co:
        if not co.co_number.strip():
            discrepancies.append(Discrepancy(field="co_number", actual_value="Trống", expected_value="Phải có", reason="C/O Number không được để trống", severity="Error"))

        if not co.co_date.strip():
            discrepancies.append(Discrepancy(field="co_date", actual_value="Trống", expected_value="Định dạng YYYY-MM-DD", reason="C/O Date không được để trống", severity="Error"))
        else:
            try:
                datetime.strptime(co.co_date.strip(), "%Y-%m-%d")
            except ValueError:
                discrepancies.append(Discrepancy(field="co_date", actual_value=co.co_date, expected_value="Định dạng YYYY-MM-DD", reason="C/O Date định dạng ngày không hợp lệ", severity="Error"))

        if not co.country_of_origin.strip():
            discrepancies.append(Discrepancy(field="co_origin", actual_value="Trống", expected_value="Phải có", reason="Quốc gia xuất xứ (Country of Origin) không được để trống", severity="Error"))

        if co.signature_present != "PRESENT":
            discrepancies.append(Discrepancy(field="co_signature", actual_value="Vắng mặt / Không rõ", expected_value="PRESENT", reason="Thiếu chữ ký / con dấu của tổ chức phát hành C/O", severity="Error"))

    # --- 1E. Certificate of Quality (C/Q) ---
    if cq:
        if not cq.cq_number.strip():
            discrepancies.append(Discrepancy(field="cq_number", actual_value="Trống", expected_value="Phải có", reason="C/Q Number không được để trống", severity="Error"))

        if not cq.cq_date.strip():
            discrepancies.append(Discrepancy(field="cq_date", actual_value="Trống", expected_value="Định dạng YYYY-MM-DD", reason="C/Q Date không được để trống", severity="Error"))
        else:
            try:
                datetime.strptime(cq.cq_date.strip(), "%Y-%m-%d")
            except ValueError:
                discrepancies.append(Discrepancy(field="cq_date", actual_value=cq.cq_date, expected_value="Định dạng YYYY-MM-DD", reason="C/Q Date định dạng ngày không hợp lệ", severity="Error"))

        if not cq.quality_statement.strip():
            discrepancies.append(Discrepancy(field="cq_statement", actual_value="Trống", expected_value="Phải có", reason="Cam kết/chứng nhận chất lượng không được để trống", severity="Error"))

        if cq.signature_present != "PRESENT":
            discrepancies.append(Discrepancy(field="cq_signature", actual_value="Vắng mặt / Không rõ", expected_value="PRESENT", reason="Thiếu chữ ký / con dấu của bên kiểm định C/Q", severity="Error"))

    # --- 1F. Insurance Certificate ---
    if insurance:
        if not insurance.insurance_number.strip():
            discrepancies.append(Discrepancy(field="insurance_number", actual_value="Trống", expected_value="Phải có", reason="Insurance Certificate Number không được để trống", severity="Error"))

        if not insurance.insurance_date.strip():
            discrepancies.append(Discrepancy(field="insurance_date", actual_value="Trống", expected_value="Định dạng YYYY-MM-DD", reason="Insurance Date không được để trống", severity="Error"))
        else:
            try:
                datetime.strptime(insurance.insurance_date.strip(), "%Y-%m-%d")
            except ValueError:
                discrepancies.append(Discrepancy(field="insurance_date", actual_value=insurance.insurance_date, expected_value="Định dạng YYYY-MM-DD", reason="Insurance Date định dạng ngày không hợp lệ", severity="Error"))

        if insurance.signature_present != "PRESENT":
            discrepancies.append(Discrepancy(field="insurance_signature", actual_value="Vắng mặt / Không rõ", expected_value="PRESENT", reason="Thiếu chữ ký / con dấu của tổ chức phát hành Chứng thư bảo hiểm", severity="Error"))

    return discrepancies

def cross_check_documents(
    invoice: ExtractedDocument,
    bl: Optional[BLExtracted],
    pl: Optional[PLExtracted],
    co: Optional[COExtracted] = None,
    cq: Optional[CQExtracted] = None,
    insurance: Optional[InsuranceExtracted] = None
) -> list[Discrepancy]:
    """
    Layer 2: Cross-check documents consistency (Invoice vs B/L vs Packing List)
    """
    discrepancies = []
    
    if bl:
        # 1. Beneficiary (Invoice) vs Shipper (B/L)
        if invoice.beneficiary_name and bl.shipper_name:
            inv_ben = invoice.beneficiary_name.strip().lower()
            bl_ship = bl.shipper_name.strip().lower()
            if inv_ben != bl_ship:
                if inv_ben not in bl_ship and bl_ship not in inv_ben:
                    discrepancies.append(Discrepancy(
                        field="cross_beneficiary_shipper",
                        actual_value=bl.shipper_name,
                        expected_value=invoice.beneficiary_name,
                        reason="Tên Shipper trên B/L không khớp với bên thụ hưởng (Beneficiary) trên Hóa đơn",
                        severity="Error"
                    ))
                    
        # 2. Goods Description (Invoice) vs B/L
        if invoice.goods_description and bl.goods_description:
            inv_goods = invoice.goods_description.strip().lower()
            bl_goods = bl.goods_description.strip().lower()
            inv_words = set(w for w in inv_goods.split() if len(w) > 3)
            bl_words = set(w for w in bl_goods.split() if len(w) > 3)
            if not inv_words.intersection(bl_words) and inv_goods not in bl_goods and bl_goods not in inv_goods:
                discrepancies.append(Discrepancy(
                    field="cross_goods_invoice_bl",
                    actual_value=bl.goods_description,
                    expected_value=invoice.goods_description,
                    reason="Mô tả hàng hóa trên B/L không tương đồng với trên Hóa đơn thương mại",
                    severity="Error"
                ))
                
        # 3. Port of Loading (Invoice) vs B/L
        if invoice.port_of_loading and bl.port_of_loading:
            if invoice.port_of_loading.strip().lower() != bl.port_of_loading.strip().lower():
                discrepancies.append(Discrepancy(
                    field="cross_loading_port",
                    actual_value=bl.port_of_loading,
                    expected_value=invoice.port_of_loading,
                    reason="Cảng bốc hàng trên B/L không khớp với Hóa đơn",
                    severity="Error"
                ))

        # 4. Port of Discharge (Invoice) vs B/L
        if invoice.port_of_discharge and bl.port_of_discharge:
            if invoice.port_of_discharge.strip().lower() != bl.port_of_discharge.strip().lower():
                discrepancies.append(Discrepancy(
                    field="cross_discharge_port",
                    actual_value=bl.port_of_discharge,
                    expected_value=invoice.port_of_discharge,
                    reason="Cảng dỡ hàng trên B/L không khớp với Hóa đơn",
                    severity="Error"
                ))

        # 5. Chronological Order: On Board Date (B/L) <= Invoice Date (Soft)
        if invoice.invoice_date and bl.on_board_date:
            try:
                inv_dt = datetime.strptime(invoice.invoice_date.strip(), "%Y-%m-%d")
                bl_dt = datetime.strptime(bl.on_board_date.strip(), "%Y-%m-%d")
                if bl_dt > inv_dt:
                    discrepancies.append(Discrepancy(
                        field="cross_date_chronology",
                        actual_value=f"Ngày xếp hàng B/L ({bl.on_board_date}) muộn hơn Ngày Hóa đơn ({invoice.invoice_date})",
                        expected_value="Ngày xếp hàng phải trước hoặc bằng Ngày Hóa đơn",
                        reason="Ngày xếp hàng lên tàu (B/L) muộn hơn ngày phát hành Hóa đơn",
                        severity="Warning"
                    ))
            except ValueError:
                pass
        
    if pl:
        # 1. Invoice vs Packing List Goods Description
        if invoice.goods_description and pl.goods_name:
            inv_goods = invoice.goods_description.strip().lower()
            pl_goods = pl.goods_name.strip().lower()
            inv_words = set(w for w in inv_goods.split() if len(w) > 3)
            pl_words = set(w for w in pl_goods.split() if len(w) > 3)
            if not inv_words.intersection(pl_words) and inv_goods not in pl_goods and pl_goods not in inv_goods:
                discrepancies.append(Discrepancy(
                    field="cross_goods_invoice_pl",
                    actual_value=pl.goods_name,
                    expected_value=invoice.goods_description,
                    reason="Mô tả hàng hóa trên Packing List không tương đồng với trên Hóa đơn",
                    severity="Error"
                ))
                
        # 2. Invoice vs Packing List Quantity
        if invoice.quantity > 0 and pl.quantity > 0:
            if abs(invoice.quantity - pl.quantity) > 0.01:
                discrepancies.append(Discrepancy(
                    field="cross_quantity_invoice_pl",
                    actual_value=str(pl.quantity),
                    expected_value=str(invoice.quantity),
                    reason="Số lượng hàng hóa trên Packing List không khớp với trên Hóa đơn thương mại",
                    severity="Error"
                ))

    # 3. B/L vs Packing List checks
    if bl and pl:
        # 3A. Gross Weight (B/L vs PL)
        if bl.quantity and pl.gross_weight:
            import re
            bl_nums = re.findall(r"[-+]?\d*\.\d+|\d+", bl.quantity.replace(",", ""))
            pl_nums = re.findall(r"[-+]?\d*\.\d+|\d+", pl.gross_weight.replace(",", ""))
            if bl_nums and pl_nums:
                try:
                    bl_weight = float(bl_nums[0])
                    pl_weight = float(pl_nums[0])
                    if abs(bl_weight - pl_weight) / max(1.0, pl_weight) > 0.02:
                        discrepancies.append(Discrepancy(
                            field="cross_gross_weight_bl_pl",
                            actual_value=bl.quantity,
                            expected_value=pl.gross_weight,
                            reason="Tổng trọng lượng hàng hóa trên B/L không khớp với trên Packing List",
                            severity="Error"
                        ))
                except (ValueError, ZeroDivisionError):
                    pass

        # 3B. Packages Count (B/L vs PL)
        if bl.quantity and pl.packages_count > 0:
            import re
            pkg_str = str(int(pl.packages_count))
            if pkg_str not in bl.quantity:
                bl_nums = re.findall(r"\d+", bl.quantity.replace(",", ""))
                if bl_nums:
                    try:
                        bl_pkg = int(bl_nums[0])
                        if bl_pkg != int(pl.packages_count):
                            discrepancies.append(Discrepancy(
                                field="cross_packages_count_bl_pl",
                                actual_value=bl.quantity,
                                expected_value=f"{pl.packages_count} kiện",
                                reason="Số kiện/thùng trên B/L không khớp với Packing List",
                                severity="Error"
                            ))
                    except ValueError:
                        pass

    # 4. Certificate of Origin (C/O) Cross-checks
    if co:
        # 4A. Invoice Number Match
        if invoice.invoice_number and co.invoice_number:
            if invoice.invoice_number.strip().lower() != co.invoice_number.strip().lower():
                discrepancies.append(Discrepancy(
                    field="cross_co_invoice_number",
                    actual_value=co.invoice_number,
                    expected_value=invoice.invoice_number,
                    reason="Số hóa đơn tham chiếu trên C/O không khớp với Hóa đơn thương mại",
                    severity="Error"
                ))

        # 4B. Shipper vs Beneficiary Match
        if invoice.beneficiary_name and co.shipper_name:
            inv_ben = invoice.beneficiary_name.strip().lower()
            co_ship = co.shipper_name.strip().lower()
            if inv_ben != co_ship and inv_ben not in co_ship and co_ship not in inv_ben:
                discrepancies.append(Discrepancy(
                    field="cross_co_shipper_beneficiary",
                    actual_value=co.shipper_name,
                    expected_value=invoice.beneficiary_name,
                    reason="Tên Shipper trên C/O không tương đồng với tên Beneficiary trên Hóa đơn",
                    severity="Error"
                ))

        # 4C. Shipper vs B/L Shipper Match
        if bl and bl.shipper_name and co.shipper_name:
            bl_ship = bl.shipper_name.strip().lower()
            co_ship = co.shipper_name.strip().lower()
            if bl_ship != co_ship and bl_ship not in co_ship and co_ship not in bl_ship:
                discrepancies.append(Discrepancy(
                    field="cross_co_shipper_bl_shipper",
                    actual_value=co.shipper_name,
                    expected_value=bl.shipper_name,
                    reason="Tên Shipper trên C/O không khớp với trên Vận đơn B/L",
                    severity="Error"
                ))

        # 4D. Consignee vs Invoice Applicant Match
        if invoice.applicant_name and co.consignee_name:
            inv_app = invoice.applicant_name.strip().lower()
            co_con = co.consignee_name.strip().lower()
            if inv_app != co_con and inv_app not in co_con and co_con not in inv_app:
                discrepancies.append(Discrepancy(
                    field="cross_co_consignee_applicant",
                    actual_value=co.consignee_name,
                    expected_value=invoice.applicant_name,
                    reason="Tên Consignee trên C/O không khớp với tên Applicant trên Hóa đơn",
                    severity="Error"
                ))

        # 4E. Goods Description Match
        if invoice.goods_description and co.goods_description:
            inv_goods = invoice.goods_description.strip().lower()
            co_goods = co.goods_description.strip().lower()
            inv_words = set(w for w in inv_goods.split() if len(w) > 3)
            co_words = set(w for w in co_goods.split() if len(w) > 3)
            if not inv_words.intersection(co_words) and inv_goods not in co_goods and co_goods not in inv_goods:
                discrepancies.append(Discrepancy(
                    field="cross_co_goods_invoice",
                    actual_value=co.goods_description,
                    expected_value=invoice.goods_description,
                    reason="Mô tả hàng hóa trên C/O không tương đồng với trên Hóa đơn",
                    severity="Error"
                ))

    # 5. Certificate of Quality (C/Q) Cross-checks
    if cq:
        # 5A. Invoice Number Match
        if invoice.invoice_number and cq.invoice_number:
            if invoice.invoice_number.strip().lower() != cq.invoice_number.strip().lower():
                discrepancies.append(Discrepancy(
                    field="cross_cq_invoice_number",
                    actual_value=cq.invoice_number,
                    expected_value=invoice.invoice_number,
                    reason="Số hóa đơn tham chiếu trên C/Q không khớp với Hóa đơn thương mại",
                    severity="Error"
                ))

        # 5B. Goods Description Match
        if invoice.goods_description and cq.goods_description:
            inv_goods = invoice.goods_description.strip().lower()
            cq_goods = cq.goods_description.strip().lower()
            inv_words = set(w for w in inv_goods.split() if len(w) > 3)
            cq_words = set(w for w in cq_goods.split() if len(w) > 3)
            if not inv_words.intersection(cq_words) and inv_goods not in cq_goods and cq_goods not in inv_goods:
                discrepancies.append(Discrepancy(
                    field="cross_cq_goods_invoice",
                    actual_value=cq.goods_description,
                    expected_value=invoice.goods_description,
                    reason="Mô tả hàng hóa trên C/Q không tương đồng với trên Hóa đơn",
                    severity="Error"
                ))

    # 6. Insurance Certificate Cross-checks
    if insurance:
        if invoice.invoice_number and insurance.invoice_number:
            if invoice.invoice_number.strip().lower() != insurance.invoice_number.strip().lower():
                discrepancies.append(Discrepancy(
                    field="cross_insurance_invoice_number",
                    actual_value=insurance.invoice_number,
                    expected_value=invoice.invoice_number,
                    reason="Số hóa đơn tham chiếu trên Chứng thư bảo hiểm không khớp với Hóa đơn thương mại",
                    severity="Error"
                ))

        if invoice.beneficiary_name and insurance.insured_name:
            inv_ben = invoice.beneficiary_name.strip().lower()
            ins_name = insurance.insured_name.strip().lower()
            if inv_ben != ins_name and inv_ben not in ins_name and ins_name not in inv_ben:
                discrepancies.append(Discrepancy(
                    field="cross_insurance_insured_beneficiary",
                    actual_value=insurance.insured_name,
                    expected_value=invoice.beneficiary_name,
                    reason="Tên bên được bảo hiểm không tương đồng với tên Beneficiary trên Hóa đơn",
                    severity="Error"
                ))

    return discrepancies

def compare_lc(
    lc_terms: dict,
    extracted: ExtractedDocument,
    bl: Optional[BLExtracted] = None,
    co: Optional[COExtracted] = None,
    cq: Optional[CQExtracted] = None,
    insurance: Optional[InsuranceExtracted] = None
) -> list[Discrepancy]:
    """
    Compares the audited extracted values from the invoice (and B/L) against L/C terms and returns a list of discrepancies.
    """
    discrepancies = []

    # 1. Total Amount Comparison with Tolerance
    lc_max_amount = lc_terms.get("max_amount")
    if lc_max_amount is not None:
        try:
            lc_max_amount = float(lc_max_amount)
            
            # Parse tolerance percentage (default: ±5% if not specified, 0% if 'exactly' or '0', else parse value)
            amount_tol_str = str(lc_terms.get("amount_tolerance", "")).strip().lower()
            positive_tol = 5.0
            negative_tol = 5.0
            
            if "exactly" in amount_tol_str or amount_tol_str == "0":
                positive_tol = 0.0
                negative_tol = 0.0
            elif "/" in amount_tol_str:
                parts = amount_tol_str.split("/")
                try:
                    positive_tol = float(parts[0].replace("%", "").strip())
                    negative_tol = float(parts[1].replace("%", "").strip())
                except:
                    pass
            elif amount_tol_str:
                try:
                    val = float(amount_tol_str.replace("%", "").strip())
                    positive_tol = val
                    negative_tol = val
                except:
                    pass
            
            max_allowed = lc_max_amount * (1 + positive_tol / 100.0)
            
            if extracted.total_amount > max_allowed:
                discrepancies.append(
                    Discrepancy(
                        field="total_amount",
                        actual_value=f"{extracted.total_amount:,.2f}",
                        expected_value=f"<= {max_allowed:,.2f} (Hạn mức {lc_max_amount:,.2f} + {positive_tol}% dung sai)",
                        reason=f"Tổng số tiền vượt hạn mức L/C cho phép sau khi tính dung sai (Lệch {extracted.total_amount - max_allowed:,.2f})",
                        severity="Error"
                    )
                )
        except (ValueError, TypeError):
            pass

    # 2. Currency Comparison
    lc_currency = lc_terms.get("currency")
    if lc_currency and extracted.currency:
        if lc_currency.strip().upper() != extracted.currency.strip().upper():
            discrepancies.append(
                Discrepancy(
                    field="currency",
                    actual_value=extracted.currency,
                    expected_value=lc_currency,
                    reason="Loại tiền tệ thanh toán không trùng khớp với điều khoản L/C",
                    severity="Error"
                )
            )

    # 3. Shipment Date Comparison
    lc_latest_shipment = lc_terms.get("latest_shipment")
    if lc_latest_shipment and extracted.shipment_date:
        try:
            ext_date = datetime.strptime(extracted.shipment_date.strip(), "%Y-%m-%d")
            lc_date = datetime.strptime(lc_latest_shipment.strip(), "%Y-%m-%d")
            if ext_date > lc_date:
                discrepancies.append(
                    Discrepancy(
                        field="shipment_date",
                        actual_value=extracted.shipment_date,
                        expected_value=f"Trước hoặc bằng {lc_latest_shipment}",
                        reason=f"Ngày giao hàng thực tế ({extracted.shipment_date}) muộn hơn thời hạn giao hàng của L/C ({lc_latest_shipment})",
                        severity="Error"
                    )
                )
        except ValueError:
            pass

    # 4. Expiry Date / Presentation Date Comparison (Absolute Refusal)
    lc_expiry = lc_terms.get("expiry_date")
    presentation_date_str = ""
    if bl and bl.bl_date:
        presentation_date_str = bl.bl_date.strip()
    elif extracted.invoice_date:
        presentation_date_str = extracted.invoice_date.strip()
    else:
        presentation_date_str = datetime.today().strftime("%Y-%m-%d")

    if lc_expiry and presentation_date_str:
        try:
            pres_dt = datetime.strptime(presentation_date_str, "%Y-%m-%d")
            exp_dt = datetime.strptime(lc_expiry.strip(), "%Y-%m-%d")
            if pres_dt > exp_dt:
                discrepancies.append(
                    Discrepancy(
                        field="expiry_date",
                        actual_value=presentation_date_str,
                        expected_value=f"Trước hoặc bằng Ngày hết hạn {lc_expiry}",
                        reason=f"Ngày xuất trình chứng từ ({presentation_date_str}) muộn hơn Ngày hết hạn của L/C ({lc_expiry}) — Từ chối tuyệt đối, không thể xin Waiver",
                        severity="Absolute"
                    )
                )
        except ValueError:
            pass

    # 5. Beneficiary Name Comparison
    lc_beneficiary = lc_terms.get("beneficiary_name")
    if lc_beneficiary and extracted.beneficiary_name:
        if lc_beneficiary.strip().lower() != extracted.beneficiary_name.strip().lower():
            discrepancies.append(
                Discrepancy(
                    field="beneficiary_name",
                    actual_value=extracted.beneficiary_name,
                    expected_value=lc_beneficiary,
                    reason="Tên bên thụ hưởng không khớp chuẩn với L/C (Strict Compliance)",
                    severity="Error"
                )
            )

    # 6. Applicant Name Comparison
    lc_applicant = lc_terms.get("applicant_name")
    if lc_applicant and extracted.applicant_name:
        if lc_applicant.strip().lower() != extracted.applicant_name.strip().lower():
            discrepancies.append(
                Discrepancy(
                    field="applicant_name",
                    actual_value=extracted.applicant_name,
                    expected_value=lc_applicant,
                    reason="Tên người mua (Applicant) không khớp chuẩn với L/C (UCP 600 Art.18)",
                    severity="Error"
                )
            )

    # 7. Port of Loading Comparison
    lc_port = lc_terms.get("port_of_loading")
    if lc_port and extracted.port_of_loading:
        if lc_port.strip().lower() != extracted.port_of_loading.strip().lower():
            discrepancies.append(
                Discrepancy(
                    field="port_of_loading",
                    actual_value=extracted.port_of_loading,
                    expected_value=lc_port,
                    reason="Cảng bốc hàng không trùng khớp với điều khoản L/C",
                    severity="Warning"
                )
            )

    # 8. Port of Discharge Comparison
    lc_discharge = lc_terms.get("port_of_discharge")
    if lc_discharge and extracted.port_of_discharge:
        if lc_discharge.strip().lower() != extracted.port_of_discharge.strip().lower():
            discrepancies.append(
                Discrepancy(
                    field="port_of_discharge",
                    actual_value=extracted.port_of_discharge,
                    expected_value=lc_discharge,
                    reason="Cảng dỡ hàng không trùng khớp với điều khoản L/C",
                    severity="Error"
                )
            )

    # 9. Incoterms Comparison
    lc_incoterms = lc_terms.get("incoterms")
    if lc_incoterms and extracted.incoterms:
        if lc_incoterms.strip().lower() not in extracted.incoterms.strip().lower():
            discrepancies.append(
                Discrepancy(
                    field="incoterms",
                    actual_value=extracted.incoterms,
                    expected_value=lc_incoterms,
                    reason="Điều kiện giao hàng (Incoterms) không trùng khớp với L/C",
                    severity="Error"
                )
            )

    # 10. Goods Description Comparison
    lc_goods = lc_terms.get("goods_description")
    if lc_goods and extracted.goods_description:
        lc_lower = lc_goods.strip().lower()
        ext_lower = extracted.goods_description.strip().lower()
        if lc_lower not in ext_lower:
            # Check for keyword overlap
            lc_words = set(w for w in lc_lower.split() if len(w) > 3)
            ext_words = set(w for w in ext_lower.split() if len(w) > 3)
            if not lc_words.intersection(ext_words):
                discrepancies.append(
                    Discrepancy(
                        field="goods_description",
                        actual_value=extracted.goods_description,
                        expected_value=lc_goods,
                        reason="Mô tả hàng hóa không trùng khớp hoặc không tương đương với L/C",
                        severity="Error"
                    )
                )

    # 11. Partial Shipment Comparison
    lc_partial = str(lc_terms.get("partial_shipment", "")).strip().upper()
    if lc_partial == "PROHIBITED" and bl:
        bl_text = f"{bl.goods_description} {bl.quantity} {bl.clean_on_board_clause}".lower()
        if "partial" in bl_text or "part shipment" in bl_text:
            discrepancies.append(
                Discrepancy(
                    field="partial_shipment",
                    actual_value="Có dấu hiệu giao hàng từng phần trên B/L",
                    expected_value="PROHIBITED (Không cho phép)",
                    reason="L/C cấm giao hàng từng phần nhưng chứng từ có dấu hiệu vi phạm",
                    severity="Error"
                )
            )

    # 12. Transhipment Comparison
    lc_tranship = str(lc_terms.get("transhipment", "")).strip().upper()
    if lc_tranship == "PROHIBITED" and bl:
        bl_text = f"{bl.goods_description} {bl.quantity} {bl.clean_on_board_clause}".lower()
        if "tranship" in bl_text or "transship" in bl_text:
            discrepancies.append(
                Discrepancy(
                    field="transhipment",
                    actual_value="Có dấu hiệu chuyển tải trên B/L",
                    expected_value="PROHIBITED (Không cho phép)",
                    reason="L/C cấm chuyển tải nhưng vận đơn thể hiện có chuyển tải",
                    severity="Error"
                )
            )

    # 13. Certificate of Origin (C/O) L/C Compliance
    if co:
        # Check if C/O Consignee matches L/C Applicant
        lc_applicant = lc_terms.get("applicant_name")
        if lc_applicant and co.consignee_name:
            if lc_applicant.strip().lower() != co.consignee_name.strip().lower():
                discrepancies.append(
                    Discrepancy(
                        field="co_consignee_compliance",
                        actual_value=co.consignee_name,
                        expected_value=lc_applicant,
                        reason="Tên Consignee trên C/O không khớp với Applicant trong L/C",
                        severity="Error"
                    )
                )

    # 14. Insurance Certificate L/C Compliance
    if insurance:
        lc_currency = lc_terms.get("currency")
        if lc_currency and insurance.currency:
            if lc_currency.strip().upper() != insurance.currency.strip().upper():
                discrepancies.append(
                    Discrepancy(
                        field="insurance_currency_compliance",
                        actual_value=insurance.currency,
                        expected_value=lc_currency,
                        reason="Đơn vị tiền tệ trên Chứng thư bảo hiểm không khớp với L/C",
                        severity="Error"
                    )
                )

        shipment_date_str = None
        if bl and bl.on_board_date:
            shipment_date_str = bl.on_board_date
        else:
            shipment_date_str = lc_terms.get("latest_shipment")

        if shipment_date_str and insurance.insurance_date:
            try:
                ins_dt = datetime.strptime(insurance.insurance_date.strip(), "%Y-%m-%d")
                ship_dt = datetime.strptime(shipment_date_str.strip(), "%Y-%m-%d")
                if ins_dt > ship_dt:
                    discrepancies.append(
                        Discrepancy(
                            field="insurance_date_compliance",
                            actual_value=f"Ngày bảo hiểm ({insurance.insurance_date}) muộn hơn Ngày giao hàng ({shipment_date_str})",
                            expected_value="Ngày bảo hiểm phải bằng hoặc trước Ngày giao hàng",
                            reason="Chứng thư bảo hiểm phát hành muộn hơn ngày bốc hàng lên tàu (vi phạm UCP 600)",
                            severity="Error"
                        )
                    )
            except ValueError:
                pass

    return discrepancies

async def generate_waiver_draft(discrepancies: list[Discrepancy], lc_terms: dict) -> str:
    """
    Calls OpenAI to draft a professional waiver request email/SWIFT MT799
    based on the discrepancy details.
    """
    if not discrepancies:
        return (
            "Kính gửi Quý khách hàng,\n\n"
            "Chúng tôi rất vui mừng thông báo rằng qua kiểm tra đối chiếu tự động, "
            "bộ chứng từ của Quý khách hoàn toàn tuân thủ các điều khoản của Thư tín dụng (L/C).\n"
            "Chúng tôi đang tiến hành các thủ tục thanh toán theo quy định.\n\n"
            "Trân trọng,\n"
            "Phòng Thanh toán Quốc tế"
        )

    discrepancy_details = "\n".join([
        f"- Trường dữ liệu: {d.field} | Thực tế: {d.actual_value} | Yêu cầu L/C: {d.expected_value} | Lý do: {d.reason}"
        for d in discrepancies
    ])

    system_prompt = (
        "Bạn là chuyên viên Thanh toán Quốc tế kỳ cựu của một ngân hàng thương mại lớn.\n"
        "Nhiệm vụ: Soạn thảo một bức thư (hoặc Email/Điện SWIFT MT799) chuyên nghiệp gửi cho người mở L/C (Applicant/Buyer)\n"
        "để thông báo về các điểm sai sót (Discrepancy) phát hiện trên chứng từ hóa đơn, và hỏi ý kiến của họ về việc\n"
        "đồng ý chấp nhận bỏ qua lỗi (Waiver) để tiến hành thanh toán cho người thụ hưởng.\n"
        "Hãy viết bằng 2 ngôn ngữ: Tiếng Việt và Tiếng Anh (song ngữ) một cách trang trọng, lịch sự.\n"
        "Mẫu thư cần chừa khoảng trống tên ngân hàng hoặc ký tên chuyên viên hợp lý."
    )

    user_content = (
        f"Thông tin các lỗi sai biệt phát hiện:\n{discrepancy_details}\n\n"
        f"Điều khoản L/C tham chiếu:\n{json.dumps(lc_terms, ensure_ascii=False, indent=2)}\n\n"
        "Vui lòng soạn thảo email đề xuất bỏ qua lỗi (Waiver Request)."
    )

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            temperature=0.7
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Lỗi khi tự động soạn thảo thư từ AI: {str(e)}"

async def analyze_lc_with_ai(image_base64: str) -> "LCTermsSchema":
    """
    Agent 1 (Extractor) for Letter of Credit.
    Extracts L/C terms from the L/C PDF image using LCTermsSchema.
    """
    from .swift_parser import LCTermsSchema
    system_prompt = (
        "Bạn là chuyên gia bóc tách thư tín dụng (Letter of Credit / L/C / MT700) (Agent 1).\n"
        "Nhiệm vụ: Phân tích hình ảnh tài liệu L/C, tự nhận diện chữ (OCR) và điền vào cấu trúc JSON LCTermsSchema.\n"
        "Bóc tách các trường và đánh giá độ tin cậy tương ứng:\n"
        "max_amount, currency, latest_shipment, beneficiary_name, port_of_loading, applicant_name, expiry_date, "
        "port_of_discharge, goods_description, incoterms, partial_shipment, transhipment, amount_tolerance.\n"
        "Hãy điền chính xác, các trường số tiền phải là float, nếu không tìm thấy hãy để mặc định."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Bóc tách dữ liệu từ Thư tín dụng L/C này:"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_base64}"
                        }
                    }
                ]
            }
        ],
        response_format=LCTermsSchema
    )
    return response.choices[0].message.parsed


def extract_doc_text(file_bytes: bytes) -> str:
    """
    Extracts text from legacy DOC file bytes using antiword command-line utility.
    """
    import subprocess
    import tempfile
    import os

    with tempfile.NamedTemporaryFile(delete=False, suffix=".doc") as temp_file:
        temp_file.write(file_bytes)
        temp_path = temp_file.name

    try:
        result = subprocess.run(["antiword", temp_path], capture_output=True, text=True, check=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Lỗi khi chạy antiword: {e.stderr or e.output}")
    except FileNotFoundError:
        raise RuntimeError("Tiện ích antiword chưa được cài đặt trên hệ thống.")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def extract_docx_text(file_bytes: bytes) -> str:
    """
    Extracts text and table content from DOCX file bytes, preserving the logical order.
    """
    import io
    try:
        from docx import Document
        from docx.oxml.table import CT_Tbl
        from docx.oxml.text.paragraph import CT_P
        from docx.table import Table
        from docx.text.paragraph import Paragraph
    except ImportError:
        raise ImportError("Thư viện python-docx chưa được cài đặt.")

    doc = Document(io.BytesIO(file_bytes))
    body = doc.element.body
    text_parts = []
    
    for child in body:
        if isinstance(child, CT_P):
            p = Paragraph(child, doc)
            if p.text.strip():
                text_parts.append(p.text)
        elif isinstance(child, CT_Tbl):
            t = Table(child, doc)
            for row in t.rows:
                row_text = [cell.text.strip().replace('\n', ' ') for cell in row.cells]
                # Filter out adjacent duplicates due to merged cells
                cleaned_row = []
                for cell in row_text:
                    if not cleaned_row or cleaned_row[-1] != cell:
                        cleaned_row.append(cell)
                if cleaned_row:
                    text_parts.append(" | ".join(cleaned_row))
                
    return "\n".join(text_parts)


async def classify_document_text(text: str) -> str:
    """
    Uses GPT-4o to classify the document text into:
    "INVOICE", "BILL_OF_LADING", "PACKING_LIST", "LETTER_OF_CREDIT", "CO", "CQ", or "UNKNOWN".
    """
    system_prompt = (
        "Bạn là trợ lý phân loại chứng từ thương mại quốc tế.\n"
        "Hãy phân tích nội dung văn bản được cung cấp và xác định loại chứng từ này thuộc loại nào:\n"
        "- 'INVOICE': Hóa đơn thương mại (Commercial Invoice).\n"
        "- 'BILL_OF_LADING': Vận đơn đường biển (Bill of Lading / B/L).\n"
        "- 'PACKING_LIST': Phiếu đóng gói hàng hóa (Packing List).\n"
        "- 'LETTER_OF_CREDIT': Thư tín dụng (Letter of Credit / L/C / MT700).\n"
        "- 'CO': Chứng nhận xuất xứ (Certificate of Origin / C/O).\n"
        "- 'CQ': Chứng nhận chất lượng (Certificate of Quality / C/Q).\n"
        "- 'UNKNOWN': Tài liệu khác.\n"
        "Chỉ trả ra đúng một trong các từ khóa trên ở định dạng chữ in hoa."
    )
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Phân loại chứng từ này từ nội dung văn bản sau:\n\n{text}"}
            ],
            temperature=0.0
        )
        val = response.choices[0].message.content.strip().upper()
        if val in ["INVOICE", "BILL_OF_LADING", "PACKING_LIST", "LETTER_OF_CREDIT", "CO", "CQ"]:
            return val
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


async def analyze_document_with_ai_text(text: str) -> ExtractedDocument:
    """
    Extracts Commercial Invoice data from DOCX extracted text.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu thanh toán quốc tế kiểm tra L/C từ văn bản (Agent 1).\n"
        "Nhiệm vụ: Hãy phân tích nội dung văn bản được cung cấp và điền vào cấu trúc JSON.\n"
        "Đối với mỗi trường dữ liệu (ví dụ: invoice_number, total_amount...), bạn phải cung cấp:\n"
        "1. Giá trị trích xuất thực tế (total_amount phải là số thực, shipment_date và invoice_date định dạng YYYY-MM-DD, quantity và unit_price là số thực).\n"
        "2. ĐOẠN TRÍCH DẪN GỐC (exact quote/snippet) chứa con số hoặc thông tin đó hiển thị trong văn bản để làm minh chứng.\n"
        "3. ĐIỂM TIN CẬY (confidence score) từ 0.0 đến 1.0. Vì đây là văn bản trích xuất trực tiếp nên thông thường điểm tin cậy rất cao (ví dụ: 0.95 đến 1.0) nếu thông tin xuất hiện rõ ràng.\n"
        "Các trường thông tin cần bóc tách bao gồm: invoice_number, total_amount, currency, shipment_date, port_of_loading, "
        "beneficiary_name, applicant_name, port_of_discharge, goods_description, incoterms, "
        "invoice_date, beneficiary_address, applicant_address, quantity, unit_price, signature_present ('PRESENT' hoặc 'MISSING').\n"
        "Tuyệt đối không bịa dữ liệu. Nếu không nhìn thấy, hãy để chuỗi rỗng cho quote và giá trị mặc định."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Bóc tách dữ liệu từ văn bản hóa đơn thương mại sau:\n\n{text}"}
        ],
        response_format=ExtractedDocument
    )
    return response.choices[0].message.parsed


async def analyze_bill_of_lading_with_ai_text(text: str) -> BLExtracted:
    """
    Extracts Bill of Lading data from DOCX extracted text.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu vận đơn đường biển (Bill of Lading - B/L) thanh toán quốc tế từ văn bản (Agent 1).\n"
        "Nhiệm vụ: Hãy phân tích nội dung văn bản vận đơn được cung cấp và điền vào cấu trúc JSON BLExtracted.\n"
        "Đối với mỗi trường dữ liệu (ví dụ: shipper_name, port_of_loading, on_board_date...), bạn phải cung cấp:\n"
        "1. Giá trị trích xuất thực tế (on_board_date và bl_date phải định dạng YYYY-MM-DD).\n"
        "2. ĐOẠN TRÍCH DẪN GỐC (exact quote/snippet) chứa con số hoặc thông tin đó hiển thị trong văn bản để làm minh chứng.\n"
        "3. ĐIỂM TIN CẬY (confidence score) từ 0.0 đến 1.0. Vì đây là văn bản trích xuất trực tiếp nên thông thường điểm tin cậy rất cao.\n"
        "Các trường cần bóc tách: shipper_name, port_of_loading, on_board_date, bl_number, consignee_name, port_of_discharge, "
        "goods_description, bl_date, carrier_name, gross_weight, measurement, signature_present ('PRESENT' hoặc 'MISSING').\n"
        "Tuyệt đối không bịa dữ liệu. Nếu không nhìn thấy, hãy để chuỗi rỗng cho quote và giá trị mặc định."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Bóc tách dữ liệu từ văn bản vận đơn đường biển sau:\n\n{text}"}
        ],
        response_format=BLExtracted
    )
    return response.choices[0].message.parsed


async def analyze_packing_list_with_ai_text(text: str) -> PLExtracted:
    """
    Extracts Packing List data from DOCX extracted text.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu phiếu đóng gói (Packing List) thanh toán quốc tế từ văn bản (Agent 1).\n"
        "Nhiệm vụ: Phân tích nội dung văn bản được cung cấp và điền vào cấu trúc JSON PLExtracted.\n"
        "Bóc tách các trường: pl_number, pl_date, invoice_number, total_packages, gross_weight, net_weight, goods_name, "
        "signature_present ('PRESENT' hoặc 'MISSING'), và kèm theo quote cùng confidence score cho từng trường.\n"
        "Hãy điền chính xác, không tự bịa dữ liệu."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Bóc tách dữ liệu từ văn bản phiếu đóng gói sau:\n\n{text}"}
        ],
        response_format=PLExtracted
    )
    return response.choices[0].message.parsed


async def analyze_co_with_ai_text(text: str) -> COExtracted:
    """
    Extracts Certificate of Origin data from DOCX extracted text.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu Chứng nhận xuất xứ (Certificate of Origin - C/O) thanh toán quốc tế từ văn bản (Agent 1).\n"
        "Nhiệm vụ: Phân tích nội dung văn bản C/O được cung cấp và điền vào cấu trúc JSON COExtracted.\n"
        "Bóc tách các trường: co_number, co_date, country_of_origin, exporter_name, importer_name, goods_description, invoice_number, "
        "signature_present ('PRESENT' hoặc 'MISSING'), và kèm theo quote cùng confidence score cho từng trường.\n"
        "Hãy điền chính xác, không tự bịa dữ liệu."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Bóc tách dữ liệu từ văn bản chứng nhận xuất xứ sau:\n\n{text}"}
        ],
        response_format=COExtracted
    )
    return response.choices[0].message.parsed


async def analyze_cq_with_ai_text(text: str) -> CQExtracted:
    """
    Extracts Certificate of Quality data from DOCX extracted text.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu Chứng nhận chất lượng (Certificate of Quality - C/Q) thanh toán quốc tế từ văn bản (Agent 1).\n"
        "Nhiệm vụ: Phân tích nội dung văn bản C/Q được cung cấp và điền vào cấu trúc JSON CQExtracted.\n"
        "Bóc tách các trường: cq_number, cq_date, quality_statement, issuer_name, goods_description, "
        "signature_present ('PRESENT' hoặc 'MISSING'), và kèm theo quote cùng confidence score cho từng trường.\n"
        "Hãy điền chính xác, không tự bịa dữ liệu."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Bóc tách dữ liệu từ văn bản chứng nhận chất lượng sau:\n\n{text}"}
        ],
        response_format=CQExtracted
    )
    return response.choices[0].message.parsed


async def analyze_insurance_with_ai_text(text: str) -> InsuranceExtracted:
    """
    Extracts Insurance Certificate data from text.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu Chứng thư bảo hiểm (Insurance Certificate) thanh toán quốc tế từ văn bản (Agent 1).\n"
        "Nhiệm vụ: Phân tích nội dung văn bản chứng thư bảo hiểm được cung cấp và điền vào cấu trúc JSON InsuranceExtracted.\n"
        "Bóc tách các trường: insurance_number, insurance_date, insured_amount, currency, insured_name, invoice_number, "
        "signature_present ('PRESENT' hoặc 'MISSING'), và kèm theo quote cùng confidence score cho từng trường.\n"
        "Hãy điền chính xác, không tự bịa dữ liệu."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Bóc tách dữ liệu từ văn bản chứng thư bảo hiểm sau:\n\n{text}"}
        ],
        response_format=InsuranceExtracted
    )
    return response.choices[0].message.parsed


async def analyze_lc_with_ai_text(text: str) -> "LCTermsSchema":
    """
    Extracts L/C terms from the L/C DOCX text.
    """
    from .swift_parser import LCTermsSchema
    system_prompt = (
        "Bạn là chuyên gia bóc tách thư tín dụng (Letter of Credit / L/C / MT700) từ văn bản (Agent 1).\n"
        "Nhiệm vụ: Phân tích nội dung văn bản tài liệu L/C và điền vào cấu trúc JSON LCTermsSchema.\n"
        "Bóc tách các trường và đánh giá độ tin cậy tương ứng:\n"
        "max_amount, currency, latest_shipment, beneficiary_name, port_of_loading, applicant_name, expiry_date, "
        "port_of_discharge, goods_description, incoterms, partial_shipment, transhipment, amount_tolerance.\n"
        "Hãy điền chính xác, các trường số tiền phải là float, nếu không tìm thấy hãy để mặc định."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Bóc tách dữ liệu từ văn bản thư tín dụng L/C sau:\n\n{text}"}
        ],
        response_format=LCTermsSchema
    )
    return response.choices[0].message.parsed
