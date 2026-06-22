from pydantic import BaseModel
from .services import client  # Reuse the shared AsyncOpenAI client — no duplicate connections

class LCTermsSchema(BaseModel):
    max_amount: float
    currency: str
    latest_shipment: str  # Format: YYYY-MM-DD
    beneficiary_name: str
    port_of_loading: str

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
        "- :59: chứa tên người thụ hưởng (Beneficiary).\n"
        "- :44C: hoặc :44D: chứa ngày giao hàng muộn nhất (Latest Shipment Date). Vui lòng chuyển thành định dạng YYYY-MM-DD.\n"
        "- :44E: hoặc :44A: chứa cảng bốc hàng (Port of Loading).\n"
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
