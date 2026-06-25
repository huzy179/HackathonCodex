from pydantic import BaseModel
from .services import client  # Reuse the shared AsyncOpenAI client — no duplicate connections

class LCTermsSchema(BaseModel):
    max_amount: float
    max_amount_confidence: float = 1.0
    currency: str
    currency_confidence: float = 1.0
    latest_shipment: str  # Format: YYYY-MM-DD
    latest_shipment_confidence: float = 1.0
    beneficiary_name: str
    beneficiary_name_confidence: float = 1.0
    port_of_loading: str
    port_of_loading_confidence: float = 1.0
    applicant_name: str
    applicant_name_confidence: float = 1.0
    expiry_date: str  # Format: YYYY-MM-DD
    expiry_date_confidence: float = 1.0
    port_of_discharge: str
    port_of_discharge_confidence: float = 1.0
    goods_description: str
    goods_description_confidence: float = 1.0
    incoterms: str
    incoterms_confidence: float = 1.0
    partial_shipment: str  # Format: ALLOWED or PROHIBITED
    partial_shipment_confidence: float = 1.0
    transhipment: str  # Format: ALLOWED or PROHIBITED
    transhipment_confidence: float = 1.0
    amount_tolerance: str  # Format: e.g. "10/10" or "5/5" or empty
    amount_tolerance_confidence: float = 1.0

async def parse_swift_mt700(swift_text: str) -> LCTermsSchema:
    """
    Parses a raw SWIFT MT700 L/C message and extracts structured L/C terms using GPT-4o.
    """
    system_prompt = (
        "Bạn là chuyên gia bóc tách điện SWIFT MT700 của phòng tài trợ thương mại ngân hàng.\n"
        "Nhiệm vụ: Hãy phân tích văn bản điện SWIFT thô được cung cấp, tự tìm các mã trường chuẩn hóa UCP 600\n"
        "và điền vào cấu trúc JSON được yêu cầu.\n\n"
        "Gợi ý các mã trường SWIFT MT700 phổ biến:\n"
        "- :32B: hoặc :39A: chứa số tiền tối đa (ví dụ: 'Currency Code Amount' -> USD 50000).\n"
        "- :39A: chứa dung sai số tiền (ví dụ: '10/10' tức là ±10%).\n"
        "- :50: chứa tên người mua (Applicant).\n"
        "- :59: chứa tên người thụ hưởng (Beneficiary).\n"
        "- :31D: chứa ngày hết hạn L/C (Expiry Date). Vui lòng chuyển thành định dạng YYYY-MM-DD.\n"
        "- :44C: hoặc :44D: chứa ngày giao hàng muộn nhất (Latest Shipment Date). Vui lòng chuyển thành định dạng YYYY-MM-DD.\n"
        "- :44E: hoặc :44A: chứa cảng bốc hàng (Port of Loading).\n"
        "- :44F: hoặc :44B: chứa cảng dỡ hàng (Port of Discharge).\n"
        "- :45A: chứa mô tả hàng hóa (Goods Description).\n"
        "- :43P: cho biết có cho phép giao hàng từng phần hay không (Partial Shipment: ALLOWED hoặc PROHIBITED).\n"
        "- :43T: cho biết có cho phép chuyển tải hay không (Transhipment: ALLOWED hoặc PROHIBITED).\n"
        "- Tìm thông tin Incoterms (FOB, CIF, CFR...) trong mô tả hàng hóa hoặc điều khoản bổ sung.\n"
        "Hãy điền chính xác, các trường số tiền phải là float, nếu không tìm thấy hãy để giá trị mặc định (0.0 hoặc chuỗi rỗng)."
    )

    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Văn bản điện SWIFT thô:\n\n{swift_text}"}
        ],
        response_format=LCTermsSchema
    )
    
    return response.choices[0].message.parsed
