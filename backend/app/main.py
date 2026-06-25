import json
import asyncio
import logging
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from .schemas import CheckLCResponse, AuditLogSchema
from .services import (
    pdf_to_base64_image, analyze_document_with_ai, audit_extracted_document, compare_lc, generate_waiver_draft,
    classify_document, analyze_bill_of_lading_with_ai, audit_bill_of_lading, analyze_packing_list_with_ai, audit_packing_list, cross_check_documents,
    analyze_lc_with_ai, validate_layer1
)
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
    files: List[UploadFile] = File(...),
    lc_rules: str = Form(...)  # Expected JSON string containing L/C terms
):
    """
    Checks the uploaded PDF documents against L/C rules.
    Streams execution logs and progress status via StreamingResponse.
    """
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

            # Keep track of extracted documents
            invoice_doc = None
            bl_doc = None
            pl_doc = None

            # Render all files to base64 and classify them
            for idx, file in enumerate(files, 1):
                yield json.dumps({"type": "progress", "msg": f"2.{idx} Đang đọc và phân loại file: {file.filename}..."}) + "\n"
                file_bytes = await file.read()
                try:
                    image_base64, selected_page_idx, total_pages = await pdf_to_base64_image(file_bytes)
                except Exception as e:
                    yield json.dumps({"type": "error", "msg": f"Không thể render file {file.filename} thành ảnh: {str(e)}"}) + "\n"
                    return

                doc_type = await classify_document(image_base64)
                yield json.dumps({"type": "progress", "msg": f"  - Kết quả phân loại: {doc_type} (Trang {selected_page_idx + 1}/{total_pages})"}) + "\n"
                await asyncio.sleep(0.3)

                if doc_type == "INVOICE":
                    yield json.dumps({"type": "progress", "msg": "  - Agent 1: Bóc tách hóa đơn thương mại (GPT-4o Vision)..."}) + "\n"
                    extracted_doc = await analyze_document_with_ai(image_base64)
                    
                    # Audit invoice
                    confidence_fields = [
                        extracted_doc.invoice_number_confidence,
                        extracted_doc.total_amount_confidence,
                        extracted_doc.currency_confidence,
                        extracted_doc.shipment_date_confidence,
                        extracted_doc.port_of_loading_confidence,
                        extracted_doc.beneficiary_name_confidence
                    ]
                    if any(conf < 0.85 for conf in confidence_fields):
                        yield json.dumps({"type": "progress", "msg": "  - Agent 2: Kiểm toán độc lập hóa đơn (GPT-4o Vision)..."}) + "\n"
                        try:
                            invoice_doc = await audit_extracted_document(image_base64, extracted_doc)
                        except Exception as e:
                            logger.warning("Invoice audit failed: %s", str(e))
                            invoice_doc = extracted_doc
                    else:
                        invoice_doc = extracted_doc

                elif doc_type == "BILL_OF_LADING":
                    yield json.dumps({"type": "progress", "msg": "  - Agent 1: Bóc tách vận đơn đường biển (B/L) (GPT-4o Vision)..."}) + "\n"
                    extracted_bl = await analyze_bill_of_lading_with_ai(image_base64)
                    
                    # Audit BL
                    if extracted_bl.shipper_name_confidence < 0.85 or extracted_bl.on_board_date_confidence < 0.85:
                        yield json.dumps({"type": "progress", "msg": "  - Agent 2: Kiểm toán độc lập vận đơn (GPT-4o Vision)..."}) + "\n"
                        try:
                            bl_doc = await audit_bill_of_lading(image_base64, extracted_bl)
                        except Exception as e:
                            logger.warning("BL audit failed: %s", str(e))
                            bl_doc = extracted_bl
                    else:
                        bl_doc = extracted_bl

                elif doc_type == "PACKING_LIST":
                    yield json.dumps({"type": "progress", "msg": "  - Agent 1: Bóc tách phiếu đóng gói (Packing List) (GPT-4o Vision)..."}) + "\n"
                    extracted_pl = await analyze_packing_list_with_ai(image_base64)
                    
                    # Audit PL
                    if extracted_pl.goods_name_confidence < 0.85 or extracted_pl.gross_weight_confidence < 0.85:
                        yield json.dumps({"type": "progress", "msg": "  - Agent 2: Kiểm toán độc lập phiếu đóng gói (GPT-4o Vision)..."}) + "\n"
                        try:
                            pl_doc = await audit_packing_list(image_base64, extracted_pl)
                        except Exception as e:
                            logger.warning("PL audit failed: %s", str(e))
                            pl_doc = extracted_pl
                    else:
                        pl_doc = extracted_pl

            # Fallback if no invoice was uploaded
            if not invoice_doc:
                # If no invoice was identified, initialize a dummy invoice so compare_lc runs
                from .schemas import ExtractedDocument
                invoice_doc = ExtractedDocument()

            # 3. internal check (Layer 1)
            yield json.dumps({"type": "progress", "msg": "3. Đang chạy thuật toán kiểm tra nội bộ từng chứng từ (Layer 1)..."}) + "\n"
            await asyncio.sleep(0.4)
            layer1_discrepancies = validate_layer1(invoice_doc, bl_doc, pl_doc)

            # 4. Compare with L/C Rules (Layer 3)
            yield json.dumps({"type": "progress", "msg": "4. Đang chạy thuật toán đối chiếu L/C (Layer 3)..."}) + "\n"
            await asyncio.sleep(0.4)
            discrepancies = compare_lc(lc_terms, invoice_doc, bl_doc)

            # 5. Cross-check documents (Layer 2)
            yield json.dumps({"type": "progress", "msg": "5. Đang chạy thuật toán đối chiếu chéo chứng từ (Layer 2)..."}) + "\n"
            await asyncio.sleep(0.4)
            cross_discrepancies = cross_check_documents(invoice_doc, bl_doc, pl_doc)

            # Check if any discrepancies are absolute (e.g. late presentation date)
            cannot_waive = any(d.severity == "Absolute" for d in discrepancies)

            # 6. Draft automated waiver request email
            yield json.dumps({"type": "progress", "msg": "6. Agentic Flow: Soạn thảo thư từ Waiver tự động từ tất cả các lỗi..."}) + "\n"
            all_discrepancies = discrepancies + cross_discrepancies + layer1_discrepancies
            # Filter out Absolute discrepancies from waiver since they cannot be waived
            waiverable_discrepancies = [d for d in all_discrepancies if d.severity != "Absolute"]
            waiver_draft = await generate_waiver_draft(waiverable_discrepancies, lc_terms)

            # Final result package
            result_data = {
                "status": "success",
                "extracted": invoice_doc.model_dump(),
                "extracted_bl": bl_doc.model_dump() if bl_doc else None,
                "extracted_pl": pl_doc.model_dump() if pl_doc else None,
                "discrepancies": [d.model_dump() for d in discrepancies],
                "layer1_discrepancies": [d.model_dump() for d in layer1_discrepancies],
                "cross_discrepancies": [d.model_dump() for d in cross_discrepancies],
                "waiver_draft": waiver_draft,
                "cannot_waive": cannot_waive
            }
            yield json.dumps({"type": "result", "data": result_data}) + "\n"

        except Exception as e:
            yield json.dumps({"type": "error", "msg": f"Lỗi hệ thống trong generator: {str(e)}"}) + "\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/v1/extract-lc-file")
async def extract_lc_file(file: UploadFile = File(...)):
    """
    Extracts L/C terms from an uploaded PDF L/C file using AI vision.
    """
    try:
        file_bytes = await file.read()
        image_base64, selected_page_idx, total_pages = await pdf_to_base64_image(file_bytes)
        
        # Classify the uploaded document
        doc_type = await classify_document(image_base64)
        
        # Extract terms using L/C Extractor Agent
        lc_terms = await analyze_lc_with_ai(image_base64)
        
        return {
            "status": "success",
            "lc_terms": lc_terms.model_dump(),
            "doc_type": doc_type,
            "page_info": f"Trang {selected_page_idx + 1}/{total_pages}"
        }
    except Exception as e:
        logger.error(f"Error in extract-lc-file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
