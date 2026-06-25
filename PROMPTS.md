# 📋 Chuỗi Prompt Vibe Coding xây dựng LC-Vision v2.0

Tài liệu này chứa bộ prompt tinh gọn theo phong cách **Vibe Coding** để định cấu hình, phát triển dự án LC-Vision v2.0 hỗ trợ thẩm định đa tài liệu (Invoice, B/L, Packing List) với 3 Layer Validation.

---

## 🏗️ Prompt 1 — Khởi tạo cấu trúc & Cấu hình dự án (Phase 1)
```text
Tạo cho tôi cấu trúc dự án fullstack tên "LC-Vision" gồm các thành phần:
1. Thư mục backend/ sử dụng FastAPI (Python 3.11-slim) chạy cổng 8000.
2. Thư mục frontend/ sử dụng Next.js 16 (React 19, TypeScript, Tailwind CSS) chạy cổng 3000.
3. Tệp docker-compose.yml phối hợp cả hai dịch vụ.

Lưu ý kỹ thuật:
- Backend: Cài đặt các thư viện fastapi, uvicorn, python-multipart, pydantic (v2), pymupdf (fitz), openai (>=1.40.0) và httpx.
- Cấu hình tệp .env và .env.example ở thư mục gốc chứa cấu hình OPENAI_API_KEY.
```

---

## 📐 Prompt 2 — Thiết lập các Schema Đa Chứng Từ (Phase 2)
```text
Xây dựng lớp dữ liệu (schemas.py) cho Backend của dự án LC-Vision v2.0:

1. Định nghĩa ExtractedDocument (Invoice): Trích xuất invoice_number, total_amount, currency, shipment_date, port_of_loading, beneficiary_name, applicant_name, port_of_discharge, goods_description, incoterms, và các trường mới: invoice_date, beneficiary_address, applicant_address, quantity, unit_price, signature_present. Đi kèm trường _quote và _confidence. Tự động clamp confidence về [0.0, 1.0].
2. Định nghĩa BLExtracted (Bill of Lading): shipper_name, consignee_name, notify_party, port_of_loading, port_of_discharge, on_board_date, goods_description, quantity, clean_on_board_clause, original_copies_count, bl_date, vessel_name_voyage, signature_present. Đi kèm các trường confidence score tương ứng.
3. Định nghĩa PLExtracted (Packing List): goods_name, quantity, net_weight, gross_weight, packages_count kèm confidence.
4. Định nghĩa CheckLCResponse chứa discrepancies, layer1_discrepancies, cross_discrepancies và cờ cannot_waive.
```

---

## 🤖 Prompt 3 — Hiện thực hóa 3 Layer Validation (Phase 3)
```text
Hãy viết các thuật toán rà soát đối chiếu trong backend/app/services.py:

1. validate_layer1(invoice, bl, pl):
   - Invoice: Kiểm tra bắt buộc hóa đơn, đơn giá x số lượng có khớp tổng tiền không, chữ ký/dấu.
   - B/L: Kiểm tra bắt buộc, B/L phải ghi chú Clean on Board và có chữ ký Carrier/Agent.
   - Packing List: Kiểm tra trọng lượng, số kiện, số lượng hàng.
2. cross_check_documents(invoice, bl, pl) (Layer 2):
   - So sánh chéo Ngày B/L On-Board <= Ngày Invoice.
   - So khớp Số lượng Invoice với Packing List.
   - So khớp Số kiện và Trọng lượng Gross Weight giữa B/L và Packing List.
3. compare_lc(lc_terms, invoice, bl) (Layer 3):
   - So khớp L/C: Tên người mua/bán, Hạn mức tiền kèm tolerance, Ngày giao hàng, Cảng xếp/dỡ, Incoterms, Goods Description.
   - Kiểm tra Partial Shipment, Transhipment (nếu L/C ghi PROHIBITED mà B/L thể hiện là vi phạm).
   - So khớp Ngày xuất trình (bl_date hoặc today) với Expiry Date. Nếu trễ hạn, ghi nhận sai biệt với severity="Absolute".
```

---

## ⚡ Prompt 4 — API Streaming & Luồng Quyết Định (Phase 4)
```text
Cập nhật tệp backend/app/main.py để cung cấp các REST API:
- POST /api/v1/check-lc: Nhận files chứng từ và quy tắc L/C. StreamNDJSON tiến trình xử lý. Thực hiện phân loại chứng từ tự động, bóc tách song song và chạy 3 Layer Validation. Kiểm tra nếu bất kỳ lỗi nào có mức độ nghiêm trọng "Absolute" thì gán cannot_waive = True. Sinh thư Waiver letter cho các lỗi còn lại và trả về kết quả JSON.
- POST /api/v1/extract-lc-file: Bóc tách file L/C PDF gửi về FE để banker rà soát trước.
```

---

## 🏦 Prompt 5 — Giao diện 3 Tab & Trình giả lập Khách hàng (Phase 5)
```text
Cập nhật giao diện Next.js trong tệp frontend/src/app/page.tsx:
1. Màn hình Safety Gate (Bước 3B): Cảnh báo nghiêm trọng nếu L/C hết hạn so với hôm nay và khóa nút Tiến hành.
2. Màn hình Kết quả chia làm 3 Tab:
   - Tab 1: Kiểm tra nội bộ (Layer 1)
   - Tab 2: Kiểm tra chéo (Layer 2)
   - Tab 3: Đối chiếu L/C (Layer 3)
3. Cảnh báo chặn Waiver: Nếu cannotWaive là true, hiển thị banner cảnh báo đỏ chói "L/C QUÁ HẠN XUẤT TRÌNH - TỪ CHỐI TUYỆT ĐỐI" và ẩn nút "Gửi Đề xuất Waiver", chỉ cho phép nút "Từ chối thanh toán".
4. Tích hợp Trình giả lập Khách hàng (Applicant) để Banker bấm thử nghiệm "Chấp nhận Waiver" hoặc "Từ chối Waiver" cập nhật trạng thái bộ hồ sơ.
```
