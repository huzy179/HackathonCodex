# 🎬 KỊCH BẢN CHẠY THỬ VÀ DEMO SẢN PHẨM (LC-VISION v2.0 FLOW DEMO)

Tài liệu này hướng dẫn chi tiết kịch bản từng bước để trình diễn toàn bộ tính năng nghiệp vụ nâng cấp của dự án LC-Vision v2.0 trên giao diện Web.

---

## 🛠️ Chuẩn bị trước khi chạy Demo (Preparation)
1. Đảm bảo Backend và Frontend đang chạy ổn định.
2. Kiểm thử tự động đã chạy thành công qua lệnh:
   ```bash
   .\.venv\Scripts\python.exe auto_test.py
   ```

---

## 🚀 Kịch bản Demo từng bước (Step-by-Step Demo Flow)

### Bước 1: Đăng nhập & Bảng điều khiển (Dashboard)
1. Truy cập địa chỉ [http://localhost:3000](http://localhost:3000).
2. Đăng nhập bằng tài khoản: `admin` / mật khẩu: `admin`.
3. Giao diện chuyển hướng về **Dashboard** hiển thị danh sách các bộ chứng từ gần đây kèm trạng thái động (`Compliant`, `Discrepant`, `Closed Rejected`...) và Audit Trail đồng bộ từ SQLite database.
4. Nhấn nút **"+ Tạo kiểm tra mới"**.

### Bước 2: Tải lên tài liệu & AI tự động phân loại
1. Ở cột bên trái, bạn có thể dán điện SWIFT MT700 mẫu (hoặc upload file L/C dạng PDF).
2. Upload bộ chứng từ thương mại bằng cách kéo thả nhiều file PDF cùng lúc vào ô **Vùng kéo thả**.
   * Hệ thống sẽ tự động sử dụng AI để đọc nội dung và phân loại xem đâu là Hóa đơn (Invoice), Vận đơn (B/L) hay Phiếu đóng gói (Packing List).
3. Bấm nút **"Kiểm duyệt điều khoản L/C >>"** để qua bước tiếp theo.

### Bước 3: Vượt qua chốt chặn an toàn (Safety Gate - Bước 3B)
1. Giao diện hiển thị các điều khoản L/C mà AI đã bóc tách được (Ground Truth).
2. Chuyên viên rà soát các trường thông tin. Các trường có độ tin cậy thấp (< 80%) sẽ có nhãn cảnh báo **"⚠️ Cần kiểm tra kỹ"** nhấp nháy.
3. **Demo Case chặn Expiry L/C:** Nếu trường `Expiry Date` trong L/C đã qua so với thời gian hiện tại, hệ thống hiển thị cảnh báo màu đỏ chói cảnh báo L/C đã hết hạn hiệu lực và nút Xác nhận sẽ bị vô hiệu hóa (Block) hoàn toàn.
4. Bấm nút **"Xác nhận & Bắt đầu kiểm tra chéo"** để chạy kiểm tra 3 Layer.

### Bước 4: AI Processing & Kết quả kiểm tra chéo 3 Tab
1. Live Console hiển thị luồng xử lý NDJSON thời gian thực từ Backend.
2. Màn hình kết quả hiển thị chia làm **3 Tab rõ rệt**:
   * **Tab 1: Kiểm tra nội bộ (Layer 1)**: Hiển thị lỗi cấu trúc nội bộ của từng file (ví dụ: hóa đơn thiếu chữ ký, B/L thiếu điều khoản Clean on board, tổng tiền hóa đơn lệch so với Đơn giá x Số lượng).
   * **Tab 2: Kiểm tra chéo (Layer 2)**: Hiển thị lỗi lệch dữ liệu giữa Invoice ↔ B/L ↔ Packing List (như lệch Ngày, lệch Trọng lượng Gross weight hoặc Số kiện).
   * **Tab 3: Đối chiếu L/C (Layer 3)**: Hiển thị lỗi so khớp các chứng từ so với điều khoản L/C gốc.
3. Người dùng có thể sửa đổi dữ liệu sai lệch qua nút bút chì (HITL). Hệ thống lập tức tự động tính toán so khớp lại tại Client và đưa điểm tin cậy lên 100%.

### Bước 5: Chấp nhận / Từ chối Waiver (Waiver Decision Simulator)
* **Kịch bản L/C quá hạn xuất trình (Expiry Date exceeded)**:
  1. Nếu ngày B/L Date / ngày trình chứng từ muộn hơn Expiry Date, hệ thống hiển thị thông báo: `"🔴 L/C QUÁ HẠN XUẤT TRÌNH - TỪ CHỐI THANH TOÁN TUYỆT ĐỐI"`.
  2. Nút **"Gửi đề xuất Waiver" bị ẩn/khóa**. Banker chỉ có thể chọn **"Từ chối thanh toán"** và nhập lý do.
* **Kịch bản Lỗi mềm (Soft Discrepancies)**:
  1. Nếu các lỗi phát hiện đều có thể bảo lưu, Banker bấm **"Gửi Đề Xuất Waiver"**.
  2. AI tự động soạn thảo Waiver Request Letter song ngữ Anh-Việt.
  3. Sử dụng trình **Mô phỏng Khách hàng (Applicant)** ở góc bên phải để bấm **"Chấp nhận Waiver"** (trạng thái chuyển sang `Compliant with Waiver`) hoặc **"Từ chối Waiver"** (trạng thái chuyển sang `Closed Rejected`).