import json
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .schemas import CheckLCResponse
from .services import pdf_to_base64_image, analyze_document_with_ai, audit_extracted_document, compare_lc, generate_waiver_draft

app = FastAPI(title="LC-Vision API", version="1.0.0")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to LC-Vision API"}

@app.post("/api/v1/check-lc", response_model=CheckLCResponse)
async def check_lc(
    pdf_file: UploadFile = File(...),
    lc_rules: str = Form(...)  # Expected JSON string containing L/C terms
):
    try:
        # 1. Parse L/C terms from string
        try:
            lc_terms = json.loads(lc_rules)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400,
                detail="lc_rules must be a valid JSON string"
            )

        # 2. Render PDF to base64 image
        file_bytes = await pdf_file.read()
        try:
            image_base64 = pdf_to_base64_image(file_bytes)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Không thể chuyển đổi file PDF thành hình ảnh: {str(e)}"
            )

        # 3. Analyze document image with OpenAI Vision (Agent 1 - Extraction)
        try:
            extracted_doc = await analyze_document_with_ai(image_base64)
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"OpenAI Vision extraction service error: {str(e)}"
            )

        # 3.1. Audit extracted document against image (Agent 2 - Independent Auditor)
        try:
            audited_doc = await audit_extracted_document(image_base64, extracted_doc)
        except Exception as e:
            # Fallback to Agent 1's results if Auditor agent encounters an error
            audited_doc = extracted_doc

        # 4. Compare audited data with L/C terms
        discrepancies = compare_lc(lc_terms, audited_doc)

        # 5. Draft automated waiver request email
        waiver_draft = await generate_waiver_draft(discrepancies, lc_terms)

        return CheckLCResponse(
            status="success",
            extracted=audited_doc,
            discrepancies=discrepancies,
            waiver_draft=waiver_draft
        )

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
