# 🏦 LC-Vision v2.0: AI-Powered Multi-Document Letter of Credit Checker

**Dự án tham dự Codex Community Hackathon — Hanoi 2026**
- **Track mục tiêu:** Track 1 (Market Scale) & Track 2 (Engineering Depth)
- **Công nghệ cốt lõi:** Next.js 16 (React 19, Webpack, Tailwind CSS) & FastAPI (Python 3.11, PyMuPDF, OpenAI GPT-4o Vision).

---

## 🎯 Vấn đề thực tế (The Problem)
Trong thương mại quốc tế, Thanh toán bằng Thư tín dụng (L/C - Letter of Credit) yêu cầu tính chính xác tuyệt đối theo nguyên tắc **"Tuân thủ nghiêm ngặt" (Strict Compliance)**.
Hiện nay, kiểm soát viên thanh toán quốc tế phải đối chiếu thủ công từng trang chứng từ (Hóa đơn, vận đơn, phiếu đóng gói...) với L/C để phát hiện sai sót. Quá trình này tốn nhiều ngày làm việc, áp lực lớn và dễ xảy ra sai sót (Human Error).

---

## 💡 Giải pháp (The Solution)
**LC-Vision v2.0** là giải pháp nâng cấp toàn diện giúp tự động hóa việc đối chiếu đa chứng từ nhờ công nghệ **GPT-4o Vision** kết hợp luồng kiểm duyệt chéo **Multi-Agent Review** và cơ chế thẩm định **3 Layer Validation** thông minh. Hệ thống tự động bóc tách, rà soát và kết xuất **Báo cáo sai biệt (Compliance Report)** chỉ trong vài giây.

---

## ✨ Tính năng nổi bật của phiên bản v2.0

### 1. Thẩm định đa chứng từ tự động phân loại
Ngân hàng chỉ cần kéo thả toàn bộ tệp chứng từ thương mại lên hệ thống. AI tự động đọc nội dung để phân loại chứng từ thành:
- **Commercial Invoice (Hóa đơn thương mại)**
- **Bill of Lading - B/L (Vận đơn đường biển)**
- **Packing List (Phiếu đóng gói hàng hóa)**
Sau đó, hệ thống phân phối dữ liệu cho các AI Agent chuyên biệt tiến hành bóc tách song song.

### 2. Mô hình 3 Layer Validation nghiêm ngặt
Rà soát chứng từ qua 3 tầng nghiệp vụ tiêu chuẩn quốc tế:
- **Layer 1 (Internal Check):** Kiểm tra cấu trúc nội bộ của từng tài liệu (Logic số tiền = đơn giá x số lượng, chữ ký, đóng dấu, vận đơn sạch Clean on Board).
- **Layer 2 (Cross Check):** Đối chiếu chéo thông tin nhất quán giữa các tài liệu (Lệch ngày vận đơn/hóa đơn, lệch số lượng, lệch trọng lượng Gross weight hoặc số kiện).
- **Layer 3 (L/C Compliance):** Đối chiếu các chứng từ với điều khoản L/C tham chiếu (Hạn mức, ngày giao hàng, cảng xếp/dỡ, incoterms, cấm giao hàng từng phần/chuyển tải, quá hạn xuất trình).

### 3. Cơ chế chặn Waiver tuyệt đối (UCP 600 Compliance)
Nếu ngày xuất trình chứng từ (hoặc ngày B/L) vượt quá ngày hết hạn hiệu lực của L/C (`Expiry Date`), hệ thống lập tức gắn mức độ nghiêm trọng `Absolute`, hiển thị cảnh báo đỏ trên giao diện và khóa/ẩn tính năng "Gửi Đề Xuất Waiver". Chuyên viên chỉ có quyền nhấn "Từ chối thanh toán" để tuân thủ tuyệt đối UCP 600.

### 4. Trình giả lập Quyết định Khách hàng (Waiver Decision Simulator)
Chuyên viên có thể nhấn gửi Waiver Letter song ngữ Anh-Việt do AI tự động biên soạn sang cho Người mua (Applicant). Hệ thống tích hợp sẵn trình giả lập để mô phỏng quyết định phản hồi của Applicant:
- **Chấp nhận Waiver:** Hồ sơ tự động chuyển sang trạng thái hợp lệ và được phép giải ngân (`Compliant with Waiver`).
- **Từ chối Waiver:** Case tự động đóng và chuyển sang từ chối thanh toán (`Closed Rejected`).

### 5. Can thiệp thủ công thời gian thực (Human-in-the-Loop - HITL)
Chuyên viên ngân hàng có thể click trực tiếp vào nút chỉnh sửa kế bên ô dữ liệu thực tế để sửa đổi. Khi lưu lại, hệ thống lập tức tự động đối chiếu lại theo thời gian thực và cập nhật trạng thái dòng đó ngay tại Client.

### 6. Nhật ký vận hành persistent (Audit Trail)
Mọi hành động đều được hệ thống ghi nhận thời gian thực và lưu trữ lâu dài vào cơ sở dữ liệu SQLite ở Backend, đồng bộ tự động với Frontend (không bị mất dữ liệu khi tải lại hoặc F5 trang).

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy nhanh

### Khởi chạy bằng Docker Compose (Khuyến nghị)
1. Tạo file `.env` từ file `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. Cấu hình mã API Key của bạn trong `.env`:
   ```env
   OPENAI_API_KEY=sk-proj-xxxxxx...
   ```
3. Khởi chạy toàn bộ hệ thống bằng Docker Compose:
   ```bash
   docker compose up --build -d
   ```
4. Truy cập giao diện ứng dụng tại: `http://localhost:3000` (API Backend chạy tại `http://localhost:8000`).
   * Tài khoản đăng nhập mặc định: `admin` / `admin`.