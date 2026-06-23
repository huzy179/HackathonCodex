# 📋 Chuỗi Prompt Vibe Coding xây dựng LC-Vision

Tài liệu này chứa bộ prompt tinh gọn theo phong cách **Vibe Coding** (dành cho Cursor / Codex / Claude). Các prompt tập trung vào việc mô tả tính năng cần phát triển và các lưu ý kỹ thuật cốt lõi, thay vì bắt AI sao chép các khối code cố định.

---

## 🏗️ Prompt 1 — Khởi tạo cấu trúc & Cấu hình dự án (Phase 1)
```text
Tạo cho tôi cấu trúc dự án fullstack tên "LC-Vision" gồm các thành phần:
1. Thư mục backend/ sử dụng FastAPI (Python 3.11-slim) chạy cổng 8000.
2. Thư mục frontend/ sử dụng Next.js 16 (React 19, TypeScript, Tailwind CSS) chạy cổng 3000.
3. Tệp docker-compose.yml phối hợp cả hai dịch vụ.

Lưu ý kỹ thuật:
- Backend: Cài đặt các thư viện fastapi, uvicorn, python-multipart, pydantic (v2), pymupdf (fitz), openai (>=1.40.0) và httpx (khóa phiên bản 0.27.2 để tránh xung đột 'proxies' của OpenAI SDK).
- Docker: Cấu hình Healthcheck cho Backend bằng lệnh Python native (nhập urllib.request để kiểm tra http://localhost:8000/) thay vì dùng lệnh curl (vì python-slim image không có sẵn curl). Cấu hình Frontend phụ thuộc vào Backend (depends_on: backend với condition: service_healthy).
- Tạo tệp .env và .env.example ở thư mục gốc chứa cấu hình OPENAI_API_KEY.
```

---

## 📐 Prompt 2 — Thiết lập Schema & Cơ sở dữ liệu SQLite (Phase 2)
```text
Xây dựng lớp dữ liệu cho Backend của dự án LC-Vision:

1. Định nghĩa schemas trong backend/app/schemas.py:
   - ExtractedDocument (Pydantic BaseModel): Trích xuất các trường thông tin hóa đơn (invoice_number, total_amount, currency, shipment_date, port_of_loading, beneficiary_name). Với mỗi trường, cần đi kèm trường trích dẫn gốc (_quote) và điểm tin cậy (_confidence). Tất cả confidence field phải được tự động clamp về khoảng [0.0, 1.0] dùng validator mode="before" để tránh giá trị AI lỗi. Các trường phải có giá trị mặc định tránh ValidationError.
   - Discrepancy (Pydantic BaseModel): Chứa thông tin lỗi gồm trường bị sai (field), giá trị thực tế (actual_value), giá trị L/C yêu cầu (expected_value), lý do (reason), mức độ (severity).
   - AuditLogSchema (Pydantic BaseModel): Chứa thông tin nhật ký gồm time, message, type.

2. Tạo tệp quản trị CSDL backend/app/database.py:
   - Sử dụng thư viện sqlite3 của Python để tạo tệp tin audit.db cục bộ.
   - Viết các hàm: init_db() (tạo bảng audit_logs nếu chưa có), add_audit_log(time, message, type), get_audit_logs() (lấy danh sách nhật ký giảm dần theo id), và clear_audit_logs() (xóa sạch nhật ký).
```

---

## 🤖 Prompt 3 — Xây dựng Backend Services & Các AI Agent (Phase 3)
```text
Hãy viết các hàm xử lý nghiệp vụ chính cho Backend trong tệp backend/app/services.py:

1. pdf_to_base64_image(file_bytes):
   - Đọc bytes tệp PDF. Quét tối đa 10 trang đầu tiên, đếm số lượng từ khóa hóa đơn xuất hiện (invoice, total amount, beneficiary, shipment date, hóa đơn, tổng tiền, người thụ hưởng, port of loading). Chọn trang có điểm cao nhất để kết xuất sang ảnh JPEG base64 (DPI=150).
   - Hàm render chính là sync (fitz CPU-bound), và gọi thông qua wrapper async bằng asyncio.to_thread để tránh block luồng FastAPI.

2. analyze_document_with_ai(image_base64) & audit_extracted_document(image_base64, extracted):
   - Thiết lập hai Agent AI độc lập: Agent 1 (Extractor) bóc tách thông tin thô từ ảnh kèm trích dẫn gốc; Agent 2 (Auditor) nhận ảnh và kết quả đề xuất của Agent 1 để rà soát chéo sửa lỗi.
   - Sử dụng client.beta.chat.completions.parse với định dạng schema ExtractedDocument để bảo đảm cấu trúc JSON chuẩn xác.

3. compare_lc(lc_terms, extracted) & generate_waiver_draft(discrepancies, lc_terms):
   - Viết logic rule-based so khớp điều khoản L/C theo UCP 600 (So sánh số tiền, loại tiền, ngày giao hàng, tên thụ hưởng, cảng bốc hàng).
   - Gọi GPT-4o viết email/thư đề xuất xin bỏ qua lỗi (Waiver Letter) dạng song ngữ Anh - Việt nếu phát hiện có điểm sai biệt.
```

---

## ⚡ Prompt 4 — Xây dựng Endpoint API & Tối ưu luồng Stream (Phase 4)
```text
Cập nhật tệp backend/app/main.py để cung cấp các API routes và tối ưu luồng gọi Agent:

1. API đối chiếu chính (POST /api/v1/check-lc):
   - Nhận file PDF và chuỗi L/C JSON qua FormData. Sử dụng StreamingResponse để truyền tiến trình thời gian thực dưới định dạng NDJSON (JSON string + "\n").
   - Các bước xử lý trong Generator:
     * Bước 1: Khởi động luồng bytes.
     * Bước 2: Gọi pdf_to_base64_image, ghi nhận và log trang PDF được chọn: "Đã tự động chọn trang X/Y...".
     * Bước 3: Gọi Agent 1 bóc tách thông tin.
     * Bước 3.1 (Tối ưu hóa): Kiểm tra độ tự tin của cả 6 trường. Nếu tồn tại bất kỳ trường nào có confidence < 85%, tiến hành gọi Agent 2 để kiểm toán đính chính. Ngược lại, tự động bỏ qua Agent 2 để tăng tốc độ phản hồi và tiết kiệm chi phí, gán trực tiếp audited_doc = extracted_doc và gửi log thông báo tối ưu.
     * Bước 4 & 5: So khớp nghiệp vụ UCP 600 và soạn thảo thư từ Waiver tự động. Trả về kết quả JSON cuối cùng.

2. API quản trị Audit Trail:
   - Khởi chạy init_db() khi khởi động ứng dụng (sử dụng sự kiện startup).
   - Thêm các route: GET /api/v1/audit-trail (gọi get_audit_logs), POST /api/v1/audit-trail (gọi add_audit_log), và DELETE /api/v1/audit-trail (gọi clear_audit_logs).
```

---

## 🏦 Prompt 5 — Thiết lập Giao diện Next.js & Đồng bộ CSDL (Phase 5)
```text
Cập nhật giao diện người dùng Next.js trong tệp frontend/src/app/page.tsx:

1. Giao diện người dùng:
   - Sử dụng layout 2 cột tông màu Xanh Navy Ngân hàng. Cột trái cấu hình L/C (Form hoặc SWIFT text) và vùng kéo thả file PDF. Cột phải hiển thị bảng so khớp (Xanh lá pastel: Pass, Đỏ pastel: Fail kèm nhãn cảnh báo nếu tin cậy < 80%), email Waiver tự động soạn thảo, và Nhật ký vận hành (Audit Trail) timeline.
   - Cho phép người dùng chỉnh sửa trực tiếp (HITL) giá trị trên bảng kết quả. Khi sửa đổi, tự động tính toán so khớp lại tại client-side và nâng điểm tin cậy của trường đó lên 100% (đã xác thực bởi con người).
   - Tích hợp nút giả lập chữ ký số VNPT SmartCA (hiển thị Dialog chờ 2.5 giây, trả về TxHash).

2. Đồng bộ hóa Audit Trail với Backend Database:
   - Sử dụng useEffect khi mount trang để gọi API GET /api/v1/audit-trail lấy lịch sử hoạt động bền vững hiển thị lên timeline.
   - Cập nhật hàm addAuditLog để POST bản ghi nhật ký mới lên Backend database.
   - Khi bấm nút hủy bỏ/chọn lại file để làm sạch phiên làm việc, gửi yêu cầu DELETE /api/v1/audit-trail để xóa dữ liệu trên database.
```

---

## 🧪 Prompt 6 — Tập lệnh Kiểm thử Tự động (Phase 6)
```text
Viết tệp kiểm thử tự động backend/auto_test.py chạy độc lập bằng asyncio:
1. Tạo hàm create_mock_pdf để sinh nhanh hai tệp PDF hóa đơn mẫu tại backend/test_samples/:
   - invoice_valid.pdf: Tổng số tiền USD 48,500.00, Ngày giao hàng 2026-06-25, Người thụ hưởng GLOBAL TRADING CORP, Cảng HAIPHONG PORT.
   - invoice_invalid.pdf: Tổng số tiền USD 73,000.00 (vượt hạn mức), Ngày giao hàng 2026-07-05 (muộn ngày), Người thụ hưởng GLOBAL TRADING CO LTD (sai tên), Cảng SHANGHAI PORT (sai cảng).
2. Chạy hàm run_test_case đối chiếu hai tệp PDF mẫu này với các điều khoản L/C yêu cầu (Hạn mức 50,000 USD, Ngày muộn nhất 2026-06-30, Người thụ hưởng GLOBAL TRADING CORP, Cảng HAIPHONG PORT).
3. Đọc dữ liệu từ pdf_to_base64_image dưới dạng tuple và gọi lần lượt các Agent AI để in kết quả đối chiếu cùng thư Waiver ra màn hình.
```
