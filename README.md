# 🏦 LC-Vision: AI-Powered Letter of Credit Document Checker

**Dự án tham dự Codex Community Hackathon — Hanoi 2026**
- **Track mục tiêu:** Track 1 (Market Scale) & Track 2 (Engineering Depth)
- **Công cụ cốt lõi:** Lập trình với Next.js (TypeScript) & FastAPI (Python), sử dụng mô hình GPT-4o Vision.

## 🎯 Vấn đề thực tế (The Problem)
Trong thương mại quốc tế, Thanh toán bằng Thư tín dụng (L/C - Letter of Credit) là phương thức an toàn nhưng cực kỳ rườm rà. Theo quy tắc UCP 600, các ngân hàng áp dụng nguyên tắc **"Tuân thủ nghiêm ngặt" (Strict Compliance)**. Một lỗi nhỏ (typo) cũng có thể dẫn đến việc từ chối thanh toán lô hàng hàng triệu USD. 
Hiện nay, kiểm soát viên phải đối chiếu bằng mắt hàng chục trang PDF với L/C gốc, tốn 3–5 ngày làm việc và dễ xảy ra sai sót do con người (Human Error) đặc biệt khi các hóa đơn, vận đơn bị scan mờ hoặc đóng dấu đỏ đè lên chữ.

## 💡 Giải pháp (The Solution)
**LC-Vision** là hệ thống tự động hóa việc đối chiếu chứng từ bằng Generative AI với độ chính xác cao nhờ kiến trúc Multi-Agent và hỗ trợ can thiệp thủ công (Human-in-the-Loop). Hệ thống render PDF thành hình ảnh JPG và nạp trực tiếp vào GPT-4o Vision để tự OCR, đối chiếu tự động và trả về báo cáo sai sót chỉ trong vài giây.

## ✨ Tính năng nổi bật
1. **Multi-Agent Review & GPT-4o Vision:** Xử lý qua 2 Agent độc lập nhìn trực tiếp hình ảnh chứng từ:
   - *Agent 1 (Extractor):* Sử dụng GPT-4o Vision đọc ảnh base64 được render từ trang đầu PDF qua `PyMuPDF` để tự động chạy OCR và bóc tách dữ liệu kèm trích dẫn gốc.
   - *Agent 2 (Auditor):* Kiểm toán viên độc lập rà soát chéo dữ liệu của Agent 1 với hình ảnh tài liệu gốc để đính chính các lỗi nhầm lẫn OCR trước khi đối chiếu.
2. **Explainable AI (Quotes):** Hiển thị minh chứng gốc dưới mỗi giá trị thực tế giúp chuyên viên dễ dàng xác minh nguồn dữ liệu bóc tách từ đâu trong văn bản PDF.
3. **Automated Discrepancy Checking:** Chạy các luật nghiệp vụ tự động đối chiếu các điều khoản L/C (Người thụ hưởng, số tiền, ngày giao hàng, tiền tệ, cảng bốc...).
4. **Human-in-the-Loop (HITL):** Cho phép người dùng chỉnh sửa trực tiếp giá trị bóc tách sai trên bảng đối chiếu. Hệ thống sẽ tự động so khớp lại theo thời gian thực và chuyển trạng thái từ đỏ sang xanh khi khớp.
5. **Auto-Waiver Drafter (Trợ lý tự hành):** Tự động soạn thảo email/SWIFT MT799 xin chấp nhận lỗi (Waiver Request) song ngữ Anh-Việt khi phát hiện có sai lệch trên chứng từ.
6. **Audit Trail (Nhật ký vận hành):** Ghi nhận dòng thời gian hoạt động chi tiết (từ lúc tải lên, hoàn thành bóc tách, chuyên viên chỉnh sửa thủ công đến lúc ký duyệt) đáp ứng tiêu chuẩn ngân hàng.
7. **SmartCA Mock Sign:** Tích hợp nút giả lập ký duyệt báo cáo qua cổng VNPT SmartCA kèm mã băm giao dịch (TxHash) bảo mật.

## 🚀 Hướng dẫn Chạy Dự Án

### Chạy bằng Docker (Khuyến nghị)
1. Copy file `.env.example` thành `.env`:
   ```bash
   cp .env.example .env
   ```
2. Mở file `.env` ra và điền API Key thật của bạn:
   ```env
   OPENAI_API_KEY=sk-proj-xxxxxx...
   ```
3. Khởi chạy toàn bộ hệ thống bằng Docker Compose:
   ```bash
   docker compose up --build -d
   ```
4. Truy cập giao diện tại: `http://localhost:3000` (API Backend chạy tại `http://localhost:8000`).

### Chạy Local (Không qua Docker)
Chi tiết xem tại tài liệu [Architecture.md](file:///c:/Users/maitr/OneDrive/Máy tính/LC/Architecture.md).