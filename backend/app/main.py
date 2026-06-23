import json
import asyncio
import logging
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from .schemas import CheckLCResponse, AuditLogSchema
from .services import pdf_to_base64_image, analyze_document_with_ai, audit_extracted_document, compare_lc, generate_waiver_draft
from .swift_parser import parse_swift_mt700
from .database import init_db, add_audit_log, get_audit_logs, clear_audit_logs

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

@app.on_event("startup")
def startup_event():
    init_db()

class SWIFTInput(BaseModel):
    swift_text: str

@app.get("/")
def read_root():
    return {"message": "Welcome to LC-Vision API"}

@app.get("/api/v1/audit-trail", response_model=list[AuditLogSchema])
def get_audit_trail():
    try:
        return get_audit_logs()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/audit-trail")
def post_audit_trail(log: AuditLogSchema):
    try:
        add_audit_log(log.time, log.message, log.type)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/v1/audit-trail")
def delete_audit_trail():
    try:
        clear_audit_logs()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
            yield json.dumps({"type": "progress", "msg": "2. Đang tự động quét tìm trang tối ưu trong PDF..."}) + "\n"
            await asyncio.sleep(0.4)
            try:
                image_base64, selected_page_idx, total_pages = await pdf_to_base64_image(file_bytes)
                yield json.dumps({"type": "progress", "msg": f"2. Đã tự động chọn trang {selected_page_idx + 1}/{total_pages} (chứa nhiều thông tin hóa đơn nhất) để render ảnh JPEG base64 (PyMuPDF)..."}) + "\n"
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
            confidence_fields = [
                extracted_doc.invoice_number_confidence,
                extracted_doc.total_amount_confidence,
                extracted_doc.currency_confidence,
                extracted_doc.shipment_date_confidence,
                extracted_doc.port_of_loading_confidence,
                extracted_doc.beneficiary_name_confidence
            ]
            needs_audit = any(conf < 0.85 for conf in confidence_fields)

            if needs_audit:
                yield json.dumps({"type": "progress", "msg": "4. Phát hiện độ tự tin bóc tách thấp (<85%), Agent 2: Kiểm toán độc lập đang đối chiếu chéo đính chính OCR (GPT-4o Vision)..."}) + "\n"
                try:
                    audited_doc = await audit_extracted_document(image_base64, extracted_doc)
                except Exception as e:
                    # Log the audit failure server-side but gracefully fall back to Agent 1 result
                    logger.warning("Agent 2 audit failed, falling back to Agent 1 result: %s", str(e))
                    yield json.dumps({"type": "progress", "msg": f"  [Cảnh báo] Agent 2 gặp lỗi, sử dụng kết quả Agent 1 (fallback): {str(e)[:120]}"}) + "\n"
                    audited_doc = extracted_doc
            else:
                yield json.dumps({"type": "progress", "msg": "4. [Tối ưu hóa] Độ tự tin bóc tách của Agent 1 cao (>=85%), tự động bỏ qua Agent 2 để tăng tốc xử lý."}) + "\n"
                audited_doc = extracted_doc
                await asyncio.sleep(0.4)

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
