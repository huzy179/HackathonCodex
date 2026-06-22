# 🏦 LC-Vision: AI-Powered Letter of Credit Document Checker

**Dự án tham dự Codex Community Hackathon — Hanoi 2026**
- **Track mục tiêu:** Track 1 (Market Scale) & Track 2 (Engineering Depth)
- **Công nghệ cốt lõi:** Next.js 16 (React 19, Webpack, Tailwind CSS) & FastAPI (Python 3.11, PyMuPDF, OpenAI GPT-4o Vision).

---

## 🎯 Vấn đề thực tế (The Problem)
Trong thương mại quốc tế, Thanh toán bằng Thư tín dụng (L/C - Letter of Credit) là phương thức thanh toán an toàn nhất nhưng cũng rườm rà nhất. Theo quy tắc UCP 600, các ngân hàng phải áp dụng nguyên tắc **"Tuân thủ nghiêm ngặt" (Strict Compliance)**. 
Hiện nay, kiểm soát viên thanh toán quốc tế phải đối chiếu bằng mắt hàng chục trang PDF chứng từ (Hóa đơn, vận đơn...) với L/C gốc để rà soát từng dấu chấm, dấu phẩy. Một lỗi nhỏ (typo) hoặc việc bóc tách sai số liệu do mộc đỏ đóng đè lên chữ (trên bản scan) có thể làm chậm trễ hoặc từ chối thanh toán lô hàng trị giá hàng triệu USD. Quá trình đối chiếu thủ công này thường:
- Tốn kém thời gian (mất từ 3 đến 5 ngày làm việc).
- Áp lực cao, dễ xảy ra sai sót do con người (Human Error).

---

## 💡 Giải pháp (The Solution)
**LC-Vision** là hệ thống tự động hóa việc đối chiếu chứng từ bằng Generative AI có khả năng xử lý các loại PDF (kể cả bản scan ảnh) nhờ công nghệ **GPT-4o Vision** kết hợp luồng kiểm duyệt chéo **Multi-Agent Review** và cơ chế can thiệp thủ công **Human-in-the-Loop** an toàn, tin cậy. Hệ thống bóc tách, so khớp và trả về **Báo cáo sai biệt (Compliance Report)** chỉ trong vài giây.

---

## ✨ Tính năng nổi bật của dự án

### 1. Luồng Thẩm Định Đa Tác Nhân (Multi-Agent Review)
Nhằm tăng độ chính xác tuyệt đối, tránh hiện tượng ảo giác của AI, hệ thống chia làm 2 giai đoạn:
- **Agent 1 (Extractor):** Sử dụng GPT-4o Vision phân tích trực tiếp hình ảnh trang PDF được chuyển đổi từ RAM, tiến hành OCR thô, bóc tách thông tin và đính kèm đoạn văn bản trích dẫn làm minh chứng.
- **Agent 2 (Auditor):** Đóng vai trò là Kiểm toán viên độc lập. Agent 2 nhận dữ liệu đề xuất từ Agent 1 và rà soát lại trực tiếp trên hình ảnh gốc để phát hiện, đính chính các lỗi sai lệch chữ số trước khi gửi đi đối chiếu.

### 2. Minh chứng AI minh bạch (Explainable AI)
Dưới mỗi trường thông tin thực tế bóc tách được, hệ thống hiển thị chính xác đoạn trích xuất gốc từ văn bản PDF (Ví dụ: *Trích dẫn gốc: "Invoice No: INV-2026/08"*). Điều này giúp kiểm soát viên ngân hàng ngay lập tức định vị và xác minh tính đúng đắn của dữ liệu bóc tách mà không cần đọc lại toàn bộ trang giấy.

### 3. Chỉ số tin cậy & AI có trách nhiệm (Confidence Score)
AI tự chấm điểm độ tự tin (Confidence Score từ 0% đến 100%) dựa trên độ rõ nét của chữ trên ảnh. Nếu chỉ số tự tin `< 80%` (ví dụ do mộc đỏ che khuất chữ), hệ thống sẽ nhấp nháy một nhãn cảnh báo **"⚠️ Kiểm tra lại"** ngay bên cạnh trường dữ liệu để báo hiệu con người cần thẩm định lại.

### 4. Can thiệp thủ công thời gian thực (Human-in-the-Loop)
Chuyên viên ngân hàng có thể click trực tiếp vào nút chỉnh sửa kế bên ô dữ liệu thực tế để sửa đổi. Khi lưu lại, hệ thống lập tức tự động đối chiếu lại theo thời gian thực và chuyển đổi trạng thái dòng đó từ Đỏ (Sai lệch) sang Xanh (Pass) khi thông tin khớp L/C, đồng thời đưa điểm tin cậy lên 100% (đã xác thực bởi con người).

### 5. Soạn thảo thư từ vướng mắc tự động (Auto-Waiver Drafter)
Khi phát hiện chứng từ có lỗi, hệ thống tự động gọi GPT-4o biên soạn một bức thư/Email song ngữ (Anh - Việt) chuyên nghiệp gửi cho người mua yêu cầu ký nhận đồng ý thanh toán bỏ qua lỗi (Waiver Letter), khép kín luồng tương tác nghiệp vụ.

### 6. Nhật ký vận hành (Audit Trail)
Mọi hành động (Upload file, AI bóc tách đa tác nhân, sửa đổi tay thủ công, ký duyệt) đều được hệ thống ghi nhận thời gian thực và hiển thị dưới dạng Timeline lịch sử ở cuối trang, đảm bảo tính minh bạch kiểm toán trong ngành tài chính.

### 7. Giả lập chữ ký số SmartCA
Cho phép người dùng thực hiện ký duyệt trực tuyến thông qua cổng kết nối VNPT SmartCA giả lập trong 2.5 giây, trả về mã giao dịch băm (TxHash) mã hóa độc bản.

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy nhanh

### Khởi chạy bằng Docker Compose (Khuyến nghị)
1. Tạo file `.env` từ file `.env.example`:
   ```bash
   cp .env.example .env
   ```
2. Mở file `.env` ra và cấu hình mã API Key của bạn:
   ```env
   OPENAI_API_KEY=sk-proj-xxxxxx...
   ```
3. Khởi chạy toàn bộ hệ thống bằng Docker Compose:
   ```bash
   docker compose up --build -d
   ```
4. Truy cập giao diện ứng dụng tại: `http://localhost:3000` (API Backend chạy tại `http://localhost:8000`).

### Khởi chạy thủ công (Chạy local từng phần)
Chi tiết cấu hình chạy local Python venv và Next.js dev server xem thêm tại hướng dẫn chi tiết của tệp [Architecture.md](file:///c:/Users/maitr/OneDrive/Máy tính/LC/Architecture.md).