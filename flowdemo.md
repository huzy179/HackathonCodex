# 🚀 HACKATHON 5-HOUR EXECUTION FLOW: LC-VISION (COMPLETED WITH VISION UPGRADE)

**Mục tiêu:** Build xong Frontend (Next.js) + Backend (FastAPI) + AI Engine (GPT-4o Vision) + Deploy (AWS) trong 5 tiếng.
**Quy tắc Vibe Code:** Tuyệt đối không tự gõ những hàm lặp lại. Quăng Prompt cho Codex -> Đọc hiểu -> Sửa lỗi -> Chạy thử -> Push GitLab.

---

## ⏱️ GIỜ 1: KHỞI TẠO & HẠ TẦNG (11:00 - 12:00)
*Mục tiêu: Server chạy, API nhận được file, Frontend gọi được Backend.*

- [x] **1. Setup Next.js (Frontend)**
  - Chạy: `npx create-next-app@latest frontend`
  - Dọn dẹp `page.tsx`, tạo UI upload cơ bản.
  - Cài thư viện: `npm i axios react-dropzone lucide-react`
- [x] **2. Setup FastAPI (Backend)**
  - Chạy: `mkdir backend && cd backend && python3 -m venv venv && source venv/bin/activate`
  - Cài thư viện: `pip install fastapi uvicorn python-multipart openai pydantic pymupdf`
- [x] **3. Viết API Upload (Prompt cho Codex)**
  - **Prompt:** *"Viết một route POST `/api/v1/check-lc` bằng FastAPI. API này nhận file PDF (chứng từ) thông qua `UploadFile` và file JSON L/C. Viết luôn cấu hình CORS middleware để cho phép localhost:3000 gọi qua. Trả về message 'Received' để test."*
- [x] **4. Nối mạch Frontend - Backend**
  - Frontend gọi API test thử. Upload file -> Backend print tên file ra console là Done.
- [x] **5. CI/CD First Commit**
  - Commit toàn bộ repo rỗng này đẩy lên nhánh `main` trên GitLab để luồng pipeline build Docker & AWS chạy ngầm từ sớm.

---

## ⏱️ GIỜ 2: DATA MODELING & PDF EXTRACTION (12:00 - 13:00)
*Mục tiêu: Bóc được text từ PDF và định hình Pydantic Schema.*

- [x] **1. Đọc file PDF chuyển sang Hình ảnh base64 (Prompt cho Codex)**
  - **Prompt:** *"Viết một service function trong Python tên là `pdf_to_base64_image(file: bytes)`. Sử dụng thư viện `PyMuPDF` (fitz) để render trang đầu tiên của file PDF thành hình ảnh JPG (pixmap), mã hóa base64 và trả về chuỗi base64."*
- [x] **2. Định nghĩa Pydantic Schema (Cốt lõi để nhốt AI)**
  - Tạo file `schemas.py`. Giao cho Codex:
  - **Prompt:** *"Tạo một Pydantic model tên là `ExtractedDocument` chứa các trường: `invoice_number` (str), `total_amount` (float), `currency` (str), `shipment_date` (str, format YYYY-MM-DD), `port_of_loading` (str) và các trường quote minh chứng tương ứng. Tạo thêm model `Discrepancy` chứa `field` (str), `actual_value` (str), `expected_value` (str), `reason` (str)."*

---

## ⏱️ GIỜ 3: TRÁI TIM AI - OPENAI STRUCTURED OUTPUTS & VISION (13:00 - 14:00)
*Mục tiêu: Đưa hình ảnh base64 cho GPT-4o Vision, lấy về cục JSON đã được format chuẩn.*

- [x] **1. Tích hợp OpenAI Vision (Prompt cho Codex)**
  - **Prompt:** *"Viết một hàm async `analyze_document_with_ai(image_base64: str)` sử dụng thư viện `openai` mới nhất. Truyền model 'gpt-4o' kèm payload hình ảnh (image_url) để phân tích trực tiếp. Sử dụng tính năng `response_format` của OpenAI SDK bằng cách truyền pydantic model `ExtractedDocument` vào `response_format`. Trả về object Pydantic đã parse."*
- [x] **2. System Prompt (Bạn tự gõ)**
  - Chèn đoạn prompt này vào hàm trên: 
    *"System: Bạn là chuyên gia thanh toán quốc tế kiểm tra L/C. Nhiệm vụ: Bóc tách thông tin từ hình ảnh chứng từ sau đây và điền chính xác vào cấu trúc JSON được yêu cầu kèm trích dẫn gốc. Tuyệt đối không bịa dữ liệu."*
- [x] **3. Test ngầm:** Bắn API từ Postman hoặc Swagger UI (`/docs`). Thấy AI nhả ra JSON chuẩn là thở phào.

---

## ⏱️ GIỜ 4: BUSINESS LOGIC - THUẬT TOÁN ĐỐI CHIẾU (14:00 - 15:00)
*Mục tiêu: Sinh ra mảng lỗi (Discrepancies).*

- [x] **1. Viết Logic So sánh (Prompt cho Codex)**
  - **Prompt:** *"Viết hàm `compare_lc(lc_terms: dict, extracted: ExtractedDocument) -> list[Discrepancy]`. Thực hiện các phép so sánh sau: 
    1. Nếu `extracted.total_amount > lc_terms['max_amount']`, add vào mảng lỗi. 
    2. Nếu `extracted.shipment_date` muộn hơn `lc_terms['latest_shipment']` (parse datetime để so sánh), add vào mảng. 
    Trả về mảng Discrepancy."*
- [x] **2. Ghép vào Router chính**
  - Trong `main.py`, gọi lần lượt: PDF to Image Base64 -> AI Parse -> Auditor Check -> Compare -> Return Result cho Frontend.

---

## ⏱️ GIỜ 5: UI DIFF-VIEW & ĐÒN KNOCK-OUT (15:00 - 16:00)
*Mục tiêu: Frontend hiển thị đẹp, deploy hoàn tất.*

- [x] **1. Render Bảng So sánh (Prompt cho Codex)**
  - **Prompt:** *"Viết một React Component nhận vào `lcData` và mảng `discrepancies`. Render một Table có 3 cột: Trường dữ liệu, Giá trị L/C yêu cầu, Giá trị Thực tế trên chứng từ có hỗ trợ sửa tay thủ công (HITL) và hiển thị trích dẫn (Explainable AI). Dùng Tailwind, nếu trường nào có trong mảng `discrepancies` thì tô nền background đỏ, còn lại tô xanh."*
- [x] **2. Tính năng Wow: Ký duyệt SmartCA giả lập & Nhật ký Audit Trail (Prompt cho Codex)**
  - **Prompt:** *"Thêm một nút 'Approve & Sign Report' ở cuối trang. Khi click vào, hiện ra một Dialog báo đang kết nối đến cổng VNPT SmartCA. Sau 2 giây chờ giả lập, hiển thị thông báo 'Đã ký số thành công' kèm theo TxHash. Cập nhật nhật ký Audit Trail timeline ghi nhận hoạt động."*
- [x] **3. Deploy & Testing cuối cùng**
  - Dọn console.log.
  - Push commit cuối cùng. Check lại pipeline GitLab xem bản build đã cập nhật lên AWS chưa.
  - Bật đường link thật lên, chuẩn bị file PDF chạy tay test lại luồng End-to-End.
- [x] **4. 16:00 - Bỏ tay khỏi bàn phím (Tools Down).**