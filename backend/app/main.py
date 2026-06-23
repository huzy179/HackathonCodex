import json
import asyncio
import logging
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from .schemas import CheckLCResponse
from .services import pdf_to_base64_image, analyze_document_with_ai, audit_extracted_document, compare_lc, generate_waiver_draft
from .swift_parser import parse_swift_mt700

logger = logging.getLogger(__name__)

app = FastAPI(title="LC-Vision API", version="1.2.0")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SWIFTInput(BaseModel):
    swift_text: str

@app.get("/")
def read_root():
    return {"message": "Welcome to LC-Vision API"}

@app.post("/api/v1/parse-swift")
async def parse_swift(input_data: SWIFTInput):
    """
    Parses raw SWIFT MT700 L/C text and extracts structured terms.
    """
    try:
        lc_terms = await parse_swift_mt700(input_data.swift_text)
        return {"status": "success", "lc_terms": lc_terms}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/check-lc")
async def check_lc(
    pdf_file: UploadFile = File(...),
    lc_rules: str = Form(...)  # Expected JSON string containing L/C terms
):
    """
    Checks the uploaded PDF document against L/C rules.
    Streams execution logs and progress status via StreamingResponse.
    """
    # Read file bytes early to allow streaming generator access
    file_bytes = await pdf_file.read()

    async def event_generator():
        try:
            # 1. Parse L/C terms
            yield json.dumps({"type": "progress", "msg": "1. Đang khởi tạo luồng bytes PDF trong RAM..."}) + "\n"
            await asyncio.sleep(0.4)
            try:
                lc_terms = json.loads(lc_rules)
            except json.JSONDecodeError:
                yield json.dumps({"type": "error", "msg": "lc_rules không phải là định dạng JSON hợp lệ."}) + "\n"
                return

            # 2. Render PDF to base64 image
            yield json.dumps({"type": "progress", "msg": "2. Đang render PDF thành ảnh JPEG base64 (PyMuPDF)..."}) + "\n"
            await asyncio.sleep(0.4)
            try:
                image_base64 = await pdf_to_base64_image(file_bytes)  # MUST await — async since to_thread refactor
            except Exception as e:
                yield json.dumps({"type": "error", "msg": f"Không thể render PDF thành ảnh: {str(e)}"}) + "\n"
                return

            # 3. Analyze with OpenAI Vision (Agent 1 - Extraction)
            yield json.dumps({"type": "progress", "msg": "3. Agent 1: Đang bóc tách dữ liệu & trích nguồn minh chứng (GPT-4o Vision)..."}) + "\n"
            try:
                extracted_doc = await analyze_document_with_ai(image_base64)
            except Exception as e:
                yield json.dumps({"type": "error", "msg": f"OpenAI Vision bóc tách thất bại: {str(e)}"}) + "\n"
                return

            # 3.1. Audit extracted document (Agent 2 - Independent Auditor)
            yield json.dumps({"type": "progress", "msg": "4. Agent 2: Kiểm toán độc lập đang đối chiếu chéo đính chính OCR (GPT-4o Vision)..."}) + "\n"
            try:
                audited_doc = await audit_extracted_document(image_base64, extracted_doc)
            except Exception as e:
                # Log the audit failure server-side but gracefully fall back to Agent 1 result
                logger.warning("Agent 2 audit failed, falling back to Agent 1 result: %s", str(e))
                yield json.dumps({"type": "progress", "msg": f"  [Cảnh báo] Agent 2 gặp lỗi, sử dụng kết quả Agent 1 (fallback): {str(e)[:120]}"}) + "\n"
                audited_doc = extracted_doc

            # 4. Compare audited data with L/C terms
            yield json.dumps({"type": "progress", "msg": "5. Đang chạy thuật toán đối chiếu luật nghiệp vụ UCP 600..."}) + "\n"
            await asyncio.sleep(0.4)
            discrepancies = compare_lc(lc_terms, audited_doc)

            # 5. Draft automated waiver request email
            yield json.dumps({"type": "progress", "msg": "6. Agentic Flow: Soạn thảo thư từ Waiver tự động..."}) + "\n"
            waiver_draft = await generate_waiver_draft(discrepancies, lc_terms)

            # Final result package
            result_data = {
                "status": "success",
                "extracted": audited_doc.model_dump(),
                "discrepancies": [d.model_dump() for d in discrepancies],
                "waiver_draft": waiver_draft
            }
            yield json.dumps({"type": "result", "data": result_data}) + "\n"

        except Exception as e:
            yield json.dumps({"type": "error", "msg": f"Lỗi hệ thống trong generator: {str(e)}"}) + "\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
