import fitz  # PyMuPDF
import os
import json
import base64
from datetime import datetime
from openai import AsyncOpenAI
from .schemas import ExtractedDocument, Discrepancy

# Initialize Async OpenAI Client
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def pdf_to_base64_image(file_bytes: bytes) -> str:
    """
    Renders the first page of the PDF to a JPEG image, encodes it to base64, and returns the base64 string.
    """
    with fitz.open(stream=file_bytes, filetype="pdf") as doc:
        if len(doc) == 0:
            raise ValueError("File PDF không chứa trang nào.")
        # Render the first page
        page = doc[0]
        pix = page.get_pixmap(dpi=150)  # 150 DPI is balanced for quality and size
        image_bytes = pix.tobytes("jpg")
        base64_str = base64.b64encode(image_bytes).decode("utf-8")
        return base64_str

async def analyze_document_with_ai(image_base64: str) -> ExtractedDocument:
    """
    Agent 1 (Extractor): Uses GPT-4o Vision API to directly look at the document image,
    run OCR, and parse data with quotes and self-assessed confidence scores.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách dữ liệu thanh toán quốc tế kiểm tra L/C (Agent 1).\n"
        "Nhiệm vụ: Hãy phân tích hình ảnh chứng từ được cung cấp, tự nhận diện chữ (OCR) và điền vào cấu trúc JSON.\n"
        "Đối với mỗi trường dữ liệu (ví dụ: invoice_number, total_amount...), bạn phải cung cấp:\n"
        "1. Giá trị trích xuất thực tế (total_amount phải là số thực, shipment_date định dạng YYYY-MM-DD).\n"
        "2. ĐOẠN TRÍCH DẪN GỐC (exact quote/snippet) chứa con số hoặc thông tin đó hiển thị trên ảnh để làm minh chứng.\n"
        "3. ĐIỂM TIN CẬY (confidence score) từ 0.0 đến 1.0. Đánh giá thấp (dưới 0.8) nếu chữ bị mờ nhòe, bị dấu đóng đè lên, "
        "hoặc thông tin mang tính chất suy đoán/không rõ ràng trên ảnh.\n"
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

def compare_lc(lc_terms: dict, extracted: ExtractedDocument) -> list[Discrepancy]:
    """
    Compares the audited extracted values from the invoice against L/C terms and returns a list of discrepancies.
    """
    discrepancies = []

    # 1. Total Amount Comparison
    lc_max_amount = lc_terms.get("max_amount")
    if lc_max_amount is not None:
        try:
            lc_max_amount = float(lc_max_amount)
            if extracted.total_amount > lc_max_amount:
                discrepancies.append(
                    Discrepancy(
                        field="total_amount",
                        actual_value=f"{extracted.total_amount:,.2f}",
                        expected_value=f"<= {lc_max_amount:,.2f}",
                        reason=f"Tổng số tiền vượt hạn mức L/C cho phép (Lệch {extracted.total_amount - lc_max_amount:,.2f})",
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

    # 4. Beneficiary Name Comparison
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

    # 5. Port of Loading Comparison
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
